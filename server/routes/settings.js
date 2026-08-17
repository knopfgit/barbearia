import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAdmin } from '../auth.js'
import { wrap, hmToMin } from './_helpers.js'

const r = Router()
const DEFAULTS = {
  shopName: 'Barbearia Mattos', address: '', phone: '', accent: '#d95a26',
  openTime: '09:00', closeTime: '19:00', slotMinutes: '30',
  loyaltyEnabled: '1', loyaltyPointsPerReal: '1', loyaltyTierPrata: '10', loyaltyTierOuro: '25',
}

r.get('/', wrap((req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = { ...DEFAULTS }
  for (const row of rows) out[row.key] = row.value
  res.json(out)
}))

const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

// Expediente alimenta o cálculo de horários livres da Agenda (server/routes/appointments.js) —
// valor absurdo aqui (fechamento antes da abertura, slot <= 0) derrubava a agenda inteira
// (ou pior, travava o servidor num loop). Validado aqui pra pegar o erro na origem.
// Leitura é livre (a tela usa o nome da barbearia, o expediente etc.); ESCREVER é
// da administração — mexe em expediente, que rege a agenda, e nas regras de fidelidade.
r.put('/', requireAdmin, wrap((req, res) => {
  const db = getDb()
  const body = req.body || {}
  if (body.openTime != null && body.openTime !== '' && !HM_RE.test(body.openTime)) {
    return res.status(400).json({ error: 'Horário de abertura inválido.' })
  }
  if (body.closeTime != null && body.closeTime !== '' && !HM_RE.test(body.closeTime)) {
    return res.status(400).json({ error: 'Horário de fechamento inválido.' })
  }
  if (body.openTime && body.closeTime && HM_RE.test(body.openTime) && HM_RE.test(body.closeTime) && hmToMin(body.closeTime) <= hmToMin(body.openTime)) {
    return res.status(400).json({ error: 'O fechamento precisa ser depois da abertura.' })
  }
  if (body.slotMinutes != null && body.slotMinutes !== '') {
    const n = Number(body.slotMinutes)
    if (!Number.isFinite(n) || n < 5 || n > 240) return res.status(400).json({ error: 'Duração do slot deve ser entre 5 e 240 minutos.' })
  }
  if (body.loyaltyPointsPerReal != null && body.loyaltyPointsPerReal !== '') {
    const n = Number(body.loyaltyPointsPerReal)
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Pontos por real não pode ser negativo.' })
  }
  if (body.loyaltyTierPrata != null && body.loyaltyTierPrata !== '' && body.loyaltyTierOuro != null && body.loyaltyTierOuro !== '') {
    const p = Number(body.loyaltyTierPrata), o = Number(body.loyaltyTierOuro)
    if (!Number.isFinite(p) || p < 0 || !Number.isFinite(o) || o < 0) return res.status(400).json({ error: 'Visitas do nível precisa ser um número válido.' })
    if (o <= p) return res.status(400).json({ error: 'O nível ouro precisa exigir mais visitas que o prata.' })
  }
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [k, v] of Object.entries(body)) stmt.run(k, v == null ? '' : String(v))
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = { ...DEFAULTS }
  for (const row of rows) out[row.key] = row.value
  res.json(out)
}))

export default r
