import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, toCents, num, bool, clamp } from './_helpers.js'

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
  const priceCents = toCents(price)
  if (priceCents < 0) return res.status(400).json({ error: 'Preço não pode ser negativo.' })
  const info = db.prepare('INSERT INTO services (name, price, durationMin, commissionPct) VALUES (?,?,?,?)')
    .run(name.trim(), priceCents, asInt(durationMin, 30), commissionPct === '' || commissionPct == null ? null : clamp(num(commissionPct), 0, 100))
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM services WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Serviço não encontrado.' })
  const { name, price, durationMin, commissionPct, active } = req.body || {}
  if (price != null && toCents(price) < 0) return res.status(400).json({ error: 'Preço não pode ser negativo.' })
  db.prepare('UPDATE services SET name=?, price=?, durationMin=?, commissionPct=?, active=? WHERE id=?')
    .run(name?.trim() || cur.name, price != null ? toCents(price) : cur.price,
      durationMin != null ? asInt(durationMin, cur.durationMin) : cur.durationMin,
      commissionPct === '' || commissionPct === null ? null : (commissionPct != null ? clamp(num(commissionPct), 0, 100) : cur.commissionPct),
      active != null ? bool(active) : cur.active, id)
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(id))
}))

// Ficha técnica: quais produtos/insumos o serviço consome por execução.
r.get('/:id/consumables', wrap((req, res) => {
  const rows = getDb().prepare(
    `SELECT sc.id, sc.productId, sc.qty, p.name AS productName, p.stock AS productStock
     FROM service_consumables sc JOIN products p ON p.id = sc.productId
     WHERE sc.serviceId = ? ORDER BY p.name`
  ).all(asInt(req.params.id))
  res.json(rows)
}))

r.post('/:id/consumables', wrap((req, res) => {
  const db = getDb()
  const serviceId = asInt(req.params.id)
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId)
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' })
  const { productId, qty } = req.body || {}
  const product = productId ? db.prepare('SELECT * FROM products WHERE id = ?').get(asInt(productId)) : null
  if (!product) return res.status(400).json({ error: 'Escolha um produto/insumo.' })
  const q = Math.max(1, asInt(qty, 1))
  const info = db.prepare('INSERT INTO service_consumables (serviceId, productId, qty) VALUES (?,?,?)').run(serviceId, product.id, q)
  res.status(201).json({ id: info.lastInsertRowid, productId: product.id, productName: product.name, productStock: product.stock, qty: q })
}))

r.delete('/:id/consumables/:rowId', wrap((req, res) => {
  getDb().prepare('DELETE FROM service_consumables WHERE id = ? AND serviceId = ?').run(asInt(req.params.rowId), asInt(req.params.id))
  res.json({ ok: true })
}))

export default r
