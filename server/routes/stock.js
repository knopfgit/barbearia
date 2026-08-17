import { Router } from 'express'
import { getDb, runInTransaction } from '../db.js'
import { wrap, asInt, num } from './_helpers.js'

const r = Router()

// Alertas de estoque baixo (stock <= minStock), só produtos ativos e vendáveis/insumos.
r.get('/alerts', wrap((req, res) => {
  const rows = getDb().prepare(
    `SELECT id, name, sku, stock, minStock FROM products
     WHERE active = 1 AND minStock > 0 AND stock <= minStock ORDER BY (stock - minStock) ASC`
  ).all()
  res.json(rows)
}))

// Extrato de movimentações manuais (?productId= opcional).
r.get('/movements', wrap((req, res) => {
  const db = getDb()
  const { productId } = req.query
  const sql = `SELECT m.*, p.name AS productName, u.name AS userName FROM stock_movements m
               JOIN products p ON p.id = m.productId LEFT JOIN users u ON u.id = m.userId
               ${productId ? 'WHERE m.productId = ?' : ''} ORDER BY m.id DESC LIMIT 200`
  res.json(productId ? db.prepare(sql).all(asInt(productId)) : db.prepare(sql).all())
}))

// Lança entrada/saída/ajuste manual e já atualiza products.stock.
r.post('/movements', wrap((req, res) => {
  const db = getDb()
  const { productId, type, qty, newStock, reason } = req.body || {}
  const product = productId ? db.prepare('SELECT * FROM products WHERE id = ?').get(asInt(productId)) : null
  if (!product) return res.status(400).json({ error: 'Produto não encontrado.' })
  if (!['entrada', 'saida', 'ajuste'].includes(type)) return res.status(400).json({ error: 'Tipo de movimentação inválido.' })

  let delta
  if (type === 'ajuste') {
    if (newStock == null || newStock === '') return res.status(400).json({ error: 'Informe o novo estoque.' })
    delta = Math.round(num(newStock)) - product.stock
  } else {
    const q = Math.round(num(qty))
    if (!(q > 0)) return res.status(400).json({ error: 'Informe uma quantidade maior que zero.' })
    delta = type === 'entrada' ? q : -q
  }
  if (delta === 0) return res.status(400).json({ error: 'Essa movimentação não muda o estoque atual.' })

  // O saldo e o extrato são gravados juntos: sem transação, uma falha entre os dois
  // mudava o estoque sem deixar linha no extrato, e o inventário deixava de ser
  // reconciliável (a soma das movimentações não bateria com o saldo).
  const resultado = runInTransaction(db, () => {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, product.id)
    const info = db.prepare(
      'INSERT INTO stock_movements (productId, type, qty, reason, userId) VALUES (?,?,?,?,?)'
    ).run(product.id, type, delta, reason || null, req.user?.id || null)
    return {
      movement: db.prepare('SELECT * FROM stock_movements WHERE id = ?').get(info.lastInsertRowid),
      product: db.prepare('SELECT * FROM products WHERE id = ?').get(product.id),
    }
  })
  res.status(201).json(resultado)
}))

// Consumo de insumos por serviço num período (a partir do snapshot em ticket_item_consumables).
r.get('/consumption', wrap((req, res) => {
  const db = getDb()
  const from = String(req.query.from || '0000-01-01')
  const to = String(req.query.to || '9999-12-31')
  const rows = db.prepare(
    `SELECT tic.productName AS name, SUM(tic.qty) AS qty
     FROM ticket_item_consumables tic
     JOIN ticket_items ti ON ti.id = tic.ticketItemId
     JOIN tickets t ON t.id = ti.ticketId
     WHERE t.status = 'closed' AND date(t.closedAt, '-3 hours') BETWEEN ? AND ?
     GROUP BY tic.productName ORDER BY qty DESC`
  ).all(from, to)
  res.json(rows)
}))

export default r
