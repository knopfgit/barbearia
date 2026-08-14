import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap, asInt, hmToMin } from './_helpers.js'

const r = Router()

const REASONS = ['almoco', 'folga', 'intervalo', 'outro']
export const REASON_LABELS = { almoco: 'Almoço', folga: 'Folga', intervalo: 'Intervalo', outro: 'Bloqueio' }
const RECURRENCES = ['none', 'daily', 'weekly']

function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function validateBlockInput({ barberId, reason, recurrence, weekday, date, startTime, endTime }) {
  if (!barberId) return 'Escolha o profissional.'
  if (!REASONS.includes(reason)) return 'Motivo inválido.'
  if (!RECURRENCES.includes(recurrence)) return 'Recorrência inválida.'
  const s = hmToMin(startTime), e = hmToMin(endTime)
  if (s == null || e == null) return 'Informe horário de início e fim (HH:MM).'
  if (e <= s) return 'O horário final deve ser depois do início.'
  if (recurrence === 'none' && !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return 'Informe a data do bloqueio.'
  if (recurrence === 'weekly') {
    const wd = asInt(weekday, -1)
    if (wd < 0 || wd > 6) return 'Escolha o dia da semana.'
  }
  return null
}

// Regras aplicáveis a um dia (pontual na data / diária dentro da vigência / semanal no
// weekday certo dentro da vigência), já com a exceção do dia resolvida: skip remove o
// bloqueio, override troca o horário. Uma exceção sempre vence a regra recorrente.
export function resolveBlocksForDay(db, dateStr, barberId) {
  const weekday = weekdayOf(dateStr)
  const cond = [`(
    (tb.recurrence='none' AND tb.date=?)
    OR (tb.recurrence='daily' AND (tb.startDate IS NULL OR tb.startDate<=?) AND (tb.endDate IS NULL OR tb.endDate>=?))
    OR (tb.recurrence='weekly' AND tb.weekday=? AND (tb.startDate IS NULL OR tb.startDate<=?) AND (tb.endDate IS NULL OR tb.endDate>=?))
  )`]
  const args = [dateStr, dateStr, dateStr, weekday, dateStr, dateStr]
  if (barberId) { cond.push('tb.barberId=?'); args.push(asInt(barberId)) }
  const rows = db.prepare(
    `SELECT tb.*, b.name AS barberName, b.color AS barberColor
     FROM time_blocks tb JOIN barbers b ON b.id = tb.barberId
     WHERE ${cond.join(' AND ')}`
  ).all(...args)

  const out = []
  for (const block of rows) {
    const exc = db.prepare('SELECT * FROM time_block_exceptions WHERE blockId = ? AND date = ?').get(block.id, dateStr)
    if (exc && exc.type === 'skip') continue
    const startTime = exc && exc.type === 'override' ? exc.startTime : block.startTime
    const endTime = exc && exc.type === 'override' ? exc.endTime : block.endTime
    out.push({
      id: block.id, barberId: block.barberId, barberName: block.barberName, barberColor: block.barberColor,
      reason: block.reason, reasonLabel: REASON_LABELS[block.reason] || REASON_LABELS.outro,
      recurrence: block.recurrence, startTime, endTime,
      isException: !!exc, exceptionType: exc ? exc.type : null,
    })
  }
  out.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return out
}

// Usada pela validação de agendamento: dataHoraInicio/dataHoraFim são ISO "YYYY-MM-DDTHH:MM:SS"
// do mesmo dia. Retorna o bloqueio (com reasonLabel) que colide, ou null.
export function isBarberBlocked(db, barberId, dataHoraInicio, dataHoraFim) {
  const dateStr = String(dataHoraInicio).slice(0, 10)
  const startMin = hmToMin(String(dataHoraInicio).slice(11, 16))
  const endMin = hmToMin(String(dataHoraFim).slice(11, 16))
  if (startMin == null || endMin == null) return null
  const blocks = resolveBlocksForDay(db, dateStr, barberId)
  for (const b of blocks) {
    const s = hmToMin(b.startTime), e = hmToMin(b.endTime)
    if (s == null || e == null) continue
    if (startMin < e && endMin > s) return b
  }
  return null
}

// Bloqueios já resolvidos de um dia (todos os barbeiros, ou um só com ?barberId=),
// prontos pra desenhar no calendário.
r.get('/for-day', wrap((req, res) => {
  const db = getDb()
  const date = String(req.query.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Informe a data (YYYY-MM-DD).' })
  const barberId = req.query.barberId ? asInt(req.query.barberId) : null
  res.json(resolveBlocksForDay(db, date, barberId))
}))

// Lista as regras cruas (não resolvidas), opcionalmente filtradas por barbeiro.
r.get('/', wrap((req, res) => {
  const db = getDb()
  const { barberId } = req.query
  const rows = barberId
    ? db.prepare('SELECT * FROM time_blocks WHERE barberId = ? ORDER BY createdAt').all(asInt(barberId))
    : db.prepare('SELECT * FROM time_blocks ORDER BY createdAt').all()
  res.json(rows)
}))

// Regra crua de um bloqueio (não resolvida), usada pra pré-preencher o formulário de
// edição com os dados da série (weekday/date/vigência), não o horário de um dia isolado.
r.get('/:id', wrap((req, res) => {
  const row = getDb().prepare('SELECT * FROM time_blocks WHERE id = ?').get(asInt(req.params.id))
  if (!row) return res.status(404).json({ error: 'Bloqueio não encontrado.' })
  res.json(row)
}))

r.post('/', wrap((req, res) => {
  const db = getDb()
  const { barberId, reason, recurrence, weekday, date, startTime, endTime, startDate, endDate } = req.body || {}
  const err = validateBlockInput({ barberId, reason, recurrence, weekday, date, startTime, endTime })
  if (err) return res.status(400).json({ error: err })
  const barber = db.prepare('SELECT id FROM barbers WHERE id = ?').get(asInt(barberId))
  if (!barber) return res.status(400).json({ error: 'Escolha um profissional válido.' })
  const info = db.prepare(
    `INSERT INTO time_blocks (barberId, reason, recurrence, weekday, date, startTime, endTime, startDate, endDate)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(asInt(barberId), reason, recurrence,
    recurrence === 'weekly' ? asInt(weekday) : null,
    recurrence === 'none' ? date : null,
    startTime, endTime, startDate || null, endDate || null)
  res.status(201).json(db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(info.lastInsertRowid))
}))

// scope 'occurrence' (+ date) ajusta só aquele dia (upsert de exceção override). Sem
// scope, ou scope 'series', ou bloqueio pontual: edita a regra inteira.
r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Bloqueio não encontrado.' })
  const { scope, date, startTime, endTime } = req.body || {}

  if (scope === 'occurrence' && cur.recurrence !== 'none') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'Informe a data da exceção.' })
    const s = hmToMin(startTime), e = hmToMin(endTime)
    if (s == null || e == null || e <= s) return res.status(400).json({ error: 'Informe um horário válido para esse dia.' })
    db.prepare(
      `INSERT INTO time_block_exceptions (blockId, date, type, startTime, endTime) VALUES (?,?,'override',?,?)
       ON CONFLICT(blockId, date) DO UPDATE SET type='override', startTime=excluded.startTime, endTime=excluded.endTime`
    ).run(id, date, startTime, endTime)
    return res.json(db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id))
  }

  const merged = {
    barberId: req.body?.barberId !== undefined ? req.body.barberId : cur.barberId,
    reason: req.body?.reason !== undefined ? req.body.reason : cur.reason,
    recurrence: req.body?.recurrence !== undefined ? req.body.recurrence : cur.recurrence,
    weekday: req.body?.weekday !== undefined ? req.body.weekday : cur.weekday,
    date: req.body?.date !== undefined ? req.body.date : cur.date,
    startTime: startTime !== undefined ? startTime : cur.startTime,
    endTime: endTime !== undefined ? endTime : cur.endTime,
  }
  const err = validateBlockInput(merged)
  if (err) return res.status(400).json({ error: err })
  db.prepare(
    `UPDATE time_blocks SET barberId=?, reason=?, recurrence=?, weekday=?, date=?, startTime=?, endTime=?, startDate=?, endDate=? WHERE id=?`
  ).run(asInt(merged.barberId), merged.reason, merged.recurrence,
    merged.recurrence === 'weekly' ? asInt(merged.weekday) : null,
    merged.recurrence === 'none' ? merged.date : null,
    merged.startTime, merged.endTime,
    req.body?.startDate !== undefined ? (req.body.startDate || null) : cur.startDate,
    req.body?.endDate !== undefined ? (req.body.endDate || null) : cur.endDate,
    id)
  res.json(db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id))
}))

// ?scope=occurrence&date= apaga só aquele dia (upsert de exceção skip). Sem scope, ou
// scope=series, ou bloqueio pontual: apaga a regra inteira (cascade nas exceções).
r.delete('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const cur = db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id)
  if (!cur) return res.status(404).json({ error: 'Bloqueio não encontrado.' })
  const { scope, date } = req.query

  if (scope === 'occurrence' && cur.recurrence !== 'none') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'Informe a data da exceção.' })
    db.prepare(
      `INSERT INTO time_block_exceptions (blockId, date, type, startTime, endTime) VALUES (?,?,'skip',NULL,NULL)
       ON CONFLICT(blockId, date) DO UPDATE SET type='skip', startTime=NULL, endTime=NULL`
    ).run(id, date)
    return res.json({ ok: true })
  }

  db.prepare('DELETE FROM time_blocks WHERE id = ?').run(id)
  res.json({ ok: true })
}))

export default r
