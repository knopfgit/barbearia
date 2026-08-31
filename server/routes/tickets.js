import { Router } from 'express'
import { getDb, runInTransaction } from '../db.js'
import { requireAdmin } from '../auth.js'
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

// Quem veio da fila sem cadastro só existe pelo nome, guardado em queue.guestName.
// Sem trazer esse nome, toda comanda de avulso aparece como "Avulso" e o balcão não
// sabe de quem é qual — com três cadeiras rodando, cobra-se o corte errado.
const GUEST_NAME = '(SELECT q.guestName FROM queue q WHERE q.ticketId = t.id) AS guestName'

export function loadTicket(db, id) {
  const t = db.prepare(
    `SELECT t.*, c.name AS clientName, b.name AS barberName, ${GUEST_NAME}
     FROM tickets t LEFT JOIN clients c ON c.id = t.clientId
     LEFT JOIN barbers b ON b.id = t.barberId WHERE t.id = ?`
  ).get(id)
  if (!t) return null
  t.items = db.prepare(
    `SELECT i.*, b.name AS barberName FROM ticket_items i
     LEFT JOIN barbers b ON b.id = i.barberId WHERE i.ticketId = ? ORDER BY i.id`
  ).all(id)
  // Prévia da comissão (a tela da comanda mostra ela, não o valor gravado): enquanto
  // a comanda está aberta o desconto ainda pode mudar, então o commissionValue do
  // item só vira definitivo no checkout. Comanda fechada/cancelada não recalcula —
  // o que está gravado é o que foi pago.
  t.commissionOnDiscount = politicaComissao(db)
  if (t.status === 'open') {
    const efetivas = comissoesEfetivas(db, t.items, t.discount)
    t.items.forEach((i, k) => {
      i.descontoRateado = efetivas[k].descontoRateado
      i.commissionPreview = efetivas[k].commissionValue
    })
  } else {
    for (const i of t.items) { i.descontoRateado = 0; i.commissionPreview = i.commissionValue }
  }
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

// Política de comissão quando a comanda tem desconto (settings.commissionOnDiscount):
//   'cheio'   → comissão sobre o valor cheio do item (padrão; comportamento antigo)
//   'liquido' → o desconto da comanda é rateado entre os itens e a comissão sai do
//               valor já com desconto — quem dá o desconto divide o custo dele.
export function politicaComissao(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'commissionOnDiscount'").get()
  return row && row.value === 'liquido' ? 'liquido' : 'cheio'
}

/**
 * Rateia `desconto` (centavos) entre os itens, proporcional ao total de cada um,
 * pelo método do MAIOR RESTO: cada item leva a parte inteira e as sobras vão para
 * quem tem a maior fração. A soma das cotas é EXATAMENTE o desconto — sem centavo
 * perdido nem criado, que é o que faria a comissão não bater com o relatório.
 * Entra na conta todo item da comanda (produto e item sem profissional inclusive):
 * o desconto foi dado sobre a comanda inteira.
 */
export function rateiaDesconto(totais, desconto) {
  const soma = totais.reduce((s, v) => s + v, 0)
  const alvo = Math.min(Math.max(0, desconto || 0), Math.max(0, soma))
  if (alvo <= 0 || soma <= 0) return totais.map(() => 0)
  const exatos = totais.map((v) => (v * alvo) / soma)
  const cotas = exatos.map((v) => Math.floor(v))
  let sobra = alvo - cotas.reduce((s, v) => s + v, 0)
  // Desempate fixo (maior fração → item mais caro → ordem de lançamento) para o
  // mesmo desconto sempre render o mesmo rateio.
  const ordem = exatos
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || totais[b.i] - totais[a.i] || a.i - b.i)
  for (let k = 0; k < ordem.length && sobra > 0; k++, sobra--) cotas[ordem[k].i]++
  return cotas
}

// Comissão efetiva de cada item conforme a política vigente. Devolve, na ordem dos
// itens recebidos, { descontoRateado, commissionValue }. No modo 'cheio' o rateio é
// zero e o resultado é o mesmo que já está gravado no item.
export function comissoesEfetivas(db, items, desconto) {
  const totais = items.map((i) => i.total)
  const cotas = politicaComissao(db) === 'liquido' ? rateiaDesconto(totais, desconto) : totais.map(() => 0)
  return items.map((i, k) => ({
    descontoRateado: cotas[k],
    commissionValue: Math.round(((i.total - cotas[k]) * (i.commissionPct || 0)) / 100),
  }))
}

