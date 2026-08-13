import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, toCents, num } from './_helpers.js'
import { creditLoyaltyForTicket } from './loyalty.js'

const r = Router()

// Ficha técnica: ao lançar um serviço na comanda, consome o insumo cadastrado em
// service_consumables e grava o snapshot em ticket_item_consumables (histórico não
// muda se a ficha técnica for editada depois).
function consumeForServiceItem(db, ticketItemId, serviceId, multiplier) {
  const recipe = db.prepare('SELECT * FROM service_consumables WHERE serviceId = ?').all(serviceId)
  for (const row of recipe) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(row.productId)
    if (!product) continue
    const qty = row.qty * multiplier
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, product.id)
    db.prepare('INSERT INTO ticket_item_consumables (ticketItemId, productId, productName, qty) VALUES (?,?,?,?)')
      .run(ticketItemId, product.id, product.name, qty)
  }
}
// Devolve ao estoque o que foi consumido por um item (remoção/cancelamento do item).
function reverseConsumablesForItem(db, ticketItemId) {
  const rows = db.prepare('SELECT * FROM ticket_item_consumables WHERE ticketItemId = ?').all(ticketItemId)
  for (const row of rows) {
    if (row.productId) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(row.qty, row.productId)
  }
}

function loadTicket(db, id) {
  const t = db.prepare(
    `SELECT t.*, c.name AS clientName, b.name AS barberName
     FROM tickets t LEFT JOIN clients c ON c.id = t.clientId
     LEFT JOIN barbers b ON b.id = t.barberId WHERE t.id = ?`
  ).get(id)
  if (!t) return null
  t.items = db.prepare(
    `SELECT i.*, b.name AS barberName FROM ticket_items i
     LEFT JOIN barbers b ON b.id = i.barberId WHERE i.ticketId = ? ORDER BY i.id`
  ).all(id)
  return t
}

// Recalcula subtotal/total a partir dos itens e do desconto atual.
function recompute(db, id) {
  const items = db.prepare('SELECT total FROM ticket_items WHERE ticketId = ?').all(id)
  const subtotal = items.reduce((s, i) => s + i.total, 0)
  const t = db.prepare('SELECT discount FROM tickets WHERE id = ?').get(id)
  const total = Math.max(0, subtotal - (t?.discount || 0))
  db.prepare('UPDATE tickets SET subtotal=?, total=? WHERE id=?').run(subtotal, total, id)
}

// Comissão: serviço usa % do serviço, e se for NULL cai na % do barbeiro.
// Produto usa a % própria do produto (0 por padrão).
function commissionPctFor(db, kind, ref, barberId) {
  const barber = barberId ? db.prepare('SELECT commissionPct FROM barbers WHERE id = ?').get(barberId) : null
  if (kind === 'service') {
    if (ref && ref.commissionPct != null) return ref.commissionPct
    return barber ? barber.commissionPct : 0
  }
  return ref ? (ref.commissionPct || 0) : 0
}

r.get('/', wrap((req, res) => {
  const status = req.query.status || 'open'
  const rows = getDb().prepare(
    `SELECT t.*, c.name AS clientName, b.name AS barberName FROM tickets t
     LEFT JOIN clients c ON c.id=t.clientId LEFT JOIN barbers b ON b.id=t.barberId
     WHERE t.status = ? ORDER BY t.openedAt DESC`
  ).all(String(status))
  res.json(rows)
}))

r.get('/:id', wrap((req, res) => {
  const t = loadTicket(getDb(), asInt(req.params.id))
  if (!t) return res.status(404).json({ error: 'Comanda não encontrada.' })
  res.json(t)
}))

// Abre uma comanda (walk-in ou a partir de um agendamento).
r.post('/', wrap((req, res) => {
  const db = getDb()
  const { clientId, barberId, appointmentId } = req.body || {}
  const info = db.prepare('INSERT INTO tickets (clientId, barberId, appointmentId) VALUES (?,?,?)')
    .run(clientId ? asInt(clientId) : null, barberId ? asInt(barberId) : null, appointmentId ? asInt(appointmentId) : null)
  const id = info.lastInsertRowid
  // Se veio de um agendamento, já adiciona o serviço agendado como item.
  if (appointmentId) {
    const ap = db.prepare('SELECT * FROM appointments WHERE id = ?').get(asInt(appointmentId))
    if (ap && ap.serviceId) {
      const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(ap.serviceId)
      // Não passar unitPrice aqui: svc.price já está em centavos, e addItem() chama toCents()
      // (que espera reais) quando unitPrice vem preenchido — passar de novo multiplicaria por 100.
      if (svc) addItem(db, id, { kind: 'service', refId: svc.id, description: svc.name, barberId: ap.barberId, qty: 1 })
    }
    db.prepare("UPDATE appointments SET status='done' WHERE id=?").run(asInt(appointmentId))
  }
  recompute(db, id)
  res.status(201).json(loadTicket(db, id))
}))

