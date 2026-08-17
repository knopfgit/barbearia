import { Router } from 'express'
import { getDb, runInTransaction } from '../db.js'
import { wrap, asInt, BR_OFFSET_SQL } from './_helpers.js'
import { createTicket, loadTicket } from './tickets.js'

const r = Router()

// A fila é do DIA: quem sobrou de ontem não é chamado nem aparece na tela. O offset
// de Brasília evita que a fila "vire" às 21h (datetime('now') do SQLite é UTC).
const DO_DIA = `date(q.createdAt, '${BR_OFFSET_SQL}') = date('now', '${BR_OFFSET_SQL}')`

// Minutos de espera vêm calculados aqui (julianday em UTC dos dois lados) para o
// balcão não depender do relógio da máquina que abriu a tela.
const SELECT_FILA = `
  SELECT q.*,
         c.name AS clientName,
         s.name AS serviceName,
         b.name AS preferredBarberName,
         b.color AS preferredBarberColor,
         CAST((julianday('now') - julianday(q.createdAt)) * 1440 AS INTEGER) AS waitMin
  FROM queue q
  LEFT JOIN clients c ON c.id = q.clientId
  LEFT JOIN services s ON s.id = q.serviceId
  LEFT JOIN barbers b ON b.id = q.preferredBarberId`

function loadItem(db, id) {
  return db.prepare(`${SELECT_FILA} WHERE q.id = ?`).get(asInt(id))
}

// Fila de espera do dia, em ordem de chegada.
r.get('/', wrap((req, res) => {
  const rows = getDb().prepare(
    `${SELECT_FILA} WHERE q.status = 'aguardando' AND ${DO_DIA} ORDER BY q.createdAt, q.id`
  ).all()
  res.json(rows)
}))

// Entra na fila: cliente cadastrado (clientId) OU avulso (guestName).
r.post('/', wrap((req, res) => {
  const db = getDb()
  const { clientId, guestName, serviceId, preferredBarberId } = req.body || {}
  const nome = String(guestName || '').trim()
  if (!clientId && !nome) return res.status(400).json({ error: 'Escolha um cliente cadastrado ou informe o nome.' })

  let cliente = null
  if (clientId) {
    cliente = db.prepare('SELECT id FROM clients WHERE id = ?').get(asInt(clientId))
    if (!cliente) return res.status(400).json({ error: 'Cliente não encontrado.' })
  }
  if (serviceId && !db.prepare('SELECT id FROM services WHERE id = ?').get(asInt(serviceId))) {
    return res.status(400).json({ error: 'Serviço não encontrado.' })
  }
  if (preferredBarberId && !db.prepare('SELECT id FROM barbers WHERE id = ?').get(asInt(preferredBarberId))) {
    return res.status(400).json({ error: 'Profissional não encontrado.' })
  }

  const info = db.prepare(
    'INSERT INTO queue (clientId, guestName, serviceId, preferredBarberId) VALUES (?,?,?,?)'
  ).run(cliente ? cliente.id : null, cliente ? null : nome,
    serviceId ? asInt(serviceId) : null, preferredBarberId ? asInt(preferredBarberId) : null)
  res.status(201).json(loadItem(db, info.lastInsertRowid))
}))

// Tira o item da fila e abre a comanda dele com o profissional que liberou.
// Reusa createTicket() — a criação de comanda mora só em routes/tickets.js.
function atender(db, item, barberId) {
  // Transação ÚNICA por fora: o createTicket também é transacional e, chamado aqui
  // dentro, participa desta em vez de abrir outra (SQLite não aninha BEGIN). Assim,
  // se o UPDATE da fila falhar, a comanda criada some junto — senão sobraria comanda
  // aberta com a pessoa ainda marcada como aguardando, e ela seria chamada de novo.
  return runInTransaction(db, () => {
    const ticketId = createTicket(db, {
      clientId: item.clientId,
      barberId,
      serviceId: item.serviceId,
      // Avulso não tem cadastro: o nome vai na comanda para o balcão saber quem é.
      notes: item.clientId ? null : `Fila: ${item.guestName}`,
    })
    db.prepare("UPDATE queue SET status='em_atendimento', calledAt=datetime('now'), ticketId=? WHERE id=?")
      .run(ticketId, item.id)
    return loadTicket(db, ticketId)
  })
}

function validarBarbeiro(db, barberId) {
  if (!barberId) return null
  return db.prepare('SELECT id FROM barbers WHERE id = ?').get(asInt(barberId)) || null
}

// Chama alguém específico da fila.
r.post('/:id/call', wrap((req, res) => {
  const db = getDb()
  const barbeiro = validarBarbeiro(db, req.body?.barberId)
  if (!barbeiro) return res.status(400).json({ error: 'Escolha o profissional que vai atender.' })
  const item = loadItem(db, req.params.id)
  if (!item) return res.status(404).json({ error: 'Item da fila não encontrado.' })
  if (item.status !== 'aguardando') return res.status(400).json({ error: 'Esta pessoa já saiu da fila.' })
  res.json(atender(db, item, barbeiro.id))
}))

/**
 * Regra híbrida do "chamar próximo": primeiro o mais antigo que PEDIU este
 * profissional; se não houver ninguém pedindo por ele, o mais antigo que não tem
 * preferência (quem pediu outro profissional continua esperando por ele).
 */
r.post('/call-next', wrap((req, res) => {
  const db = getDb()
  const barbeiro = validarBarbeiro(db, req.body?.barberId)
  if (!barbeiro) return res.status(400).json({ error: 'Escolha o profissional que vai atender.' })

  const proximo = (where, ...args) => db.prepare(
    `${SELECT_FILA} WHERE q.status = 'aguardando' AND ${DO_DIA} AND ${where} ORDER BY q.createdAt, q.id LIMIT 1`
  ).get(...args)

  const item = proximo('q.preferredBarberId = ?', barbeiro.id) || proximo('q.preferredBarberId IS NULL')
  if (!item) return res.status(400).json({ error: 'Ninguém aguardando para este profissional no momento.' })
  res.json(atender(db, item, barbeiro.id))
}))

// Desistência: sai da fila, mas fica no histórico do dia.
r.post('/:id/give-up', wrap((req, res) => {
  const db = getDb()
  const item = loadItem(db, req.params.id)
  if (!item) return res.status(404).json({ error: 'Item da fila não encontrado.' })
  if (item.status !== 'aguardando') return res.status(400).json({ error: 'Esta pessoa já saiu da fila.' })
  db.prepare("UPDATE queue SET status='desistiu' WHERE id=?").run(item.id)
  res.json({ ok: true })
}))

export default r
