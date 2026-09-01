import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { brl, parseMoney } from '../util.js'
import { Spinner, Empty, Modal, Field } from '../components.jsx'

export default function Servicos() {
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null)
  function load() { api('/services?all=1').then(setList).catch(() => setList([])) }
  useEffect(load, [])

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Cadastros</div><h1>Serviços</h1><p>Cortes, barba e demais serviços com preço e comissão.</p></div>
        <button className="btn btn--primary" onClick={() => setEditing({})}>Novo serviço</button>
      </div>
      <div className="card">
        {!list ? <Spinner /> : list.length === 0 ? <div className="card__body"><Empty mark="≣" title="Nenhum serviço" /></div> : (
          <table className="table">
            <thead><tr><th>Serviço</th><th className="num">Preço</th><th className="num">Duração</th><th className="num">Comissão</th><th></th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : .5 }}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="num money">{brl(s.price)}</td>
                  <td className="num">{s.durationMin} min</td>
                  <td className="num muted">{s.commissionPct == null ? 'padrão' : `${s.commissionPct}%`}</td>
                  <td className="right"><button className="btn btn--ghost btn--sm" onClick={() => setEditing(s)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <ServiceModal svc={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function ServiceModal({ svc, onClose, onSaved }) {
  const isNew = !svc.id
  const [f, setF] = useState({
    name: svc.name || '', price: svc.price != null ? (svc.price / 100).toFixed(2).replace('.', ',') : '',
    durationMin: svc.durationMin ?? 30, commissionPct: svc.commissionPct ?? '', active: svc.active ?? 1,
  })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const set = (k, v) => setF({ ...f, [k]: v })

  async function save() {
    if (!f.name.trim()) return toast.erro('Informe o nome do serviço.')
    setBusy(true)
    const body = { name: f.name, price: parseMoney(f.price), durationMin: f.durationMin, commissionPct: f.commissionPct === '' ? '' : Number(f.commissionPct), active: f.active }
    try {
      if (isNew) await api('/services', { method: 'POST', body })
      else await api(`/services/${svc.id}`, { method: 'PUT', body })
      toast.ok(isNew ? 'Serviço cadastrado.' : 'Serviço atualizado.'); onSaved()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'Novo serviço' : f.name} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
      <Field label="Nome"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
      <div className="cols-2">
        <Field label="Preço (R$)"><input className="input" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0,00" /></Field>
        <Field label="Duração (min)"><input className="input" type="number" min="5" step="5" value={f.durationMin} onChange={(e) => set('durationMin', e.target.value)} /></Field>
      </div>
      <Field label="Comissão específica (%) — deixe vazio para usar a do profissional">
        <input className="input" type="number" min="0" max="100" value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} placeholder="padrão do profissional" />
      </Field>
      {!isNew && <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!f.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} /> <span>Ativo</span></label>}
      {!isNew && <Consumables serviceId={svc.id} />}
    </Modal>
  )
}

// Ficha técnica: quais produtos/insumos esse serviço consome por execução.
function Consumables({ serviceId }) {
  const [rows, setRows] = useState(null)
  const [products, setProducts] = useState([])
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState(1)
  const toast = useToast()

  function load() { api(`/services/${serviceId}/consumables`).then(setRows).catch(() => setRows([])) }
  useEffect(load, [serviceId])
  useEffect(() => { api('/products?all=1').then(setProducts).catch(() => setProducts([])) }, [])

  async function add() {
    if (!productId) return toast.erro('Escolha um produto/insumo.')
    try { await api(`/services/${serviceId}/consumables`, { method: 'POST', body: { productId, qty } }); setProductId(''); setQty(1); load() }
    catch (e) { toast.erro(e.message) }
  }
  async function remove(rowId) {
    await api(`/services/${serviceId}/consumables/${rowId}`, { method: 'DELETE' }); load()
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.02em', marginBottom: 8 }}>
        FICHA TÉCNICA — insumos consumidos por execução
      </div>
      {rows === null ? null : rows.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Nenhum insumo vinculado — o estoque não é afetado ao vender esse serviço.</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {rows.map((c) => (
            <div key={c.id} className="spread" style={{ padding: '5px 0', fontSize: 13 }}>
              <span>{c.productName} <span className="muted">× {c.qty}</span></span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(c.id)}>Remover</button>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)} style={{ flex: 1 }}>
          <option value="">— Adicionar insumo —</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 64 }} />
        <button type="button" className="btn btn--sm" onClick={add}>Adicionar</button>
      </div>
    </div>
  )
}
