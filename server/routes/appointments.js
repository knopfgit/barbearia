import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt } from './_helpers.js'

const r = Router()

const SELECT = `
  SELECT a.*, c.name AS clientName, c.phone AS clientPhone,
         b.name AS barberName, b.color AS barberColor,
         s.name AS serviceName
  FROM appointments a
  LEFT JOIN clients c ON c.id = a.clientId
  LEFT JOIN barbers b ON b.id = a.barberId
  LEFT JOIN services s ON s.id = a.serviceId
`

// Lista por dia (?date=YYYY-MM-DD) ou intervalo (?from=&to=). Opcional ?barberId.
r.get('/', wrap((req, res) => {
  const db = getDb()
  const { date, from, to, barberId } = req.query
  const cond = []
  const args = []
  if (date) { cond.push('date(a.startAt) = ?'); args.push(String(date)) }
  if (from) { cond.push('a.startAt >= ?'); args.push(String(from)) }
  if (to) { cond.push('a.startAt <= ?'); args.push(String(to)) }
  if (barberId) { cond.push('a.barberId = ?'); args.push(asInt(barberId)) }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  res.json(db.prepare(`${SELECT} ${where} ORDER BY a.startAt`).all(...args))
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { clientId, barberId, serviceId, startAt, notes } = req.body || {}
  if (!startAt) return res.status(400).json({ error: 'Informe data e hora.' })
  if (!barberId) return res.status(400).json({ error: 'Escolha o profissional.' })
  const service = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(asInt(serviceId)) : null
  const info = db.prepare(
    `INSERT INTO appointments (clientId, barberId, serviceId, startAt, durationMin, price, notes)
     VALUES (?,?,?,?,?,?,?)`
  ).run(clientId ? asInt(clientId) : null, asInt(barberId), service ? service.id : null,
    String(startAt), service ? service.durationMin : 30, service ? service.price : 0, notes || null)
  res.status(201).json(db.prepare(`${SELECT} WHERE a.id = ?`).get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Agendamento não encontrado.' })
  const { clientId, barberId, serviceId, startAt, notes, status } = req.body || {}
  let price = cur.price, dur = cur.durationMin, svcId = cur.serviceId
  if (serviceId !== undefined) {
    const s = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(asInt(serviceId)) : null
    svcId = s ? s.id : null; price = s ? s.price : 0; dur = s ? s.durationMin : cur.durationMin
  }
  db.prepare(
    `UPDATE appointments SET clientId=?, barberId=?, serviceId=?, startAt=?, durationMin=?, price=?, notes=?, status=? WHERE id=?`
  ).run(clientId !== undefined ? (clientId ? asInt(clientId) : null) : cur.clientId,
    barberId !== undefined ? (barberId ? asInt(barberId) : null) : cur.barberId,
    svcId, startAt || cur.startAt, dur, price,
    notes !== undefined ? notes : cur.notes, status || cur.status, id)
  res.json(db.prepare(`${SELECT} WHERE a.id = ?`).get(id))
}))

r.delete('/:id', wrap((req, res) => {
  getDb().prepare('DELETE FROM appointments WHERE id = ?').run(asInt(req.params.id))
  res.json({ ok: true })
}))

export default r
