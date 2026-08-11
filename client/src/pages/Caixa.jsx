import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { brl, hm, PAYMENT_LABELS, parseMoney } from '../util.js'
import { Spinner, Empty, Field, Modal } from '../components.jsx'

export default function Caixa() {
  const [state, setState] = useState(null)
  const [modal, setModal] = useState(null) // 'open' | 'close' | 'in' | 'out'
  const toast = useToast()

  const load = useCallback(() => api('/cash/current').then(setState).catch(() => setState({ open: false })), [])
  useEffect(() => { load() }, [load])

  if (!state) return <Spinner />

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Operação</div><h1>Caixa</h1><p>Controle de abertura, fechamento e movimentações.</p></div>
        {state.open
          ? <button className="btn btn--danger" onClick={() => setModal('close')}>Fechar caixa</button>
          : <button className="btn btn--primary" onClick={() => setModal('open')}>Abrir caixa</button>}
      </div>

      {!state.open ? (
        <div className="card"><div className="card__body"><Empty mark="▤" title="Caixa fechado" hint="Abra o caixa para começar a registrar vendas." /></div></div>
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: 20 }}>
            <div className="kpi"><div className="kpi__label">Vendas na sessão</div><div className="kpi__value money">{brl(state.summary.salesTotal)}</div><div className="kpi__foot">aberto às {hm(state.session.openedAt)}</div></div>
            <div className="kpi"><div className="kpi__label">Troco inicial</div><div className="kpi__value money">{brl(state.session.openingFloat)}</div><div className="kpi__foot">fundo de caixa</div></div>
            <div className="kpi"><div className="kpi__label">Esperado em dinheiro</div><div className="kpi__value money">{brl(state.expectedCash)}</div><div className="kpi__foot">gaveta ao fechar</div></div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1.3fr' }}>
            <div className="card">
              <div className="card__head"><h2>Por forma de pagamento</h2></div>
              <div className="card__body">
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                  <div className="spread" key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className="muted">{v}</span>
                    <span className="money">{brl(state.summary.byMethod[k] || 0)}</span>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 14, gap: 8 }}>
                  <button className="btn btn--sm" onClick={() => setModal('in')}>+ Reforço</button>
                  <button className="btn btn--sm" onClick={() => setModal('out')}>− Sangria</button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card__head"><h2>Movimentações</h2></div>
              <div className="card__body" style={{ paddingTop: 6 }}>
                {state.movements.length === 0 ? <Empty mark="—" title="Sem movimentações ainda" /> : (
                  <table className="table">
                    <thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
                    <tbody>
                      {state.movements.map((m) => (
                        <tr key={m.id}>
                          <td className="mono">{hm(m.createdAt)}</td>
                          <td>{m.type === 'sale' ? 'Venda' : m.type === 'in' ? 'Reforço' : 'Sangria'}{m.method && m.type === 'sale' ? ` · ${PAYMENT_LABELS[m.method] || m.method}` : ''}</td>
                          <td className="muted">{m.description}</td>
                          <td className="num" style={{ color: m.type === 'out' ? 'var(--oxblood)' : 'var(--cream)' }}>{m.type === 'out' ? '−' : ''}{brl(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {modal && <CashModal kind={modal} state={state} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
    </>
  )
}

function CashModal({ kind, state, onClose, onDone }) {
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const cfg = {
    open: { title: 'Abrir caixa', label: 'Troco inicial (R$)', action: 'Abrir' },
    close: { title: 'Fechar caixa', label: 'Dinheiro contado na gaveta (R$)', action: 'Fechar caixa' },
    in: { title: 'Reforço de caixa', label: 'Valor (R$)', action: 'Registrar reforço' },
    out: { title: 'Sangria de caixa', label: 'Valor (R$)', action: 'Registrar sangria' },
  }[kind]

  async function submit() {
    setBusy(true)
    try {
      if (kind === 'open') await api('/cash/open', { method: 'POST', body: { openingFloat: parseMoney(amount) } })
      else if (kind === 'close') {
        const r = await api('/cash/close', { method: 'POST', body: { closingCounted: parseMoney(amount), notes: desc } })
        toast[r.difference === 0 ? 'ok' : 'info'](`Caixa fechado. Diferença: ${brl(r.difference)}`)
        return onDone()
      } else await api('/cash/movement', { method: 'POST', body: { type: kind, amount: parseMoney(amount), description: desc } })
      toast.ok(`${cfg.title} concluído.`); onDone()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={cfg.title} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn--primary" onClick={submit} disabled={busy}>{busy ? '…' : cfg.action}</button></>}>
      {kind === 'close' && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Esperado em dinheiro: <strong className="money">{brl(state.expectedCash)}</strong>. Conte a gaveta e informe abaixo.</p>}
      <Field label={cfg.label}><input className="input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
      {(kind === 'in' || kind === 'out' || kind === 'close') && (
        <Field label={kind === 'close' ? 'Observações (opcional)' : 'Descrição'}><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={kind === 'out' ? 'Ex.: pagamento de fornecedor' : 'Ex.: troco extra'} /></Field>
      )}
    </Modal>
  )
}
