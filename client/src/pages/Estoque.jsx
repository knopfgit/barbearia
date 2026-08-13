import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { brl, hm, today } from '../util.js'
import { Spinner, Empty, Field, Modal } from '../components.jsx'

function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }

export default function Estoque() {
  const [products, setProducts] = useState(null)
  const [movements, setMovements] = useState(null)
  const [consumption, setConsumption] = useState(null)
  const [modal, setModal] = useState(false)
  const toast = useToast()

  const load = useCallback(() => {
    api('/products?all=1').then(setProducts).catch(() => setProducts([]))
    api('/stock/movements').then(setMovements).catch(() => setMovements([]))
    api(`/stock/consumption?from=${monthStart()}&to=${today()}`).then(setConsumption).catch(() => setConsumption([]))
  }, [])
  useEffect(load, [load])

  if (!products || !movements) return <Spinner />

  const low = products.filter((p) => p.active && p.minStock > 0 && p.stock <= p.minStock)

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestão</div><h1>Estoque</h1><p>Níveis de produto/insumo, movimentações e consumo por serviço.</p></div>
        <button className="btn btn--primary" onClick={() => setModal(true)}>Nova movimentação</button>
      </div>

      <div className="kpis" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="kpi__label">Itens cadastrados</div><div className="kpi__value">{products.length}</div><div className="kpi__foot">produtos e insumos</div></div>
        <div className="kpi"><div className="kpi__label">Abaixo do mínimo</div><div className="kpi__value" style={{ color: low.length ? 'var(--oxblood)' : 'inherit' }}>{low.length}</div><div className="kpi__foot">precisam de reposição</div></div>
        <div className="kpi"><div className="kpi__label">Valor em estoque (custo)</div><div className="kpi__value money">{brl(products.reduce((s, p) => s + p.stock * p.cost, 0))}</div><div className="kpi__foot">soma de custo × estoque</div></div>
      </div>

      {low.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--oxblood)' }}>
          <div className="card__head"><h2>Estoque baixo</h2></div>
          <div className="card__body" style={{ paddingTop: 6 }}>
            <table className="table">
              <thead><tr><th>Produto</th><th className="num">Estoque</th><th className="num">Mínimo</th></tr></thead>
              <tbody>
                {low.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num" style={{ color: 'var(--oxblood)', fontWeight: 600 }}>{p.stock}</td>
                    <td className="num muted">{p.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card__head"><h2>Níveis atuais</h2></div>
          <div className="card__body" style={{ paddingTop: 6 }}>
            {products.length === 0 ? <Empty mark="▦" title="Nenhum produto cadastrado" /> : (
              <table className="table">
                <thead><tr><th>Produto</th><th className="num">Estoque</th><th className="num">Mínimo</th></tr></thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}>
                      <td>{p.name}</td>
                      <td className="num" style={{ color: p.minStock > 0 && p.stock <= p.minStock ? 'var(--oxblood)' : 'inherit', fontWeight: 600 }}>{p.stock}</td>
                      <td className="num muted">{p.minStock || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__head"><h2>Consumo no mês</h2></div>
          <div className="card__body" style={{ paddingTop: 6 }}>
            {!consumption || consumption.length === 0 ? <Empty mark="—" title="Sem consumo de insumo registrado" hint="Vincule insumos aos serviços em Serviços → ficha técnica." /> : (
              <table className="table">
                <thead><tr><th>Insumo</th><th className="num">Consumido</th></tr></thead>
                <tbody>
                  {consumption.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td className="num">{c.qty}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card__head"><h2>Últimas movimentações</h2></div>
        <div className="card__body" style={{ paddingTop: 6 }}>
          {movements.length === 0 ? <Empty mark="—" title="Nenhuma movimentação manual ainda" /> : (
            <table className="table">
              <thead><tr><th>Quando</th><th>Produto</th><th>Tipo</th><th className="num">Qtd</th><th>Motivo</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{hm(m.createdAt)}</td>
                    <td>{m.productName}</td>
                    <td>{{ entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' }[m.type] || m.type}</td>
                    <td className="num" style={{ color: m.qty < 0 ? 'var(--oxblood)' : 'var(--green)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                    <td className="muted">{m.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <MovementModal products={products} onClose={() => setModal(false)}
          onDone={() => { setModal(false); load() }} toast={toast} />
      )}
    </>
  )
}

function MovementModal({ products, onClose, onDone, toast }) {
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [type, setType] = useState('entrada')
  const [qty, setQty] = useState('')
  const [newStock, setNewStock] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const current = products.find((p) => String(p.id) === String(productId))

  async function submit() {
    if (!productId) return toast.erro('Escolha um produto.')
    setBusy(true)
    try {
      const body = { productId, type, reason }
      if (type === 'ajuste') body.newStock = newStock
      else body.qty = qty
      await api('/stock/movements', { method: 'POST', body })
      toast.ok('Movimentação registrada.'); onDone()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title="Nova movimentação de estoque" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn--primary" onClick={submit} disabled={busy}>{busy ? 'Salvando…' : 'Registrar'}</button></>}>
      <Field label="Produto/insumo">
        <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} (estoque atual: {p.stock})</option>)}
        </select>
      </Field>
      <Field label="Tipo">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="entrada">Entrada (compra, reposição)</option>
          <option value="saida">Saída (perda, quebra, uso interno)</option>
          <option value="ajuste">Ajuste (definir estoque exato)</option>
        </select>
      </Field>
      {type === 'ajuste' ? (
        <Field label={`Novo estoque (atual: ${current?.stock ?? '—'})`}>
          <input className="input" type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} placeholder="0" />
        </Field>
      ) : (
        <Field label="Quantidade"><input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></Field>
      )}
      <Field label="Motivo (opcional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: compra do fornecedor X" /></Field>
    </Modal>
  )
}
