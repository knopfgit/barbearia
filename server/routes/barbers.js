import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, num, bool, clamp } from './_helpers.js'

const r = Router()

r.get('/', wrap((req, res) => {
  const all = req.query.all === '1'
  const sql = all ? 'SELECT * FROM barbers ORDER BY name' : 'SELECT * FROM barbers WHERE active = 1 ORDER BY name'
  res.json(getDb().prepare(sql).all())
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { name, phone, color, commissionPct } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do profissional.' })
  const info = db.prepare('INSERT INTO barbers (name, phone, color, commissionPct) VALUES (?,?,?,?)')
    .run(name.trim(), phone || null, color || '#c8a15a', clamp(num(commissionPct, 40), 0, 100))
  res.status(201).json(db.prepare('SELECT * FROM barbers WHERE id = ?').get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM barbers WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Profissional não encontrado.' })
  const { name, phone, color, commissionPct, active } = req.body || {}
  db.prepare('UPDATE barbers SET name=?, phone=?, color=?, commissionPct=?, active=? WHERE id=?')
    .run(name?.trim() || cur.name, phone ?? cur.phone, color || cur.color,
      commissionPct != null ? clamp(num(commissionPct), 0, 100) : cur.commissionPct,
      active != null ? bool(active) : cur.active, id)
  res.json(db.prepare('SELECT * FROM barbers WHERE id = ?').get(id))
}))

export default r
