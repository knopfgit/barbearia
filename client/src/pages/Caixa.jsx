import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useToast } from '../toast.jsx'
import { brl, hm, dia, utcDate, today, PAYMENT_LABELS, parseMoney } from '../util.js'
import { Spinner, Empty, Field, Modal } from '../components.jsx'

// Movimentos do caixa. 'refund' é o estorno de comanda: sai da gaveta (ou da forma
// de pagamento original) como valor negativo, igual à sangria.
const MOV_LABELS = { sale: 'Venda', in: 'Reforço', out: 'Sangria', refund: 'Estorno' }
const movNegativo = (tipo) => tipo === 'out' || tipo === 'refund'

// Mesmo padrão de período do Financeiro e do Estoque: começa no mês corrente.
function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }

export default function Caixa() {
  const [state, setState] = useState(null)
  const [modal, setModal] = useState(null) // 'open' | 'close' | 'in' | 'out'
  const [aba, setAba] = useState('atual')  // 'atual' | 'historico'
  const { user } = useAuth()

  // O histórico é conferência de dinheiro já fechado, e o backend exige admin
  // (requireAdmin, mesma régua do /close). Por isso a aba nem aparece pro balcão,
  // em vez de aparecer e estourar 403 no clique.
  const podeVerHistorico = user?.role === 'admin'
  const noHistorico = podeVerHistorico && aba === 'historico'

  const load = useCallback(() => api('/cash/current').then(setState).catch(() => setState({ open: false })), [])
  useEffect(() => { load() }, [load])

  if (!state) return <Spinner />

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Operação</div><h1>Caixa</h1><p>Controle de abertura, fechamento e movimentações.</p></div>
        {!noHistorico && (state.open
          ? <button className="btn btn--danger" onClick={() => setModal('close')}>Fechar caixa</button>
          : <button className="btn btn--primary" onClick={() => setModal('open')}>Abrir caixa</button>)}
      </div>

      {podeVerHistorico && (
        <div className="catalog-tabs">
          <button className={`chip-tab${aba === 'atual' ? ' active' : ''}`} onClick={() => setAba('atual')}>Caixa atual</button>
          <button className={`chip-tab${aba === 'historico' ? ' active' : ''}`} onClick={() => setAba('historico')}>Histórico</button>
        </div>
      )}

      {noHistorico ? <Historico /> : !state.open ? (
        <div className="card"><div className="card__body"><Empty mark="▤" title="Caixa fechado" hint="Abra o caixa para começar a registrar vendas." /></div></div>
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: 'var(--sp-secao)' }}>
            <div className="kpi"><div className="kpi__label">Vendas na sessão</div><div className="kpi__value money">{brl(state.summary.salesTotal)}</div><div className="kpi__foot">aberto às {hm(utcDate(state.session.openedAt))}</div></div>
            <div className="kpi"><div className="kpi__label">Troco inicial</div><div className="kpi__value money">{brl(state.session.openingFloat)}</div><div className="kpi__foot">fundo de caixa</div></div>
            <div className="kpi"><div className="kpi__label">Esperado em dinheiro</div><div className="kpi__value money">{brl(state.expectedCash)}</div><div className="kpi__foot">gaveta ao fechar</div></div>
          </div>

          <div className="grid grid--apoio">
            <div className="card">
              <div className="card__head"><h2>Por forma de pagamento</h2></div>
              <div className="card__body">
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                  <div className="spread" key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className="muted">{v}</span>
                    <span className="money">{brl(state.summary.byMethod[k] || 0)}</span>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 16, gap: 8 }}>
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
                          <td className="mono">{hm(utcDate(m.createdAt))}</td>
                          <td>{MOV_LABELS[m.type] || m.type}{m.method && m.type !== 'in' && m.type !== 'out' ? ` · ${PAYMENT_LABELS[m.method] || m.method}` : ''}</td>
                          <td className="muted">{m.description}</td>
                          <td className="num" style={{ color: movNegativo(m.type) ? 'var(--oxblood)' : 'var(--cream)' }}>{movNegativo(m.type) ? '−' : ''}{brl(m.amount)}</td>
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

// "seg, 31 ago · 09:12 → 20:47", ou com as duas datas quando o caixa virou o dia.
function periodo(s) {
  const ab = utcDate(s.openedAt), fe = utcDate(s.closedAt)
  if (!ab || !fe) return '—'
  return ab.toDateString() === fe.toDateString()
    ? `${dia(ab)} · ${hm(ab)} → ${hm(fe)}`
    : `${dia(ab)} ${hm(ab)} → ${dia(fe)} ${hm(fe)}`
}

// Diferença é o número que a administração procura: zero é bom (teal), faltar
// dinheiro é o alerta (oxblood) e sobrar também precisa de conferência (acento).
function corDiferenca(d) {
  if (!d) return 'var(--green-text)'
  return d < 0 ? 'var(--oxblood-text)' : 'var(--accent-text)'
}
function rotuloDiferenca(d) {
  if (!d) return 'bateu'
  return d < 0 ? 'faltou' : 'sobrou'
}