r.get('/', wrap((req, res) => {
  const db = getDb()
  const SELECT = `SELECT t.*, c.name AS clientName, b.name AS barberName, ${GUEST_NAME} FROM tickets t
     LEFT JOIN clients c ON c.id=t.clientId LEFT JOIN barbers b ON b.id=t.barberId`
  // ?session=atual: as comandas já cobradas no caixa que está aberto agora — que é
  // exatamente o conjunto que pode ser estornado. Traz as estornadas junto pra elas
  // não sumirem da tela no instante do estorno. Lista naturalmente curta (um turno),
  // ao contrário de "todas as fechadas", que cresce pra sempre.
  if (req.query.session === 'atual') {
    const session = db.prepare("SELECT id FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get()
    if (!session) return res.json([])
    return res.json(db.prepare(
      `${SELECT} WHERE t.cashSessionId = ? AND t.status IN ('closed','refunded')
       ORDER BY t.closedAt DESC, t.id DESC`
    ).all(session.id))
  }
  const status = req.query.status || 'open'
  res.json(db.prepare(`${SELECT} WHERE t.status = ? ORDER BY t.openedAt DESC`).all(String(status)))
}))

r.get('/:id', wrap((req, res) => {
  const t = loadTicket(getDb(), asInt(req.params.id))
  if (!t) return res.status(404).json({ error: 'Comanda não encontrada.' })
  res.json(t)
}))

/**
 * Abre uma comanda (walk-in, a partir de um agendamento ou de um item da fila de
 * espera) e devolve o id. Ponto ÚNICO de criação de comanda — quem precisar abrir
 * uma (ver server/routes/queue.js) chama isto em vez de repetir a lógica.
 *
 * Se vier `appointmentId`, o serviço e o profissional do item saem do agendamento
 * (e ele é marcado como atendido); senão, um `serviceId` avulso já entra como item.
 */
export function createTicket(db, { clientId, barberId, appointmentId, serviceId, notes } = {}) {
  // Abre a comanda, marca o agendamento como atendido e já lança o serviço (que baixa
  // insumo): quatro tabelas. Se chamada de dentro de outra transação — é o caso da
  // fila, em routes/queue.js — participa daquela em vez de abrir a própria.
  return runInTransaction(db, () => {
    const info = db.prepare('INSERT INTO tickets (clientId, barberId, appointmentId, notes) VALUES (?,?,?,?)')
      .run(clientId ? asInt(clientId) : null, barberId ? asInt(barberId) : null,
        appointmentId ? asInt(appointmentId) : null, notes || null)
    const id = info.lastInsertRowid

    let itemServiceId = serviceId ? asInt(serviceId) : null
    let itemBarberId = barberId ? asInt(barberId) : null
    if (appointmentId) {
      const ap = db.prepare('SELECT * FROM appointments WHERE id = ?').get(asInt(appointmentId))
      if (ap) { itemServiceId = ap.serviceId; itemBarberId = ap.barberId }
      db.prepare("UPDATE appointments SET status='done' WHERE id=?").run(asInt(appointmentId))
    }
    if (itemServiceId) {
      const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(itemServiceId)
      // Não passar unitPrice aqui: svc.price já está em centavos, e addItem() chama toCents()
      // (que espera reais) quando unitPrice vem preenchido — passar de novo multiplicaria por 100.
      if (svc) addItem(db, id, { kind: 'service', refId: svc.id, description: svc.name, barberId: itemBarberId, qty: 1 })
    }
    recompute(db, id)
    return id
  })
}

// Abre uma comanda (walk-in ou a partir de um agendamento).
r.post('/', wrap((req, res) => {
  const db = getDb()
  const { clientId, barberId, appointmentId } = req.body || {}
  const id = createTicket(db, { clientId, barberId, appointmentId })
  res.status(201).json(loadTicket(db, id))
}))

// Erro de entrada: o tratador central respeita err.status e devolve a mensagem.
function erro400(mensagem) {
  return Object.assign(new Error(mensagem), { status: 400 })
}
// Erro que pede uma decisão do balcão em vez de simplesmente barrar: `extras` vai
// junto no corpo da resposta pra tela saber o que perguntar.
function erroConfirma(mensagem, extras) {
  return Object.assign(new Error(mensagem), { status: 409, extras })
}

const MAX_QTY = 999
const MAX_UNIT = 100000000   // R$ 1.000.000,00 em centavos

function addItem(db, ticketId, { kind, refId, description, barberId, qty, unitPrice, confirmarSemEstoque }) {
  // Sem validação, a API aceitava kind inventado, preço negativo (que virava receita
  // e comissão negativas no relatório) e quantidade absurda — que gravava um total
  // acima do que o JavaScript representa e deixava a comanda ilegível pra sempre.
  if (kind !== 'service' && kind !== 'product') throw erro400('Tipo de item inválido.')
  let ref = null
  if (kind === 'service' && refId) ref = db.prepare('SELECT * FROM services WHERE id = ?').get(asInt(refId))
  if (kind === 'product' && refId) ref = db.prepare('SELECT * FROM products WHERE id = ?').get(asInt(refId))
  if (refId && !ref) throw erro400(kind === 'service' ? 'Serviço não encontrado.' : 'Produto não encontrado.')
  if (barberId && !db.prepare('SELECT id FROM barbers WHERE id = ?').get(asInt(barberId))) {
    throw erro400('Profissional não encontrado.')
  }

  const q = asInt(qty, 1)
  if (q < 1 || q > MAX_QTY) throw erro400(`Quantidade deve ser entre 1 e ${MAX_QTY}.`)
  const unit = unitPrice != null ? toCents(unitPrice) : (ref ? ref.price : 0)
  if (unit < 0) throw erro400('Preço do item não pode ser negativo.')
  if (unit > MAX_UNIT) throw erro400('Valor do item acima do permitido.')

  // Vender sem estoque é PERMITIDO, mas nunca em silêncio: sem o sinal explícito de
  // confirmação, devolve 409 pedindo que o balcão decida. Travar a venda sairia mais
  // caro que o saldo negativo — inventário desatualizado é rotina, e o produto está
  // ali na prateleira. O negativo vira pendência de ajuste, e o mesmo já vale para o
  // insumo consumido por serviço (ver consumeForServiceItem), que também não barra.
  if (kind === 'product' && ref && ref.stock < q && !confirmarSemEstoque) {
    throw erroConfirma(
      `Estoque de ${ref.name} insuficiente: ${ref.stock < 0 ? 'já está negativo em ' + ref.stock : 'restam ' + ref.stock}.`,
      { needsConfirm: true, disponivel: ref.stock, produto: ref.name, pedido: q }
    )
  }

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
  // Lançar item grava o item, baixa estoque (produto) ou insumo (serviço, com snapshot
  // do consumo) e recalcula o total — quatro tabelas.
  const comItem = runInTransaction(db, () => {
    addItem(db, id, req.body || {})
    recompute(db, id)
    return loadTicket(db, id)
  })
  res.status(201).json(comItem)
}))

