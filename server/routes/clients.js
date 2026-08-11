import { Router } from 'express'
import { getDb } from '../db.js'
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

r.delete('/:id', wrap((req, res) => {
  getDb().prepare('DELETE FROM clients WHERE id = ?').run(asInt(req.params.id))
  res.json({ ok: true })
}))

export default r
