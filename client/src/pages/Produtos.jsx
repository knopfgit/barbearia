import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { brl, parseMoney } from '../util.js'
import { Spinner, Empty, Modal, Field } from '../components.jsx'

export default function Produtos() {
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null)
  function load() { api('/products?all=1').then(setList).catch(() => setList([])) }
  useEffect(load, [])

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Cadastros</div><h1>Produtos</h1><p>Pomadas, cosméticos e itens de revenda.</p></div>
        <button className="btn btn--primary" onClick={() => setEditing({})}>Novo produto</button>
      </div>
      <div className="card">
        {!list ? <Spinner /> : list.length === 0 ? <div className="card__body"><Empty mark="▦" title="Nenhum produto" /></div> : (
          <table className="table">
            <thead><tr><th>Produto</th><th>SKU</th><th className="num">Preço</th><th className="num">Estoque</th><th className="num">Mínimo</th><th className="num">Comissão</th><th></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="muted mono">{p.sku || '—'}</td>
                  <td className="num money">{brl(p.price)}</td>
                  <td className="num" style={{ color: p.minStock > 0 && p.stock <= p.minStock ? 'var(--oxblood)' : 'inherit' }}>{p.stock}</td>
                  <td className="num muted">{p.minStock || '—'}</td>
                  <td className="num muted">{p.commissionPct}%</td>
                  <td className="right"><button className="btn btn--ghost btn--sm" onClick={() => setEditing(p)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <ProductModal prod={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function ProductModal({ prod, onClose, onSaved }) {
  const isNew = !prod.id
  const money = (c) => (c != null ? (c / 100).toFixed(2).replace('.', ',') : '')
  const [f, setF] = useState({ name: prod.name || '', sku: prod.sku || '', price: money(prod.price), cost: money(prod.cost), stock: prod.stock ?? 0, minStock: prod.minStock ?? 0, commissionPct: prod.commissionPct ?? 0, active: prod.active ?? 1 })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const set = (k, v) => setF({ ...f, [k]: v })

  async function save() {
    if (!f.name.trim()) return toast.erro('Informe o nome do produto.')
    setBusy(true)
    const body = { name: f.name, sku: f.sku, price: parseMoney(f.price), cost: parseMoney(f.cost), stock: Number(f.stock), minStock: Number(f.minStock), commissionPct: Number(f.commissionPct), active: f.active }
    try {
      if (isNew) await api('/products', { method: 'POST', body })
      else await api(`/products/${prod.id}`, { method: 'PUT', body })
      toast.ok(isNew ? 'Produto cadastrado.' : 'Produto atualizado.'); onSaved()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'Novo produto' : f.name} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="cols-2">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="SKU"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
      </div>
      <div className="cols-2">
        <Field label="Preço de venda (R$)"><input className="input" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0,00" /></Field>
        <Field label="Custo (R$)"><input className="input" inputMode="decimal" value={f.cost} onChange={(e) => set('cost', e.target.value)} placeholder="0,00" /></Field>
      </div>
      <div className="cols-2">
        <Field label="Estoque"><input className="input" type="number" value={f.stock} onChange={(e) => set('stock', e.target.value)} /></Field>
        <Field label="Estoque mínimo (alerta)"><input className="input" type="number" min="0" value={f.minStock} onChange={(e) => set('minStock', e.target.value)} /></Field>
      </div>
      <div className="cols-2">
        <Field label="Comissão (%)"><input className="input" type="number" min="0" max="100" value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></Field>
        <div />
      </div>
      <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!f.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} /> <span>Ativo (desmarque para cadastrar como insumo interno, não vendido no PDV)</span></label>
    </Modal>
  )
}
