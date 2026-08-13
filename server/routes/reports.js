import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap } from './_helpers.js'

const r = Router()

// Brasil não observa horário de verão desde 2019: offset fixo de -3h (Brasília) para
// converter timestamps UTC (datetime('now')) no dia-calendário correto nos relatórios.
const BR_OFFSET_SQL = '-3 hours'
const today = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

// KPIs da tela inicial: faturamento e comandas de hoje, agenda de hoje, caixa.
r.get('/dashboard', wrap((req, res) => {
  const db = getDb()
  const d = today()
  const revenue = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM tickets WHERE status='closed' AND date(closedAt, '${BR_OFFSET_SQL}')=?`
  ).get(d)
  const appts = db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE date(startAt)=? AND status NOT IN ('canceled')").get(d)
  const openTickets = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status='open'").get()
  const cash = db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get()
  const nextAppts = db.prepare(
    `SELECT a.id, a.startAt, a.status, c.name AS clientName, b.name AS barberName, b.color AS barberColor, s.name AS serviceName
     FROM appointments a LEFT JOIN clients c ON c.id=a.clientId LEFT JOIN barbers b ON b.id=a.barberId
     LEFT JOIN services s ON s.id=a.serviceId
     WHERE date(a.startAt)=? AND a.status IN ('scheduled','confirmed') ORDER BY a.startAt LIMIT 8`
  ).all(d)
  const topBarbers = db.prepare(
    `SELECT b.name, b.color, COALESCE(SUM(i.total),0) AS revenue, COALESCE(SUM(i.commissionValue),0) AS commission
     FROM ticket_items i JOIN tickets t ON t.id=i.ticketId JOIN barbers b ON b.id=i.barberId
     WHERE t.status='closed' AND date(t.closedAt, '${BR_OFFSET_SQL}')=? GROUP BY b.id ORDER BY revenue DESC`
  ).all(d)
  res.json({
    date: d,
    revenueToday: revenue.total, ticketsToday: revenue.n,
    apptsToday: appts.n, openTickets: openTickets.n,
    cashOpen: !!cash, nextAppts, topBarbers,
  })
}))

// Financeiro por período: ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive).
r.get('/financial', wrap((req, res) => {
  const db = getDb()
  const from = String(req.query.from || today())
  const to = String(req.query.to || today())
  const cond = `t.status='closed' AND date(t.closedAt, '${BR_OFFSET_SQL}') BETWEEN ? AND ?`

  const totals = db.prepare(
    `SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount),0) AS discount, COUNT(*) AS tickets
     FROM tickets t WHERE ${cond}`
  ).get(from, to)

  const byMethod = db.prepare(
    `SELECT paymentMethod AS method, COALESCE(SUM(total),0) AS total, COUNT(*) AS n
     FROM tickets t WHERE ${cond} GROUP BY paymentMethod ORDER BY total DESC`
  ).all(from, to)

  const byDay = db.prepare(
    `SELECT date(closedAt, '${BR_OFFSET_SQL}') AS day, COALESCE(SUM(total),0) AS total, COUNT(*) AS n
     FROM tickets t WHERE ${cond} GROUP BY date(closedAt, '${BR_OFFSET_SQL}') ORDER BY day`
  ).all(from, to)

  const byBarber = db.prepare(
    `SELECT b.id, b.name, b.color,
            COALESCE(SUM(i.total),0) AS revenue,
            COALESCE(SUM(i.commissionValue),0) AS commission,
            COUNT(DISTINCT i.ticketId) AS tickets
     FROM ticket_items i JOIN tickets t ON t.id=i.ticketId JOIN barbers b ON b.id=i.barberId
     WHERE ${cond} GROUP BY b.id ORDER BY revenue DESC`
  ).all(from, to)

  const topServices = db.prepare(
    `SELECT i.description AS name, SUM(i.qty) AS qty, COALESCE(SUM(i.total),0) AS total
     FROM ticket_items i JOIN tickets t ON t.id=i.ticketId
     WHERE ${cond} AND i.kind='service' GROUP BY i.description ORDER BY total DESC LIMIT 10`
  ).all(from, to)

  const productRevenue = db.prepare(
    `SELECT COALESCE(SUM(i.total),0) AS total FROM ticket_items i JOIN tickets t ON t.id=i.ticketId
     WHERE ${cond} AND i.kind='product'`
  ).get(from, to)
  const serviceRevenue = db.prepare(
    `SELECT COALESCE(SUM(i.total),0) AS total FROM ticket_items i JOIN tickets t ON t.id=i.ticketId
     WHERE ${cond} AND i.kind='service'`
  ).get(from, to)

  res.json({
    from, to, totals, byMethod, byDay, byBarber, topServices,
    productRevenue: productRevenue.total, serviceRevenue: serviceRevenue.total,
    totalCommission: byBarber.reduce((s, b) => s + b.commission, 0),
  })
}))

export default r
