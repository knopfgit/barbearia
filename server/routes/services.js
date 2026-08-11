import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, toCents, num, bool } from './_helpers.js'

const r = Router()

r.get('/', wrap((req, res) => {
  const all = req.query.all === '1'
  const sql = all ? 'SELECT * FROM services ORDER BY name' : 'SELECT * FROM services WHERE active = 1 ORDER BY name'
  res.json(getDb().prepare(sql).all())
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { name, price, durationMin, commissionPct } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do serviço.' })
  const info = db.prepare('INSERT INTO services (name, price, durationMin, commissionPct) VALUES (?,?,?,?)')
    .run(name.trim(), toCents(price), asInt(durationMin, 30), commissionPct === '' || commissionPct == null ? null : num(commissionPct))
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM services WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Serviço não encontrado.' })
  const { name, price, durationMin, commissionPct, active } = req.body || {}
  db.prepare('UPDATE services SET name=?, price=?, durationMin=?, commissionPct=?, active=? WHERE id=?')
    .run(name?.trim() || cur.name, price != null ? toCents(price) : cur.price,
      durationMin != null ? asInt(durationMin, cur.durationMin) : cur.durationMin,
      commissionPct === '' || commissionPct === null ? null : (commissionPct != null ? num(commissionPct) : cur.commissionPct),
      active != null ? bool(active) : cur.active, id)
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(id))
}))

export default r
