import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAdmin } from '../auth.js'
import { wrap, asInt, num } from './_helpers.js'

const r = Router()

// Config de fidelidade, lida de `settings` (mesmas chaves da tela de Configurações).
function getLoyaltySettings(db) {
  const rows = db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('loyaltyEnabled','loyaltyPointsPerReal','loyaltyTierPrata','loyaltyTierOuro')"
  ).all()
  const s = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return {
    enabled: s.loyaltyEnabled == null ? true : s.loyaltyEnabled === '1' || s.loyaltyEnabled === 'true',
    pointsPerReal: num(s.loyaltyPointsPerReal, 1) || 1,
    tierPrata: asInt(s.loyaltyTierPrata, 10) || 10,
    tierOuro: asInt(s.loyaltyTierOuro, 25) || 25,
  }
}

function tierFor(visits, cfg) {
  if (visits >= cfg.tierOuro) return 'ouro'
  if (visits >= cfg.tierPrata) return 'prata'
  return 'bronze'
}

// Credita pontos automaticamente no checkout de uma comanda com cliente vinculado.
// Chamado por tickets.js — não expõe rota própria, é só uma função auxiliar.
export function creditLoyaltyForTicket(db, ticket) {
  const cfg = getLoyaltySettings(db)
  if (!cfg.enabled || !ticket.clientId || !(ticket.total > 0)) return
  const points = Math.floor((ticket.total / 100) * cfg.pointsPerReal)
  if (points <= 0) return
  db.prepare('INSERT INTO loyalty_movements (clientId, type, points, reason, ticketId) VALUES (?,?,?,?,?)')
    .run(ticket.clientId, 'credito', points, `Comanda #${ticket.id}`, ticket.id)
}

r.get('/clients', wrap((req, res) => {
  const db = getDb()
  const cfg = getLoyaltySettings(db)
  const rows = db.prepare(
    `SELECT c.id, c.name, c.phone,
            COALESCE((SELECT COUNT(*) FROM tickets t WHERE t.clientId = c.id AND t.status = 'closed'), 0) AS visits,
            COALESCE((SELECT SUM(CASE WHEN type='credito' THEN points ELSE -points END) FROM loyalty_movements WHERE clientId = c.id), 0) AS points
     FROM clients c ORDER BY points DESC, c.name`
  ).all()
  res.json({ settings: cfg, clients: rows.map((c) => ({ ...c, tier: tierFor(c.visits, cfg) })) })
}))

r.get('/clients/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const client = db.prepare('SELECT id, name, phone FROM clients WHERE id = ?').get(id)
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })
  const cfg = getLoyaltySettings(db)
  const visits = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE clientId = ? AND status = 'closed'").get(id).n
  const movements = db.prepare('SELECT * FROM loyalty_movements WHERE clientId = ? ORDER BY id DESC LIMIT 50').all(id)
  const points = movements.reduce((s, m) => s + (m.type === 'credito' ? m.points : -m.points), 0)
  res.json({ client, visits, tier: tierFor(visits, cfg), points, movements })
}))

// Ajuste manual (crédito ou débito de pontos), com motivo.
// Ajuste manual de pontos vira dinheiro em resgate: só administração.
r.post('/adjust', requireAdmin, wrap((req, res) => {
  const db = getDb()
  const { clientId, type, points, reason } = req.body || {}
  const client = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(asInt(clientId)) : null
  if (!client) return res.status(400).json({ error: 'Escolha um cliente.' })
  if (!['credito', 'debito'].includes(type)) return res.status(400).json({ error: 'Tipo inválido.' })
  const p = Math.round(num(points))
  if (!(p > 0)) return res.status(400).json({ error: 'Informe uma quantidade de pontos maior que zero.' })
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Informe o motivo do ajuste.' })
  db.prepare('INSERT INTO loyalty_movements (clientId, type, points, reason, userId) VALUES (?,?,?,?,?)')
    .run(client.id, type, p, reason.trim(), req.user?.id || null)
  res.status(201).json({ ok: true })
}))

export default r