// Era o único handler de comanda sem esta guarda. Sem ela, remover item de comanda
// FECHADA deixava o relatório menor que o caixa, sem trilha nenhuma; e de comanda
// CANCELADA devolvia o estoque uma segunda vez (o cancelamento já tinha devolvido).
r.delete('/:id/items/:itemId', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT status FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  const item = db.prepare('SELECT * FROM ticket_items WHERE id = ? AND ticketId = ?').get(asInt(req.params.itemId), id)
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' })
  // Devolver ao estoque e apagar o item são passos separados: sem transação, uma falha
  // no meio devolvia o estoque de um item que continuava na comanda.
  const semItem = runInTransaction(db, () => {
    if (item.kind === 'product' && item.refId) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.refId)
    if (item.kind === 'service') reverseConsumablesForItem(db, item.id)
    db.prepare('DELETE FROM ticket_items WHERE id = ?').run(item.id)
    recompute(db, id)
    return loadTicket(db, id)
  })
  res.json(semItem)
}))

// Ajusta desconto / cliente / barbeiro principal da comanda.
r.put('/:id', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  const { discount, clientId, barberId, notes } = req.body || {}
  if (discount != null && toCents(discount) < 0) return res.status(400).json({ error: 'Desconto não pode ser negativo.' })
  // Sem teto, um "100000" digitado no campo zerava a comanda (o total é clampado em 0)
  // mas gravava o desconto inteiro, que ia inflar o relatório de descontos — e a
  // comissão do item continuava sendo paga sobre o valor cheio.
  if (discount != null && toCents(discount) > t.subtotal) {
    return res.status(400).json({ error: `O desconto não pode ser maior que o valor da comanda (${(t.subtotal / 100).toFixed(2).replace('.', ',')}).` })
  }
  // Duas escritas em sequência (o UPDATE e o recálculo do total): juntas, para não
  // existir instante em que o desconto está gravado e o total ainda é o antigo.
  const atualizada = runInTransaction(db, () => {
    db.prepare('UPDATE tickets SET discount=?, clientId=?, barberId=?, notes=? WHERE id=?')
      .run(discount != null ? toCents(discount) : t.discount,
        clientId !== undefined ? (clientId ? asInt(clientId) : null) : t.clientId,
        barberId !== undefined ? (barberId ? asInt(barberId) : null) : t.barberId,
        notes !== undefined ? notes : t.notes, id)
    recompute(db, id)
    return loadTicket(db, id)
  })
  res.json(atualizada)
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
  // Fechar comanda mexe em tickets, cash_movements e loyalty_movements. Falhar no meio
  // deixava venda fechada sem lançamento no caixa (ou sem os pontos do cliente), e o
  // balcão não tinha como consertar: repetir dava "Comanda não está aberta".
  const fechada = runInTransaction(db, () => {
    recompute(db, id)
    const fresh = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
    // Comissão definitiva conforme a política de desconto vigente, ainda dentro da
    // transação e ANTES de fechar: depois disso a comanda não muda mais. No modo
    // 'cheio' nada é reescrito — o valor já gravado no item é o mesmo.
    const itens = db.prepare('SELECT * FROM ticket_items WHERE ticketId = ? ORDER BY id').all(id)
    const efetivas = comissoesEfetivas(db, itens, fresh.discount)
    const gravaComissao = db.prepare('UPDATE ticket_items SET commissionValue = ? WHERE id = ?')
    itens.forEach((it, k) => {
      if (efetivas[k].commissionValue !== it.commissionValue) gravaComissao.run(efetivas[k].commissionValue, it.id)
    })
    db.prepare("UPDATE tickets SET status='closed', paymentMethod=?, cashSessionId=?, closedAt=datetime('now') WHERE id=?")
      .run(String(paymentMethod), session.id, id)
    db.prepare('INSERT INTO cash_movements (sessionId, type, amount, method, description, ticketId, userId) VALUES (?,?,?,?,?,?,?)')
      .run(session.id, 'sale', fresh.total, String(paymentMethod), `Comanda #${id}`, id, req.user?.id || null)
    creditLoyaltyForTicket(db, fresh)
    return loadTicket(db, id)
  })
  res.json(fechada)
}))

