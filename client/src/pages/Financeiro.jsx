import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { brl, today, PAYMENT_LABELS, initials } from '../util.js'
import { Spinner, Empty } from '../components.jsx'

function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }

export default function Financeiro() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [d, setD] = useState(null)

  function load() { setD(null); api(`/reports/financial?from=${from}&to=${to}`).then(setD).catch(() => setD({ error: true })) }
  useEffect(load, [from, to])

  const maxDay = d?.byDay?.length ? Math.max(...d.byDay.map((x) => x.total)) : 0

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestão</div><h1>Financeiro</h1><p>Faturamento, formas de pagamento e comissões por período.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <span className="faint">até</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      {!d ? <Spinner /> : (
        <>
          <div className="kpis" style={{ marginBottom: 'var(--sp-secao)' }}>
            <div className="kpi"><div className="kpi__label">Faturamento</div><div className="kpi__value money">{brl(d.totals.revenue)}</div><div className="kpi__foot">{d.totals.tickets} comanda(s)</div></div>
            <div className="kpi"><div className="kpi__label">Serviços</div><div className="kpi__value money">{brl(d.serviceRevenue)}</div><div className="kpi__foot">{pct(d.serviceRevenue, d.totals.revenue)} do total</div></div>
            <div className="kpi"><div className="kpi__label">Produtos</div><div className="kpi__value money">{brl(d.productRevenue)}</div><div className="kpi__foot">{pct(d.productRevenue, d.totals.revenue)} do total</div></div>
            <div className="kpi"><div className="kpi__label">Comissões</div><div className="kpi__value money">{brl(d.totalCommission)}</div><div className="kpi__foot">a repassar aos profissionais</div></div>
          </div>

          <div className="grid grid--2" style={{ marginBottom: 'var(--sp-secao)' }}>
            <div className="card">
              <div className="card__head"><h2>Comissão por profissional</h2></div>
              <div className="card__body">
                {d.byBarber.length === 0 ? <Empty mark="♞" title="Sem produção no período" /> : d.byBarber.map((b) => (
                  <div key={b.id} style={{ marginBottom: 'var(--sp-secao)' }}>
                    <div className="spread" style={{ marginBottom: 6 }}>
                      <div className="row" style={{ gap: 9 }}><span className="avatar" style={{ color: b.color }}>{initials(b.name)}</span><strong style={{ fontSize: 13 }}>{b.name}</strong></div>
                      <div className="right"><div className="money" style={{ color: 'var(--accent-text)' }}>{brl(b.commission)}</div><div className="faint" style={{ fontSize: 11 }}>de {brl(b.revenue)}</div></div>
                    </div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${d.byBarber[0].revenue ? (b.revenue / d.byBarber[0].revenue) * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card__head"><h2>Formas de pagamento</h2></div>
              <div className="card__body">
                {d.byMethod.length === 0 ? <Empty mark="—" title="Sem recebimentos" /> : d.byMethod.map((m) => (
                  <div className="spread" key={m.method} style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span>{PAYMENT_LABELS[m.method] || m.method || '—'} <span className="faint">· {m.n}</span></span>
                    <span className="money">{brl(m.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid--principal">
            <div className="card">
              <div className="card__head"><h2>Faturamento por dia</h2></div>
              <div className="card__body">
                {d.byDay.length === 0 ? <Empty mark="▤" title="Sem dados no período" /> : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, paddingTop: 10 }}>
                    {d.byDay.map((x) => (
                      <div key={x.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }} title={`${x.day}: ${brl(x.total)}`}>
                        <div style={{ width: '100%', height: maxDay ? `${Math.max(4, (x.total / maxDay) * 130)}px` : 4, background: 'linear-gradient(180deg, var(--accent), var(--accent-dim))', borderRadius: '4px 4px 0 0' }} />
                        <span className="faint" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{x.day.slice(8)}/{x.day.slice(5, 7)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card__head"><h2>Serviços mais vendidos</h2></div>
              <div className="card__body" style={{ paddingTop: 6 }}>
                {d.topServices.length === 0 ? <Empty mark="≣" title="Sem serviços no período" /> : (
                  <table className="table">
                    <tbody>
                      {d.topServices.map((s) => (
                        <tr key={s.name}><td style={{ fontWeight: 600 }}>{s.name}</td><td className="num muted">{s.qty}x</td><td className="num money">{brl(s.total)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function pct(part, total) { return total ? `${Math.round((part / total) * 100)}%` : '0%' }