function addItem(db, ticketId, { kind, refId, description, barberId, qty, unitPrice }) {
  let ref = null
  if (kind === 'service' && refId) ref = db.prepare('SELECT * FROM services WHERE id = ?').get(asInt(refId))
  if (kind === 'product' && refId) ref = db.prepare('SELECT * FROM products WHERE id = ?').get(asInt(refId))
  const q = Math.max(1, asInt(qty, 1))
  const unit = unitPrice != null ? toCents(unitPrice) : (ref ? ref.price : 0)
  const total = unit * q
  const pct = commissionPctFor(db, kind, ref, barberId ? asInt(barberId) : null)
  const commissionValue = Math.round(total * pct / 100)
  const info = db.prepare(
    `INSERT INTO ticket_items (ticketId, kind, refId, description, barberId, qty, unitPrice, total, commissionPct, commissionValue)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(ticketId, kind, refId ? asInt(refId) : null, description || (ref ? ref.name : 'Item'),
    barberId ? asInt(barberId) : null, q, unit, total, pct, commissionValue)
  if (kind === 'product' && ref) db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(q, ref.id)
  if (kind === 'service' && ref) consumeForServiceItem(db, info.lastInsertRowid, ref.id, q)
}

r.post('/:id/items', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  addItem(db, id, req.body || {})
  recompute(db, id)
  res.status(201).json(loadTicket(db, id))
}))

r.delete('/:id/items/:itemId', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const item = db.prepare('SELECT * FROM ticket_items WHERE id = ? AND ticketId = ?').get(asInt(req.params.itemId), id)
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' })
  if (item.kind === 'product' && item.refId) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.refId)
  if (item.kind === 'service') reverseConsumablesForItem(db, item.id)
  db.prepare('DELETE FROM ticket_items WHERE id = ?').run(item.id)
  recompute(db, id)
  res.json(loadTicket(db, id))
}))

// Ajusta desconto / cliente / barbeiro principal da comanda.
r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  const { discount, clientId, barberId, notes } = req.body || {}
  if (discount != null && toCents(discount) < 0) return res.status(400).json({ error: 'Desconto não pode ser negativo.' })
  db.prepare('UPDATE tickets SET discount=?, clientId=?, barberId=?, notes=? WHERE id=?')
    .run(discount != null ? toCents(discount) : t.discount,
      clientId !== undefined ? (clientId ? asInt(clientId) : null) : t.clientId,
      barberId !== undefined ? (barberId ? asInt(barberId) : null) : t.barberId,
      notes !== undefined ? notes : t.notes, id)
  recompute(db, id)
  res.json(loadTicket(db, id))
}))

// Fecha a comanda: registra pagamento e lança no caixa aberto.
r.post('/:id/checkout', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  const { paymentMethod } = req.body || {}
  if (!paymentMethod) return res.status(400).json({ error: 'Escolha a forma de pagamento.' })
  const session = db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get()
  if (!session) return res.status(400).json({ error: 'Abra o caixa antes de fechar comandas.' })
  recompute(db, id)
  const fresh = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  db.prepare("UPDATE tickets SET status='closed', paymentMethod=?, cashSessionId=?, closedAt=datetime('now') WHERE id=?")
    .run(String(paymentMethod), session.id, id)
  db.prepare('INSERT INTO cash_movements (sessionId, type, amount, method, description, ticketId, userId) VALUES (?,?,?,?,?,?,?)')
    .run(session.id, 'sale', fresh.total, String(paymentMethod), `Comanda #${id}`, id, req.user?.id || null)
  creditLoyaltyForTicket(db, fresh)
  res.json(loadTicket(db, id))
}))

r.post('/:id/cancel', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  // devolve estoque dos produtos e dos insumos consumidos por serviços
  for (const it of db.prepare("SELECT * FROM ticket_items WHERE ticketId=?").all(id)) {
    if (it.kind === 'product' && it.refId) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty, it.refId)
    if (it.kind === 'service') reverseConsumablesForItem(db, it.id)
  }
  db.prepare("UPDATE tickets SET status='canceled' WHERE id=?").run(id)
  res.json({ ok: true })
}))

export default r