r.post('/:id/cancel', wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t || t.status !== 'open') return res.status(400).json({ error: 'Comanda não está aberta.' })
  // A devolução ao estoque é item a item: sem transação, uma falha no meio devolvia
  // parte dos itens e deixava a comanda aberta, sem como saber o que já voltou.
  runInTransaction(db, () => {
    // devolve estoque dos produtos e dos insumos consumidos por serviços
    for (const it of db.prepare("SELECT * FROM ticket_items WHERE ticketId=?").all(id)) {
      if (it.kind === 'product' && it.refId) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty, it.refId)
      if (it.kind === 'service') reverseConsumablesForItem(db, it.id)
    }
    db.prepare("UPDATE tickets SET status='canceled' WHERE id=?").run(id)
  })
  res.json({ ok: true })
}))

/**
 * Desfaz uma venda já fechada: devolve estoque (produto e insumo), tira o valor do
 * caixa, zera a comissão dos itens, debita os pontos creditados e marca a comanda
 * como estornada, com autor, data e motivo.
 *
 * TODOS os passos numa transação só — meio estorno é pior que estorno nenhum: estoque
 * de volta sem o dinheiro sair do caixa (ou o contrário) deixa a conferência da gaveta
 * mentindo, sem ninguém saber o que já foi desfeito. Se for chamada de dentro de outra
 * transação, participa daquela (ver runInTransaction em server/db.js) — é o que o teste
 * de rollback usa pra forçar uma falha depois dos passos.
 *
 * Não valida nada: as pré-condições (status, caixa, motivo, papel) são conferidas na
 * rota, antes de qualquer escrita.
 */
