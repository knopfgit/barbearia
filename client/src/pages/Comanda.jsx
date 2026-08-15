import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { brl, hm, PAYMENT_LABELS, parseMoney } from '../util.js'
import { Spinner, Empty, Field } from '../components.jsx'

export default function Comanda() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [open, setOpen] = useState(null)
  const [barbers, setBarbers] = useState([])
  const [clients, setClients] = useState([])
  const toast = useToast()

  const loadOpen = useCallback(() => { api('/tickets?status=open').then(setOpen).catch(() => setOpen([])) }, [])
  useEffect(() => { loadOpen() }, [loadOpen])
  useEffect(() => { api('/barbers').then(setBarbers); api('/clients').then(setClients) }, [])

  function select(id) { setParams(id ? { id } : {}) }

  if (selectedId) {
    return <ComandaEditor id={selectedId} barbers={barbers} clients={clients}
      onBack={() => { select(null); loadOpen() }} />
  }

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Operação</div><h1>Comanda / PDV</h1><p>Abra uma comanda para atender e cobrar.</p></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div className="card">
          <div className="card__head"><h2>Comandas abertas</h2></div>
          <div className="card__body" style={{ paddingTop: 8 }}>
            {!open ? <Spinner /> : open.length === 0 ? (
              <Empty mark="✂" title="Nenhuma comanda aberta" hint="Abra uma nova ao lado ou pela agenda." />
            ) : open.map((t) => (
              <button key={t.id} className="slot" onClick={() => select(t.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                <div className="slot__time" style={{ fontSize: 15, width: 44 }}>#{t.id}</div>
                <div className="slot__bar" style={{ background: 'var(--accent)' }} />
                <div className="slot__main">
                  <div className="slot__client">{t.clientName || 'Avulso'}</div>
                  <div className="slot__meta">{t.barberName || 'Sem profissional'} · aberta {hm(t.openedAt)}</div>
                </div>
                <span className="money" style={{ color: 'var(--accent-text)' }}>{brl(t.total)}</span>
              </button>
            ))}
          </div>
        </div>
        <NewComanda barbers={barbers} clients={clients} onCreated={(id) => select(id)} />
      </div>
    </>
  )
}

function NewComanda({ barbers, clients, onCreated }) {
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
        <Field label="Cliente (opcional)">
          <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Avulso —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <button className="btn btn--primary btn--block" onClick={create}>Abrir comanda</button>
      </div>
    </div>
  )
}

function ComandaEditor({ id, barbers, clients, onBack }) {
  const [t, setT] = useState(null)
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const [tab, setTab] = useState('service')
  const [itemBarber, setItemBarber] = useState('')
  const [payment, setPayment] = useState('')
  const [discount, setDiscount] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const load = useCallback(() => api(`/tickets/${id}`).then((data) => {
    setT(data); setDiscount(data.discount ? (data.discount / 100).toString().replace('.', ',') : '')
    if (!itemBarber) setItemBarber(data.barberId || barbers[0]?.id || '')
  }), [id, barbers, itemBarber])
  useEffect(() => { load() }, [load])
  useEffect(() => { api('/services').then(setServices); api('/products').then(setProducts) }, [])

  async function addItem(kind, item) {
    try { setT(await api(`/tickets/${id}/items`, { method: 'POST', body: { kind, refId: item.id, barberId: itemBarber || t.barberId } })) }
    catch (e) { toast.erro(e.message) }
  }
  async function removeItem(itemId) {
    setT(await api(`/tickets/${id}/items/${itemId}`, { method: 'DELETE' }))
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
  const commissionTotal = (t.items || []).reduce((s, i) => s + i.commissionValue, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Comanda #{t.id} · aberta {hm(t.openedAt)}</div>
          <h1>{t.clientName || 'Cliente avulso'}</h1>
          <p>Adicione serviços e produtos e finalize o pagamento.</p>
        </div>
        <button className="btn" onClick={onBack}>← Voltar</button>
      </div>

      <div className="pdv">
        <div>
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
                <div className="cat-item__sub">{tab === 'service' ? `${item.durationMin} min` : `estoque: ${item.stock}`}</div>
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
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{i.description}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {i.barberName || '—'} · comissão {i.commissionPct}% = {brl(i.commissionValue)}
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
            <div className="faint" style={{ fontSize: 11.5, textAlign: 'right', marginTop: 2 }}>comissão total {brl(commissionTotal)}</div>

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
    </>
  )
}
