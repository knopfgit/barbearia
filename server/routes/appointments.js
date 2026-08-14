import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, clamp, hmToMin } from './_helpers.js'
import { isBarberBlocked } from './timeblocks.js'

const r = Router()

// Expediente padrão da barbearia, lido de `settings` (mesmas chaves da tela de Configurações).
// Defesa em profundidade: mesmo que um valor absurdo tenha sido salvo (ex.: slotMinutes
// negativo, fechamento antes da abertura), aqui sempre voltamos pra algo seguro — o loop de
// geração de slots em /slots depende de slotMinutes > 0 e closeMin > openMin pra não travar.
function getWorkHours(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('openTime','closeTime','slotMinutes')").all()
  const s = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  let openMin = hmToMin(s.openTime) ?? 9 * 60
  let closeMin = hmToMin(s.closeTime) ?? 19 * 60
  if (closeMin <= openMin) { openMin = 9 * 60; closeMin = 19 * 60 }
  const slotMinutes = clamp(asInt(s.slotMinutes, 30) || 30, 5, 240)
  return { openMin, closeMin, slotMinutes }
}
function minToHm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
// Verifica bloqueio de horário do barbeiro (almoço/folga/intervalo/outro); retorna
// mensagem de erro em português, ou null se o horário está livre.
function blockedMessage(db, barberId, startAt, durationMin) {
  const startMin = hmToMin(String(startAt).slice(11, 16))
  if (startMin == null) return null
  const endAtISO = `${String(startAt).slice(0, 10)}T${minToHm(startMin + durationMin)}:00`
  const blocked = isBarberBlocked(db, barberId, String(startAt), endAtISO)
  if (!blocked) return null
  const barber = db.prepare('SELECT name FROM barbers WHERE id = ?').get(barberId)
  return `${barber?.name || 'O profissional'} está indisponível nesse horário (${blocked.reasonLabel}).`
}
// Verifica se o horário colide com outro agendamento não cancelado do mesmo barbeiro
// (double-booking); retorna mensagem de erro em português, ou null se está livre.
function conflictMessage(db, barberId, startAt, durationMin, excludeId) {
  const dateStr = String(startAt).slice(0, 10)
  const startMin = hmToMin(String(startAt).slice(11, 16))
  if (startMin == null) return null
  const busy = mergeIntervals(busyByDay(db, barberId, dateStr.slice(0, 7), durationMin, excludeId)[dateStr] || [])
  const endMin = startMin + durationMin
  const overlaps = busy.some(([s, e]) => startMin < e && endMin > s)
  if (!overlaps) return null
  const barber = db.prepare('SELECT name FROM barbers WHERE id = ?').get(barberId)
  return `${barber?.name || 'O profissional'} já tem outro agendamento nesse horário.`
}
// Brasil não observa horário de verão desde 2019: offset fixo de -3h.
function nowBR() { return new Date(Date.now() - 3 * 3600 * 1000) }
function todayBR() { return nowBR().toISOString().slice(0, 10) }
function nowMinBR() { const d = nowBR(); return d.getUTCHours() * 60 + d.getUTCMinutes() }
// Intervalos ocupados (minutos desde 00:00) por dia, a partir de agendamentos não cancelados
// de um barbeiro num mês (YYYY-MM). startAt é gravado como horário local ("YYYY-MM-DDTHH:MM:SS").
function busyByDay(db, barberId, month, slotMinutes, excludeId) {
  const rows = excludeId
    ? db.prepare(
        `SELECT startAt, durationMin FROM appointments
         WHERE barberId = ? AND status != 'canceled' AND substr(startAt,1,7) = ? AND id != ?`
      ).all(barberId, month, excludeId)
    : db.prepare(
        `SELECT startAt, durationMin FROM appointments
         WHERE barberId = ? AND status != 'canceled' AND substr(startAt,1,7) = ?`
      ).all(barberId, month)
  const byDay = {}
  for (const row of rows) {
    const day = row.startAt.slice(0, 10)
    const hm = hmToMin(row.startAt.slice(11, 16))
    if (hm == null) continue
    const dur = row.durationMin || slotMinutes
    ;(byDay[day] ||= []).push([hm, hm + dur])
  }
  return byDay
}
// Mescla intervalos sobrepostos/adjacentes, ordenados por início.
function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

const SELECT = `
  SELECT a.*, c.name AS clientName, c.phone AS clientPhone,
         b.name AS barberName, b.color AS barberColor,
         s.name AS serviceName
  FROM appointments a
  LEFT JOIN clients c ON c.id = a.clientId
  LEFT JOIN barbers b ON b.id = a.barberId
  LEFT JOIN services s ON s.id = a.serviceId
`

