import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, toCents, num, bool } from './_helpers.js'

const r = Router()

r.get('/', wrap((req, res) => {
  const all = req.query.all === '1'
  const sql = all ? 'SELECT * FROM products ORDER BY name' : 'SELECT * FROM products WHERE active = 1 ORDER BY name'
  res.json(getDb().prepare(sql).all())
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { name, sku, price, cost, stock, commissionPct } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do produto.' })
  const info = db.prepare('INSERT INTO products (name, sku, price, cost, stock, commissionPct) VALUES (?,?,?,?,?,?)')
    .run(name.trim(), sku || null, toCents(price), toCents(cost), asInt(stock, 0), num(commissionPct, 0))
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Produto não encontrado.' })
  const { name, sku, price, cost, stock, commissionPct, active } = req.body || {}
  db.prepare('UPDATE products SET name=?, sku=?, price=?, cost=?, stock=?, commissionPct=?, active=? WHERE id=?')
    .run(name?.trim() || cur.name, sku ?? cur.sku,
      price != null ? toCents(price) : cur.price, cost != null ? toCents(cost) : cur.cost,
      stock != null ? asInt(stock, cur.stock) : cur.stock,
      commissionPct != null ? num(commissionPct) : cur.commissionPct,
      active != null ? bool(active) : cur.active, id)
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id))
}))

export default r
