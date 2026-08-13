import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, toCents, num, bool, clamp } from './_helpers.js'

const r = Router()

r.get('/', wrap((req, res) => {
  const all = req.query.all === '1'
  const sql = all ? 'SELECT * FROM products ORDER BY name' : 'SELECT * FROM products WHERE active = 1 ORDER BY name'
  res.json(getDb().prepare(sql).all())
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { name, sku, price, cost, stock, minStock, commissionPct } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do produto.' })
  const priceCents = toCents(price), costCents = toCents(cost)
  if (priceCents < 0 || costCents < 0) return res.status(400).json({ error: 'Preço e custo não podem ser negativos.' })
  const info = db.prepare('INSERT INTO products (name, sku, price, cost, stock, minStock, commissionPct) VALUES (?,?,?,?,?,?,?)')
    .run(name.trim(), sku || null, priceCents, costCents, asInt(stock, 0), Math.max(0, asInt(minStock, 0)), clamp(num(commissionPct, 0), 0, 100))
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Produto não encontrado.' })
  const { name, sku, price, cost, stock, minStock, commissionPct, active } = req.body || {}
  if ((price != null && toCents(price) < 0) || (cost != null && toCents(cost) < 0)) {
    return res.status(400).json({ error: 'Preço e custo não podem ser negativos.' })
  }
  db.prepare('UPDATE products SET name=?, sku=?, price=?, cost=?, stock=?, minStock=?, commissionPct=?, active=? WHERE id=?')
    .run(name?.trim() || cur.name, sku ?? cur.sku,
      price != null ? toCents(price) : cur.price, cost != null ? toCents(cost) : cur.cost,
      stock != null ? asInt(stock, cur.stock) : cur.stock,
      minStock != null ? Math.max(0, asInt(minStock, cur.minStock)) : cur.minStock,
      commissionPct != null ? clamp(num(commissionPct), 0, 100) : cur.commissionPct,
      active != null ? bool(active) : cur.active, id)
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id))
}))

export default r
