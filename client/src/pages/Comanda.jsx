import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { BuscaCliente } from '../buscacliente.jsx'
import { useToast } from '../toast.jsx'
import { brl, hm, dia, utcDate, PAYMENT_LABELS, TICKET_STATUS_LABELS, parseMoney } from '../util.js'
import { Spinner, Empty, Field, Modal } from '../components.jsx'

export default function Comanda() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [open, setOpen] = useState(null)
  const [fechadas, setFechadas] = useState(null)
  const [aba, setAba] = useState('abertas')
  const [barbers, setBarbers] = useState([])

  const loadOpen = useCallback(() => { api('/tickets?status=open').then(setOpen).catch(() => setOpen([])) }, [])
  // Fechadas do caixa ABERTO: é o que ainda dá para estornar (o backend recusa venda
  // de caixa já fechado), e a lista não cresce para sempre como "todas as fechadas".
  const loadFechadas = useCallback(() => { api('/tickets?session=atual').then(setFechadas).catch(() => setFechadas([])) }, [])
  useEffect(() => { loadOpen(); loadFechadas() }, [loadOpen, loadFechadas])
  useEffect(() => { api('/barbers').then(setBarbers) }, [])

  function select(id) { setParams(id ? { id } : {}) }

  if (selectedId) {
    return <ComandaDetalhe id={selectedId} barbers={barbers}
      onBack={() => { select(null); loadOpen(); loadFechadas() }} />
  }

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Operação</div><h1>Comanda / PDV</h1><p>Abra uma comanda para atender e cobrar.</p></div>
      </div>
      <div className="grid grid--lateral">
        <div className="card">
          <div className="card__head">
            <div className="catalog-tabs" style={{ marginBottom: 0 }}>
              <button className={`chip-tab${aba === 'abertas' ? ' active' : ''}`} onClick={() => setAba('abertas')}>Abertas</button>
              <button className={`chip-tab${aba === 'fechadas' ? ' active' : ''}`} onClick={() => setAba('fechadas')}>Fechadas neste caixa</button>
            </div>
          </div>
          <div className="card__body" style={{ paddingTop: 8 }}>
            {aba === 'abertas' ? (
              !open ? <Spinner /> : open.length === 0 ? (
                <Empty mark="✂" title="Nenhuma comanda aberta" hint="Abra uma nova ao lado ou pela agenda." />
              ) : open.map((t) => (
                <button key={t.id} className="slot" onClick={() => select(t.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                  <div className="slot__time" style={{ fontSize: 16, width: 44 }}>#{t.id}</div>
                  <div className="slot__bar" style={{ background: 'var(--accent)' }} />
                  <div className="slot__main">
                    <div className="slot__client">{t.clientName || t.guestName || 'Avulso'}</div>
                    <div className="slot__meta">{t.barberName || 'Sem profissional'} · aberta {hm(utcDate(t.openedAt))}</div>
                  </div>
                  <span className="money" style={{ color: 'var(--accent-text)' }}>{brl(t.total)}</span>
                </button>
              ))
            ) : (
              !fechadas ? <Spinner /> : fechadas.length === 0 ? (
                <Empty mark="▤" title="Nenhuma comanda fechada neste caixa" hint="Aparecem aqui as vendas cobradas desde a abertura do caixa." />
              ) : fechadas.map((t) => (
                <button key={t.id} className="slot" onClick={() => select(t.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                  <div className="slot__time" style={{ fontSize: 16, width: 44 }}>#{t.id}</div>
                  <div className="slot__bar" style={{ background: t.status === 'refunded' ? 'var(--oxblood)' : 'var(--green)' }} />
                  <div className="slot__main">
                    <div className="slot__client">{t.clientName || t.guestName || 'Avulso'}</div>
                    <div className="slot__meta">
                      {PAYMENT_LABELS[t.paymentMethod] || '—'} · fechada {hm(utcDate(t.closedAt))}
                      {t.status === 'refunded' && ' · estornada'}
                    </div>
                  </div>
                  <span className="money" style={{
                    color: t.status === 'refunded' ? 'var(--faint)' : 'var(--cream)',
                    textDecoration: t.status === 'refunded' ? 'line-through' : 'none',
                  }}>{brl(t.total)}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <NewComanda barbers={barbers} onCreated={(id) => select(id)} />
      </div>
    </>
  )
}

function NewComanda({ barbers, onCreated }) {
  const [barberId, setBarberId] = useState('')
  const [clientId, setClientId] = useState('')
  const toast = useToast()
  useEffect(() => { if (!barberId && barbers[0]) setBarberId(barbers[0].id) }, [barbers, barberId])

  async function create() {
    try {
      const t = await api('/tickets', { method: 'POST', body: { barberId, clientId } })
      toast.ok(`Comanda #${t.id} aberta.`); onCreated(t.id)
    } catch (e) { toast.erro(e.message) }
  }
  return (
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card__head"><h2>Nova comanda</h2></div>
      <div className="card__body">
        <Field label="Profissional">
          <select className="select" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <BuscaCliente rotulo="Cliente (opcional)" value={clientId} onChange={(id) => setClientId(id)}
          permiteCadastro dica="Deixe em branco para atender como avulso." />
        <button className="btn btn--primary btn--block" onClick={create}>Abrir comanda</button>
      </div>
    </div>
  )
}

/**
 * Decide qual tela abrir para a comanda selecionada: o PDV só serve para comanda
 * ABERTA (catálogo, desconto, fechamento). Fechada, cancelada ou estornada abre a
 * visão de leitura — que é onde mora o estorno.
 */
function ComandaDetalhe({ id, barbers, onBack }) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let vivo = true
    setStatus(null)
    api(`/tickets/${id}`)
      .then((t) => { if (vivo) setStatus(t.status) })
      .catch(() => { if (vivo) setStatus('erro') })
    return () => { vivo = false }
  }, [id])

  if (status === null) return <Spinner />
  if (status === 'erro') {
    return (
      <div className="card"><div className="card__body">
        <Empty mark="!" title="Comanda não encontrada" hint="Ela pode ter sido removida." />
        <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={onBack}>← Voltar</button></div>
      </div></div>
    )
  }
  return status === 'open'
    ? <ComandaEditor id={id} barbers={barbers} onBack={onBack} />
    : <ComandaFechada id={id} onBack={onBack} />
}

// Comanda já cobrada: leitura, sem catálogo nem pagamento. O botão de estorno só
// aparece para a administração (o backend também exige, com requireAdmin) e só
// enquanto a venda ainda é estornável.
function ComandaFechada({ id, onBack }) {
  const [t, setT] = useState(null)
  const [modal, setModal] = useState(false)
  const { user } = useAuth()

  const load = useCallback(() => api(`/tickets/${id}`).then(setT).catch(() => setT(null)), [id])
  useEffect(() => { load() }, [load])

  if (!t) return <Spinner />
  const estornada = t.status === 'refunded'
  const podeEstornar = user?.role === 'admin' && t.status === 'closed'
  const comissaoTotal = (t.items || []).reduce((soma, i) => soma + i.commissionValue, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            Comanda #{t.id} · <span className={`badge badge--${t.status}`}>{TICKET_STATUS_LABELS[t.status] || t.status}</span>
          </div>
          <h1>{t.clientName || t.guestName || 'Cliente avulso'}</h1>
          <p>
            {t.closedAt ? `Fechada em ${dia(utcDate(t.closedAt))} às ${hm(utcDate(t.closedAt))}` : 'Comanda não cobrada'}
            {t.paymentMethod && ` · ${PAYMENT_LABELS[t.paymentMethod] || t.paymentMethod}`}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {podeEstornar && <button className="btn btn--danger" onClick={() => setModal(true)}>Estornar</button>}
          <button className="btn" onClick={onBack}>← Voltar</button>
        </div>
      </div>

      {estornada && (
        <div className="card" style={{ marginBottom: 'var(--sp-secao)', borderColor: 'var(--oxblood)' }}>
          <div className="card__body">
            <strong style={{ color: 'var(--oxblood-text)' }}>Venda estornada</strong>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
              Motivo: {t.refundReason || '—'}
              {t.refundedAt && ` · em ${dia(utcDate(t.refundedAt))} às ${hm(utcDate(t.refundedAt))}`}
            </p>
            <p className="faint" style={{ margin: '4px 0 0', fontSize: 12 }}>
              O estoque foi devolvido, o valor saiu do caixa e a comissão e os pontos foram estornados.
            </p>
          </div>
        </div>
      )}

      <div className="card comanda" style={{ maxWidth: 560 }}>
        <div className="card__head"><h2>Itens</h2></div>
        <div className="card__body">
          {(t.items || []).length === 0 ? <Empty mark="—" title="Comanda sem itens" /> : t.items.map((i) => (
            <div className="comanda__item" key={i.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{i.description}{i.qty > 1 ? ` ×${i.qty}` : ''}</div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {i.barberName || '—'} · comissão {brl(i.commissionValue)}
                  {estornada && ' (estornada)'}
                </div>
              </div>
              <span className="money" style={{ fontSize: 13 }}>{brl(i.total)}</span>
            </div>
          ))}

          <hr className="hr" />
          <div className="comanda__totline"><span className="muted">Subtotal</span><strong>{brl(t.subtotal)}</strong></div>
          {t.discount > 0 && <div className="comanda__totline"><span className="muted">Desconto</span><strong>−{brl(t.discount)}</strong></div>}
          <div className="comanda__totline">
            <span>Total</span>
            <span className="comanda__grand" style={{ color: estornada ? 'var(--faint)' : 'var(--accent-text)', textDecoration: estornada ? 'line-through' : 'none' }}>{brl(t.total)}</span>
          </div>
          <div className="faint" style={{ fontSize: 11, textAlign: 'right', marginTop: 2 }}>comissão total {brl(comissaoTotal)}</div>
        </div>
      </div>

      {modal && <EstornoModal ticket={t} onClose={() => setModal(false)} onDone={() => { setModal(false); load() }} />}
    </>
  )
}

function EstornoModal({ ticket, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function submit() {
    if (!reason.trim()) return toast.erro('Informe o motivo do estorno.')
    setBusy(true)
    try {
      await api(`/tickets/${ticket.id}/refund`, { method: 'POST', body: { reason } })
      toast.ok(`Comanda #${ticket.id} estornada.`); onDone()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={`Estornar comanda #${ticket.id}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn--danger" onClick={submit} disabled={busy}>{busy ? 'Estornando…' : 'Confirmar estorno'}</button>
      </>}>
      <p style={{ marginTop: 0 }}>
        Esta ação desfaz a venda de <strong className="money">{brl(ticket.total)}</strong>: devolve estoque,
        retira o valor do caixa e estorna comissão e pontos. Continuar?
      </p>
      <p className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
        A comanda não reabre — ela fica registrada como estornada, com o seu nome e o motivo.
      </p>
      <Field label="Motivo do estorno">
        <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: cliente desistiu do produto" />
      </Field>
    </Modal>
  )
}

function ComandaEditor({ id, barbers, onBack }) {
  const [t, setT] = useState(null)
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const [tab, setTab] = useState('service')
  const [itemBarber, setItemBarber] = useState('')
  const [payment, setPayment] = useState('')
  const [discount, setDiscount] = useState('')
  const [busy, setBusy] = useState(false)
  const [usual, setUsual] = useState(null)
  const [semEstoque, setSemEstoque] = useState(null)
  const toast = useToast()

  const load = useCallback(() => api(`/tickets/${id}`).then((data) => {
    setT(data); setDiscount(data.discount ? (data.discount / 100).toString().replace('.', ',') : '')
    if (!itemBarber) setItemBarber(data.barberId || barbers[0]?.id || '')
  }), [id, barbers, itemBarber])
  useEffect(() => { load() }, [load])
  // Os produtos são relidos a cada item lançado: o estoque muda no servidor, e é dele
  // que sai o aviso de saldo negativo (tanto no catálogo quanto na linha da comanda).
  const loadProducts = useCallback(() => api('/products').then(setProducts).catch(() => {}), [])
  useEffect(() => { api('/services').then(setServices); loadProducts() }, [loadProducts])

  // "O de sempre" do cliente. Comanda avulsa não tem cliente, então nem pergunta;
  // se der erro ou não houver histórico, fica null e a faixa não aparece.
  const clientId = t?.clientId
  useEffect(() => {
    if (!clientId) { setUsual(null); return }
    api(`/clients/${clientId}/usual`).then(setUsual).catch(() => setUsual(null))
  }, [clientId])

  /**
   * Lança item na comanda. Produto sem estoque não é barrado nem passa batido: o
   * servidor devolve 409 pedindo confirmação, a tela pergunta, e só com o "sim"
   * (confirmarSemEstoque) a venda acontece.
   */
  async function addItem(kind, item, confirmarSemEstoque = false) {
    try {
      const body = { kind, refId: item.id, barberId: itemBarber || t.barberId }
      if (confirmarSemEstoque) body.confirmarSemEstoque = true
      setT(await api(`/tickets/${id}/items`, { method: 'POST', body }))
      setSemEstoque(null)
      loadProducts()
    } catch (e) {
      if (e.status === 409 && e.data?.needsConfirm) setSemEstoque({ kind, item, ...e.data })
      else { setSemEstoque(null); toast.erro(e.message) }
    }
  }
  async function removeItem(itemId) {
    setT(await api(`/tickets/${id}/items/${itemId}`, { method: 'DELETE' }))
    loadProducts()   // remover devolve ao estoque
  }
  async function applyDiscount() {
    setT(await api(`/tickets/${id}`, { method: 'PUT', body: { discount: parseMoney(discount) } }))
    toast.ok('Desconto aplicado.')
  }
  async function checkout() {
    if (!payment) return toast.erro('Escolha a forma de pagamento.')
    setBusy(true)
    try {
      await api(`/tickets/${id}/checkout`, { method: 'POST', body: { paymentMethod: payment } })
      toast.ok(`Comanda #${id} fechada · ${PAYMENT_LABELS[payment]}`); onBack()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }
  async function cancel() {
    if (!confirm('Cancelar esta comanda? Os itens serão descartados.')) return
    await api(`/tickets/${id}/cancel`, { method: 'POST' }); toast.info('Comanda cancelada.'); onBack()
  }

  if (!t) return <Spinner />
  const catalog = tab === 'service' ? services : products
  // A comissão mostrada é a PRÉVIA vinda do servidor (comissionPreview): com a
  // política "sobre o valor com desconto", o desconto da comanda é rateado entre os
  // itens e o valor gravado só vira definitivo no fechamento. Sem desconto — ou na
  // política "sobre o valor cheio" — a prévia é igual ao valor gravado.
  const comissaoDoItem = (i) => (i.commissionPreview ?? i.commissionValue)
  const commissionTotal = (t.items || []).reduce((s, i) => s + comissaoDoItem(i), 0)
  const comissaoLiquida = t.commissionOnDiscount === 'liquido' && t.discount > 0
  // Rastro da venda sem estoque: sai do saldo atual do produto, não de uma marca em
  // memória — assim continua visível depois de recarregar a página.
  const estoqueNegativo = (item) => item.kind === 'product' && item.refId
    && (products.find((p) => p.id === item.refId)?.stock ?? 0) < 0
  // Some assim que o serviço entra na comanda — sugestão cumprida não vira convite
  // a lançar o mesmo item duas vezes.
  const jaLancado = (t.items || []).some((i) => i.kind === 'service' && i.refId === usual?.serviceId)
  const mostraUsual = usual && !jaLancado

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Comanda #{t.id} · aberta {hm(utcDate(t.openedAt))}</div>
          <h1>{t.clientName || t.guestName || 'Cliente avulso'}</h1>
          <p>Adicione serviços e produtos e finalize o pagamento.</p>
        </div>
        <button className="btn" onClick={onBack}>← Voltar</button>
      </div>

      <div className="pdv">
        <div>
          {mostraUsual && (
            <div className="usual">
              <span className="usual__mark" aria-hidden="true">💡</span>
              <div className="usual__text">
                <strong>De sempre: {usual.name}</strong>
                <span className="faint"> — em {usual.visits} das últimas {usual.consideredVisits} visita{usual.consideredVisits > 1 ? 's' : ''} · {brl(usual.price)}</span>
              </div>
              <button className="btn btn--sm" onClick={() => addItem('service', { id: usual.serviceId })}>+ Adicionar</button>
            </div>
          )}
          <div className="catalog-tabs">
            <button className={`chip-tab${tab === 'service' ? ' active' : ''}`} onClick={() => setTab('service')}>Serviços</button>
            <button className={`chip-tab${tab === 'product' ? ' active' : ''}`} onClick={() => setTab('product')}>Produtos</button>
            <div style={{ marginLeft: 'auto', minWidth: 190 }}>
              <select className="select btn--sm" value={itemBarber} onChange={(e) => setItemBarber(e.target.value)} title="Profissional que recebe a comissão do próximo item">
                {barbers.map((b) => <option key={b.id} value={b.id}>Comissão → {b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="catalog">
            {catalog.map((item) => (
              <button key={item.id} className="cat-item" onClick={() => addItem(tab, item)}>
                <div className="cat-item__name">{item.name}</div>
                <div className="cat-item__price">{brl(item.price)}</div>
                <div className="cat-item__sub" style={tab === 'product' && item.stock < 0 ? { color: 'var(--oxblood-text)' } : undefined}>
                  {tab === 'service' ? `${item.durationMin} min` : `estoque: ${item.stock}`}
                </div>
              </button>
            ))}
            {catalog.length === 0 && <Empty mark="▦" title="Nada cadastrado ainda" />}
          </div>
        </div>

        <div className="card comanda">
          <div className="card__head"><h2>Comanda</h2><button className="btn btn--ghost btn--sm" onClick={cancel}>Cancelar</button></div>
          <div className="card__body">
            {(t.items || []).length === 0 ? (
              <p className="faint" style={{ textAlign: 'center', padding: '20px 0' }}>Clique num serviço ou produto para adicionar.</p>
            ) : (t.items.map((i) => (
              <div className="comanda__item" key={i.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{i.description}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {i.barberName || '—'} · comissão {i.commissionPct}% = {brl(comissaoDoItem(i))}
                    {comissaoLiquida && i.descontoRateado > 0 && (
                      <span title={`Desconto rateado neste item: ${brl(i.descontoRateado)}`}>
                        {' '}(sobre {brl(i.total - i.descontoRateado)} com desconto)
                      </span>
                    )}
                    {estoqueNegativo(i) && (
                      <span style={{ color: 'var(--oxblood-text)' }}> · ⚠ estoque negativo</span>
                    )}
                  </div>
                </div>
                <span className="money" style={{ fontSize: 13 }}>{brl(i.total)}</span>
                <span className="x" onClick={() => removeItem(i.id)} title="Remover">✕</span>
              </div>
            )))}

            <hr className="hr" />
            <div className="comanda__totline"><span className="muted">Subtotal</span><strong>{brl(t.subtotal)}</strong></div>
            <div className="row" style={{ gap: 6, margin: '4px 0 8px' }}>
              <input className="input" placeholder="Desconto R$" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn--sm" onClick={applyDiscount}>Aplicar</button>
            </div>
            <div className="comanda__totline"><span>Total</span><span className="comanda__grand" style={{ color: 'var(--accent-text)' }}>{brl(t.total)}</span></div>
            <div className="faint" style={{ fontSize: 11, textAlign: 'right', marginTop: 2 }}>
              comissão total {brl(commissionTotal)}
              {comissaoLiquida && ' · prévia, com o desconto rateado'}
            </div>

            <div className="eyebrow" style={{ margin: '16px 0 8px' }}>Pagamento</div>
            <div className="pay-grid">
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                <button key={k} className={`pay-opt${payment === k ? ' active' : ''}`} onClick={() => setPayment(k)}>{v}</button>
              ))}
            </div>
            <button className="btn btn--primary btn--block" onClick={checkout} disabled={busy || t.items.length === 0}>
              {busy ? 'Fechando…' : `Fechar comanda · ${brl(t.total)}`}
            </button>
          </div>
        </div>
      </div>

      {semEstoque && (
        <Modal title="Estoque insuficiente" onClose={() => setSemEstoque(null)}
          footer={<>
            <button className="btn" onClick={() => setSemEstoque(null)}>Cancelar</button>
            <button className="btn btn--primary" onClick={() => addItem(semEstoque.kind, semEstoque.item, true)}>Vender assim</button>
          </>}>
          <p style={{ marginTop: 0 }}>
            <strong>{semEstoque.produto}</strong>{' '}
            {semEstoque.disponivel > 0
              ? `tem só ${semEstoque.disponivel} em estoque e você está lançando ${semEstoque.pedido}.`
              : semEstoque.disponivel === 0
                ? 'está com o estoque zerado.'
                : `já está com o estoque negativo (${semEstoque.disponivel}).`}
          </p>
          <p className="muted" style={{ marginBottom: 0, fontSize: 13, lineHeight: 1.5 }}>
            Vender assim mesmo deixa o estoque negativo e a diferença vai precisar de
            ajuste em Estoque. A venda entra normalmente na comanda e no caixa.
          </p>
        </Modal>
      )}
    </>
  )
}
