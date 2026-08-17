import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAdmin } from '../auth.js'
import { wrap, toCents, asInt } from './_helpers.js'

const r = Router()

function currentSession(db) {
  return db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get()
}

// Soma dos movimentos da sessão, agrupada por forma de pagamento.
function summary(db, sessionId) {
  const rows = db.prepare(
    `SELECT method, type, SUM(amount) AS total, COUNT(*) AS n
     FROM cash_movements WHERE sessionId = ? GROUP BY method, type`
  ).all(sessionId)
  const byMethod = {}
  let salesTotal = 0, cashIn = 0, cashOut = 0
  for (const row of rows) {
    if (row.type === 'sale') { byMethod[row.method] = (byMethod[row.method] || 0) + row.total; salesTotal += row.total }
    if (row.type === 'in') cashIn += row.total
    if (row.type === 'out') cashOut += row.total
  }
  return { byMethod, salesTotal, cashIn, cashOut }
}

// Esperado em dinheiro = troco inicial + vendas em dinheiro + reforços - sangrias.
function expectedCash(db, session) {
  const s = summary(db, session.id)
  return session.openingFloat + (s.byMethod['dinheiro'] || 0) + s.cashIn - s.cashOut
}

r.get('/current', wrap((req, res) => {
  const db = getDb()
  const session = currentSession(db)
  if (!session) return res.json({ open: false })
  const s = summary(db, session.id)
  const movements = db.prepare('SELECT * FROM cash_movements WHERE sessionId = ? ORDER BY id DESC').all(session.id)
  res.json({ open: true, session, summary: s, expectedCash: expectedCash(db, session), movements })
}))

r.post('/open', wrap((req, res) => {
  const db = getDb()
  if (currentSession(db)) return res.status(400).json({ error: 'Já existe um caixa aberto.' })
  const openingFloat = toCents(req.body?.openingFloat)
  if (openingFloat < 0) return res.status(400).json({ error: 'Troco inicial não pode ser negativo.' })
  const info = db.prepare('INSERT INTO cash_sessions (openedBy, openingFloat) VALUES (?,?)')
    .run(req.user?.id || null, openingFloat)
  res.status(201).json(db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(info.lastInsertRowid))
}))

// Reforço (in) ou sangria (out).
r.post('/movement', wrap((req, res) => {
  const db = getDb()
  const session = currentSession(db)
  if (!session) return res.status(400).json({ error: 'Nenhum caixa aberto.' })
  const { type, amount, description } = req.body || {}
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'Tipo inválido.' })
  const amountCents = toCents(amount)
  if (amountCents <= 0) return res.status(400).json({ error: 'Informe um valor maior que zero.' })
  db.prepare('INSERT INTO cash_movements (sessionId, type, amount, method, description, userId) VALUES (?,?,?,?,?,?)')
    .run(session.id, type, amountCents, 'dinheiro', description || (type === 'in' ? 'Reforço' : 'Sangria'), req.user?.id || null)
  res.status(201).json({ ok: true })
}))

// Fechar o caixa é conferência de dinheiro e grava a diferença no histórico:
// abrir e lançar movimento seguem liberados pro balcão, fechar é da administração.
r.post('/close', requireAdmin, wrap((req, res) => {
  const db = getDb()
  const session = currentSession(db)
  if (!session) return res.status(400).json({ error: 'Nenhum caixa aberto.' })
  const counted = toCents(req.body?.closingCounted)
  const expected = expectedCash(db, session)
  db.prepare(
    `UPDATE cash_sessions SET status='closed', closedBy=?, closedAt=datetime('now'),
     closingCounted=?, expectedCash=?, difference=?, notes=? WHERE id=?`
  ).run(req.user?.id || null, counted, expected, counted - expected, req.body?.notes || null, session.id)
  res.json({ ...db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(session.id), expected, counted, difference: counted - expected })
}))

r.get('/history', wrap((req, res) => {
  res.json(getDb().prepare("SELECT * FROM cash_sessions WHERE status='closed' ORDER BY id DESC LIMIT 60").all())
}))

export default r
