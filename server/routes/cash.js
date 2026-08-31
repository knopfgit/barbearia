import { Router } from 'express'
import { getDb, runInTransaction } from '../db.js'
import { requireAdmin } from '../auth.js'
import { wrap, toCents, asInt, BR_OFFSET_SQL } from './_helpers.js'

const r = Router()

function currentSession(db) {
  return db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get()
}

// Soma dos movimentos da sessão, agrupada por forma de pagamento.
//
// O estorno de comanda ('refund') entra como venda NEGATIVA na própria forma de
// pagamento, em vez de sangria: estornar uma venda no cartão não pode tirar dinheiro
// da gaveta, que nunca recebeu esse valor. Como o esperado em dinheiro sai de
// byMethod['dinheiro'] (ver expectedCash), a gaveta só muda quando a venda estornada
// foi em dinheiro — que é o certo.
function summary(db, sessionId) {
  const rows = db.prepare(
    `SELECT method, type, SUM(amount) AS total, COUNT(*) AS n
     FROM cash_movements WHERE sessionId = ? GROUP BY method, type`
  ).all(sessionId)
  const byMethod = {}
  let salesTotal = 0, cashIn = 0, cashOut = 0, refundsTotal = 0
  for (const row of rows) {
    if (row.type === 'sale') { byMethod[row.method] = (byMethod[row.method] || 0) + row.total; salesTotal += row.total }
    if (row.type === 'refund') { byMethod[row.method] = (byMethod[row.method] || 0) - row.total; salesTotal -= row.total; refundsTotal += row.total }
    if (row.type === 'in') cashIn += row.total
    if (row.type === 'out') cashOut += row.total
  }
  return { byMethod, salesTotal, cashIn, cashOut, refundsTotal }
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
  // Grava uma tabela só, mas é LER-DEPOIS-GRAVAR: o esperado é somado dos movimentos e
  // depois gravado. Sem transação, uma venda lançada entre a soma e a gravação faria o
  // caixa fechar com um esperado já velho, e a diferença registrada seria falsa.
  const fechado = runInTransaction(db, () => {
    const expected = expectedCash(db, session)
    db.prepare(
      `UPDATE cash_sessions SET status='closed', closedBy=?, closedAt=datetime('now'),
       closingCounted=?, expectedCash=?, difference=?, notes=? WHERE id=?`
    ).run(req.user?.id || null, counted, expected, counted - expected, req.body?.notes || null, session.id)
    return { ...db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(session.id), expected, counted, difference: counted - expected }
  })
  res.json(fechado)
}))

// Consulta de fechamentos passados: é a conferência de dinheiro da casa, então fica
// restrita à administração — mesma régua do /close.
const HISTORY_SELECT = `SELECT c.*, uo.name AS openedByName, uc.name AS closedByName
   FROM cash_sessions c
   LEFT JOIN users uo ON uo.id = c.openedBy
   LEFT JOIN users uc ON uc.id = c.closedBy`

// ?from=YYYY-MM-DD&to=YYYY-MM-DD filtra pela data de FECHAMENTO (inclusive nas duas
// pontas). Sem filtro, segue devolvendo os mais recentes, como antes.
r.get('/history', requireAdmin, wrap((req, res) => {
  const db = getDb()
  const from = req.query.from ? String(req.query.from) : null
  const to = req.query.to ? String(req.query.to) : null
  if (!from && !to) {
    return res.json(db.prepare(`${HISTORY_SELECT} WHERE c.status='closed' ORDER BY c.id DESC LIMIT 60`).all())
  }
  // closedAt é UTC (datetime('now')): sem o -3h de Brasília, um caixa fechado depois
  // das 21h cairia no dia seguinte e sumiria do filtro do próprio dia. Mesmo corte
  // usado no Financeiro e no Estoque.
  res.json(db.prepare(
    `${HISTORY_SELECT} WHERE c.status='closed' AND date(c.closedAt, '${BR_OFFSET_SQL}') BETWEEN ? AND ?
     ORDER BY c.closedAt DESC, c.id DESC LIMIT 500`
  ).all(from || '0000-01-01', to || '9999-12-31'))
}))

// Detalhe de um fechamento: as movimentações daquela sessão e o resumo por forma de
// pagamento (a mesma soma que o /current mostra no caixa aberto).
r.get('/history/:id', requireAdmin, wrap((req, res) => {
  const db = getDb()
  const session = db.prepare(`${HISTORY_SELECT} WHERE c.id = ?`).get(asInt(req.params.id))
  if (!session) return res.status(404).json({ error: 'Fechamento de caixa não encontrado.' })
  const movements = db.prepare('SELECT * FROM cash_movements WHERE sessionId = ? ORDER BY id DESC').all(session.id)
  res.json({ session, summary: summary(db, session.id), movements })
}))

export default r