function Diferenca({ valor }) {
  return (
    <>
      <span style={{ color: corDiferenca(valor), fontWeight: 600 }}>{brl(valor)}</span>
      <div className="faint" style={{ fontSize: 11 }}>{rotuloDiferenca(valor)}</div>
    </>
  )
}

// Caixas já fechados, filtrados por período. Só a administração chega aqui.
function Historico() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState(null)

  useEffect(() => {
    let vivo = true
    setLista(null); setErro('')
    api(`/cash/history?from=${from}&to=${to}`)
      .then((d) => { if (vivo) setLista(d) })
      .catch((e) => { if (vivo) { setErro(e.message); setLista([]) } })
    return () => { vivo = false }
  }, [from, to])

  return (
    <>
      <div className="card">
        <div className="card__head">
          <h2>Fechamentos</h2>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
            <span className="faint">até</span>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          </div>
        </div>
        <div className="card__body" style={{ paddingTop: 6 }}>
          {!lista ? <Spinner />
            : erro ? <Empty mark="!" title="Não foi possível carregar o histórico" hint={erro} />
              : lista.length === 0 ? <Empty mark="▤" title="Nenhum fechamento no período" hint="Ajuste as datas acima para ver outros caixas." />
                : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Período</th><th>Operou</th>
                        <th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferença</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((s) => (
                        <tr key={s.id} onClick={() => setDetalhe(s.id)} style={{ cursor: 'pointer' }} title="Ver as movimentações deste caixa">
                          <td style={{ fontWeight: 600 }}>{periodo(s)}</td>
                          <td className="muted">
                            {s.closedByName || s.openedByName || '—'}
                            {s.openedByName && s.closedByName && s.openedByName !== s.closedByName && (
                              <div className="faint" style={{ fontSize: 11 }}>abriu: {s.openedByName}</div>
                            )}
                          </td>
                          <td className="num">{brl(s.expectedCash)}</td>
                          <td className="num">{brl(s.closingCounted)}</td>
                          <td className="num"><Diferenca valor={s.difference} /></td>
                          <td className="right"><button className="btn btn--ghost btn--sm">Detalhes</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>
      </div>

      {detalhe && <DetalheModal id={detalhe} onClose={() => setDetalhe(null)} />}
    </>
  )
}

function DetalheModal({ id, onClose }) {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    api(`/cash/history/${id}`)
      .then((r) => { if (vivo) setD(r) })
      .catch((e) => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [id])

  const linha = (label, valor, extra) => (
    <div className="spread" key={label} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span className="muted">{label}</span>
      <span className="money" style={extra}>{valor}</span>
    </div>
  )

  return (
    <Modal wide title="Detalhe do fechamento" onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      {erro ? <Empty mark="!" title="Não foi possível carregar o detalhe" hint={erro} />
        : !d ? <Spinner /> : (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {periodo(d.session)}
              {d.session.openedByName && <> · abriu: {d.session.openedByName}</>}
              {d.session.closedByName && <> · fechou: {d.session.closedByName}</>}
            </p>

            <div className="grid grid--2">
              <div>
                <h3 className="eyebrow" style={{ marginBottom: 6 }}>Conferência</h3>
                {linha('Troco inicial', brl(d.session.openingFloat))}
                {linha('Vendas na sessão', brl(d.summary.salesTotal))}
                {d.summary.refundsTotal > 0 && linha('Estornos', `−${brl(d.summary.refundsTotal)}`, { color: 'var(--oxblood-text)' })}
                {linha('Reforços', brl(d.summary.cashIn))}
                {linha('Sangrias', `−${brl(d.summary.cashOut)}`, { color: 'var(--oxblood-text)' })}
                {linha('Esperado em dinheiro', brl(d.session.expectedCash))}
                {linha('Contado na gaveta', brl(d.session.closingCounted))}
                <div className="spread" style={{ padding: '8px 0' }}>
                  <span className="muted">Diferença</span>
                  <span className="money right"><Diferenca valor={d.session.difference} /></span>
                </div>
              </div>

              <div>
                <h3 className="eyebrow" style={{ marginBottom: 6 }}>Por forma de pagamento</h3>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => linha(v, brl(d.summary.byMethod[k] || 0)))}
                {d.session.notes && (
                  <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                    <strong>Observações:</strong> {d.session.notes}
                  </p>
                )}
              </div>
            </div>

            <h3 className="eyebrow" style={{ margin: '18px 0 6px' }}>Movimentações</h3>
            {d.movements.length === 0 ? <Empty mark="—" title="Sem movimentações neste caixa" /> : (
              <table className="table">
                <thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {d.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{hm(utcDate(m.createdAt))}</td>
                      <td>{MOV_LABELS[m.type] || m.type}{m.method && m.type !== 'in' && m.type !== 'out' ? ` · ${PAYMENT_LABELS[m.method] || m.method}` : ''}</td>
                      <td className="muted">{m.description}</td>
                      <td className="num" style={{ color: movNegativo(m.type) ? 'var(--oxblood)' : 'var(--cream)' }}>{movNegativo(m.type) ? '−' : ''}{brl(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
    </Modal>
  )
}