export function estornaComanda(db, ticket, { sessionId, userId, reason }) {
  return runInTransaction(db, () => {
    const itens = db.prepare('SELECT * FROM ticket_items WHERE ticketId = ?').all(ticket.id)
    for (const it of itens) {
      // Mesma devolução do cancelamento: o estoque saiu no lançamento do item, não no
      // fechamento, então quem volta é a quantidade do item e o consumo de insumo.
      if (it.kind === 'product' && it.refId) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty, it.refId)
      if (it.kind === 'service') reverseConsumablesForItem(db, it.id)
    }
    // Comissão zerada: o filtro status='closed' já tira a comanda de todo relatório,
    // mas venda estornada não pode pagar comissão nem por consulta esquecida — é
    // dinheiro saindo do caixa da barbearia.
    db.prepare('UPDATE ticket_items SET commissionValue = 0 WHERE ticketId = ?').run(ticket.id)

    // Movimento de estorno, e não uma sangria: a sangria tiraria da gaveta também o
    // estorno de uma venda no cartão/pix, dinheiro que nunca entrou nela. Guardando a
    // forma de pagamento original, a summary() do caixa desconta da forma certa e o
    // esperado em dinheiro só muda quando a venda foi em dinheiro.
    db.prepare('INSERT INTO cash_movements (sessionId, type, amount, method, description, ticketId, userId) VALUES (?,?,?,?,?,?,?)')
      .run(sessionId, 'refund', ticket.total, ticket.paymentMethod, `Estorno da comanda #${ticket.id}`, ticket.id, userId || null)

    // Devolve exatamente os pontos creditados no fechamento — recalcular pela config
    // atual devolveria a mais ou a menos se o pontos-por-real tiver mudado desde a
    // venda. Sem crédito registrado (fidelidade desligada, comanda sem cliente), nada
    // a debitar.
    const credito = db.prepare("SELECT SUM(points) AS pts FROM loyalty_movements WHERE ticketId = ? AND type='credito'").get(ticket.id)
    if (ticket.clientId && credito?.pts > 0) {
      db.prepare('INSERT INTO loyalty_movements (clientId, type, points, reason, ticketId, userId) VALUES (?,?,?,?,?,?)')
        .run(ticket.clientId, 'debito', credito.pts, `Estorno da comanda #${ticket.id}`, ticket.id, userId || null)
    }

    db.prepare("UPDATE tickets SET status='refunded', refundedAt=datetime('now'), refundedBy=?, refundReason=? WHERE id=?")
      .run(userId || null, reason, ticket.id)
    return loadTicket(db, ticket.id)
  })
}

// Estorno de venda fechada: desfaz dinheiro, estoque, comissão e pontos, então é da
// administração — mesma régua do fechamento de caixa.
r.post('/:id/refund', requireAdmin, wrap((req, res) => {
  const db = getDb()
  const id = asInt(req.params.id)
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t) return res.status(404).json({ error: 'Comanda não encontrada.' })
  if (t.status === 'refunded') return res.status(400).json({ error: 'Esta comanda já foi estornada.' })
  if (t.status !== 'closed') return res.status(400).json({ error: 'Só dá para estornar comanda fechada.' })
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return res.status(400).json({ error: 'Informe o motivo do estorno.' })

  // O estorno tira dinheiro de um caixa aberto. Mexer em caixa já fechado mudaria a
  // diferença de um fechamento que já foi conferido e assinado.
  const session = db.prepare("SELECT * FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1").get()
  if (!session) return res.status(400).json({ error: 'Abra o caixa antes de estornar uma venda.' })
  if (t.cashSessionId !== session.id) {
    return res.status(400).json({ error: 'Esta venda foi lançada em um caixa que já foi fechado. Não dá para estornar — faça um ajuste no caixa atual.' })
  }

  res.json(estornaComanda(db, t, { sessionId: session.id, userId: req.user?.id, reason }))
}))

export default r
