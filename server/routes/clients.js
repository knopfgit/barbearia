import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAdmin } from '../auth.js'
import { wrap, asInt } from './_helpers.js'

const r = Router()

r.get('/', wrap((req, res) => {
  const db = getDb()
  const q = String(req.query.q || '').trim()
  let rows
  if (q) {
    const like = `%${q}%`
    rows = db.prepare('SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ? ORDER BY name').all(like, like)
  } else {
    rows = db.prepare('SELECT * FROM clients ORDER BY name').all()
  }
  res.json(rows)
}))

r.get('/:id', wrap((req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(asInt(req.params.id))
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' })
  const history = db.prepare(
    `SELECT t.id, t.closedAt, t.total, t.paymentMethod, b.name AS barber
     FROM tickets t LEFT JOIN barbers b ON b.id = t.barberId
     WHERE t.clientId = ? AND t.status = 'closed' ORDER BY t.closedAt DESC LIMIT 30`
  ).all(client.id)
  res.json({ ...client, history })
}))

/**
 * "O de sempre": o serviço habitual do cliente, calculado das ÚLTIMAS 5 comandas
 * fechadas dele. Vence o que apareceu em mais visitas; empatou, o da visita mais
 * recente. Conta VISITAS distintas, não itens — duas barbas na mesma comanda são
 * uma visita só. Produto não entra: o "de sempre" é o que ele senta pra fazer.
 *
 * Sem comanda fechada (cliente novo) ou sem serviço no histórico: null, e a tela
 * simplesmente não mostra sugestão nenhuma.
 */
r.get('/:id/usual', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Cliente não encontrado.' })
  }
  const visitas = db.prepare(
    "SELECT id FROM tickets WHERE clientId = ? AND status = 'closed' ORDER BY closedAt DESC, id DESC LIMIT 5"
  ).all(id)
  if (visitas.length === 0) return res.json(null)

  // Só serviço ATIVO: o catálogo da comanda também só lista ativos, e sugerir um
  // desativado ofereceria algo que não está na tela. Preço é o atual do serviço
  // (centavos), que é o que vai ser cobrado ao lançar o item.
  const marcadores = visitas.map(() => '?').join(',')
  const usual = db.prepare(
    `SELECT i.refId AS serviceId, s.name, s.price,
            COUNT(DISTINCT i.ticketId) AS visits
     FROM ticket_items i
     JOIN tickets t ON t.id = i.ticketId
     JOIN services s ON s.id = i.refId AND s.active = 1
     WHERE i.ticketId IN (${marcadores}) AND i.kind = 'service' AND i.refId IS NOT NULL
     GROUP BY i.refId
     ORDER BY visits DESC, MAX(t.closedAt) DESC, MAX(t.id) DESC
     LIMIT 1`
  ).get(...visitas.map((v) => v.id))
  if (!usual) return res.json(null)

  res.json({ ...usual, consideredVisits: visitas.length })
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { name, phone, email, birthdate, notes } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' })
  const info = db.prepare('INSERT INTO clients (name, phone, email, birthdate, notes) VALUES (?,?,?,?,?)')
    .run(name.trim(), phone || null, email || null, birthdate || null, notes || null)
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Cliente não encontrado.' })
  const { name, phone, email, birthdate, notes } = req.body || {}
  db.prepare('UPDATE clients SET name=?, phone=?, email=?, birthdate=?, notes=? WHERE id=?')
    .run(name?.trim() || cur.name, phone ?? cur.phone, email ?? cur.email, birthdate ?? cur.birthdate, notes ?? cur.notes, id)
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(id))
}))

// Excluir cliente leva junto, em cascata, os pontos de fidelidade e a fila dele —
// e some com histórico. Cadastrar e editar seguem liberados; apagar é da administração.
r.delete('/:id', requireAdmin, wrap((req, res) => {
  getDb().prepare('DELETE FROM clients WHERE id = ?').run(asInt(req.params.id))
  res.json({ ok: true })
}))

export default r