// Disponibilidade por dia num mês, para o mini-calendário: ?barberId=&month=YYYY-MM.
// 'cheio' = nenhum intervalo livre >= duração de 1 slot dentro do expediente; senão 'livre'.
r.get('/availability', wrap((req, res) => {
  const db = getDb()
  const barberId = asInt(req.query.barberId)
  const month = String(req.query.month || '')
  if (!barberId || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Informe barberId e month (YYYY-MM).' })
  const excludeId = req.query.excludeId ? asInt(req.query.excludeId) : null
  const { openMin, closeMin, slotMinutes } = getWorkHours(db)
  const byDay = busyByDay(db, barberId, month, slotMinutes, excludeId)
  const daysInMonth = new Date(asInt(month.slice(0, 4)), asInt(month.slice(5, 7)), 0).getDate()
  const days = {}
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${month}-${String(day).padStart(2, '0')}`
    const merged = mergeIntervals(byDay[key] || [])
    let cursor = openMin
    let hasGap = false
    for (const [s, e] of merged) {
      if (s - cursor >= slotMinutes) { hasGap = true; break }
      cursor = Math.max(cursor, e)
    }
    if (!hasGap && closeMin - cursor >= slotMinutes) hasGap = true
    days[key] = hasGap ? 'livre' : 'cheio'
  }
  res.json({ openTime: minToHm(openMin), closeTime: minToHm(closeMin), slotMinutes, days })
}))

// Horários livres de um dia p/ um barbeiro: ?barberId=&date=YYYY-MM-DD&durationMin= (opcional).
r.get('/slots', wrap((req, res) => {
  const db = getDb()
  const barberId = asInt(req.query.barberId)
  const date = String(req.query.date || '')
  if (!barberId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Informe barberId e date (YYYY-MM-DD).' })
  const excludeId = req.query.excludeId ? asInt(req.query.excludeId) : null
  const { openMin, closeMin, slotMinutes } = getWorkHours(db)
  const duration = asInt(req.query.durationMin) || slotMinutes
  const busy = mergeIntervals(busyByDay(db, barberId, date.slice(0, 7), slotMinutes, excludeId)[date] || [])
  const nowFloor = date === todayBR() ? nowMinBR() : -1
  const slots = []
  for (let start = openMin; start + duration <= closeMin; start += slotMinutes) {
    if (start < nowFloor) continue
    const free = !busy.some(([s, e]) => start < e && start + duration > s)
    if (free) slots.push(minToHm(start))
  }
  res.json(slots)
}))

// Lista por dia (?date=YYYY-MM-DD) ou intervalo (?from=&to=). Opcional ?barberId.
r.get('/', wrap((req, res) => {
  const db = getDb()
  const { date, from, to, barberId } = req.query
  const cond = []
  const args = []
  if (date) { cond.push('date(a.startAt) = ?'); args.push(String(date)) }
  if (from) { cond.push('a.startAt >= ?'); args.push(String(from)) }
  if (to) { cond.push('a.startAt <= ?'); args.push(String(to)) }
  if (barberId) { cond.push('a.barberId = ?'); args.push(asInt(barberId)) }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  res.json(db.prepare(`${SELECT} ${where} ORDER BY a.startAt`).all(...args))
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { clientId, barberId, serviceId, startAt, notes } = req.body || {}
  if (!startAt) return res.status(400).json({ error: 'Informe data e hora.' })
  if (!barberId) return res.status(400).json({ error: 'Escolha o profissional.' })
  const service = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(asInt(serviceId)) : null
  const durationMin = service ? service.durationMin : 30
  const blockErr = blockedMessage(db, asInt(barberId), startAt, durationMin)
  if (blockErr) return res.status(400).json({ error: blockErr })
  const conflictErr = conflictMessage(db, asInt(barberId), startAt, durationMin, null)
  if (conflictErr) return res.status(400).json({ error: conflictErr })
  const info = db.prepare(
    `INSERT INTO appointments (clientId, barberId, serviceId, startAt, durationMin, price, notes)
     VALUES (?,?,?,?,?,?,?)`
  ).run(clientId ? asInt(clientId) : null, asInt(barberId), service ? service.id : null,
    String(startAt), durationMin, service ? service.price : 0, notes || null)
  res.status(201).json(db.prepare(`${SELECT} WHERE a.id = ?`).get(info.lastInsertRowid))
}))

r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Agendamento não encontrado.' })
  const { clientId, barberId, serviceId, startAt, notes, status } = req.body || {}
  let price = cur.price, dur = cur.durationMin, svcId = cur.serviceId
  if (serviceId !== undefined) {
    const s = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(asInt(serviceId)) : null
    svcId = s ? s.id : null; price = s ? s.price : 0; dur = s ? s.durationMin : cur.durationMin
  }
  const newBarberId = barberId !== undefined ? (barberId ? asInt(barberId) : null) : cur.barberId
  const newStartAt = startAt || cur.startAt
  if (newBarberId && (newBarberId !== cur.barberId || newStartAt !== cur.startAt)) {
    const blockErr = blockedMessage(db, newBarberId, newStartAt, dur)
    if (blockErr) return res.status(400).json({ error: blockErr })
    const conflictErr = conflictMessage(db, newBarberId, newStartAt, dur, id)
    if (conflictErr) return res.status(400).json({ error: conflictErr })
  }
  db.prepare(
    `UPDATE appointments SET clientId=?, barberId=?, serviceId=?, startAt=?, durationMin=?, price=?, notes=?, status=? WHERE id=?`
  ).run(clientId !== undefined ? (clientId ? asInt(clientId) : null) : cur.clientId,
    barberId !== undefined ? (barberId ? asInt(barberId) : null) : cur.barberId,
    svcId, startAt || cur.startAt, dur, price,
    notes !== undefined ? notes : cur.notes, status || cur.status, id)
  res.json(db.prepare(`${SELECT} WHERE a.id = ?`).get(id))
}))

r.delete('/:id', wrap((req, res) => {
  getDb().prepare('DELETE FROM appointments WHERE id = ?').run(asInt(req.params.id))
  res.json({ ok: true })
}))

export default r
