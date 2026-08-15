import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { brl, hm, dia, initials } from '../util.js'
import { Spinner, Empty, StatusBadge } from '../components.jsx'

export default function Dashboard() {
  const [d, setD] = useState(null)
  useEffect(() => { api('/reports/dashboard').then(setD).catch(() => setD({ error: true })) }, [])
  if (!d) return <Spinner />

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{dia()}</div>
          <h1>Painel do dia</h1>
          <p>Resumo da operação de hoje na barbearia.</p>
        </div>
        <div className="row">
          <Link to="/comanda" className="btn btn--primary">Nova comanda</Link>
          <Link to="/agenda" className="btn">Ver agenda</Link>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 22 }}>
        <div className="kpi">
          <div className="kpi__label">Faturamento hoje</div>
          <div className="kpi__value money">{brl(d.revenueToday)}</div>
          <div className="kpi__foot">{d.ticketsToday} comanda(s) fechada(s)</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Agendamentos</div>
          <div className="kpi__value">{d.apptsToday}</div>
          <div className="kpi__foot">marcados para hoje</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Comandas abertas</div>
          <div className="kpi__value">{d.openTickets}</div>
          <div className="kpi__foot">em atendimento agora</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Caixa</div>
          <div className="kpi__value" style={{ fontSize: 22, color: d.cashOpen ? 'var(--green)' : 'var(--oxblood)' }}>
            {d.cashOpen ? 'Aberto' : 'Fechado'}
          </div>
          <div className="kpi__foot"><Link to="/caixa" className="muted" style={{ textDecoration: 'underline' }}>gerenciar caixa</Link></div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <div className="card__head"><h2>Próximos horários</h2><Link to="/agenda" className="btn btn--ghost btn--sm">Agenda completa</Link></div>
          <div className="card__body" style={{ paddingTop: 8 }}>
            {d.nextAppts?.length ? d.nextAppts.map((a) => (
              <div className="slot" key={a.id} style={{ marginBottom: 8 }}>
                <div className="slot__time">{hm(a.startAt)}</div>
                <div className="slot__bar" style={{ background: a.barberColor || 'var(--accent)' }} />
                <div className="slot__main">
                  <div className="slot__client">{a.clientName || 'Sem cliente'}</div>
                  <div className="slot__meta">{a.serviceName || 'Serviço a definir'} · {a.barberName || '—'}</div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            )) : <Empty mark="🗓" title="Nenhum horário restante hoje" hint="Novos agendamentos aparecem aqui." />}
          </div>
        </div>

        <div className="card">
          <div className="card__head"><h2>Profissionais hoje</h2></div>
          <div className="card__body">
            {d.topBarbers?.length ? d.topBarbers.map((b) => (
              <div className="spread" key={b.name} style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="avatar" style={{ background: 'var(--ink-3)', color: b.color }}>{initials(b.name)}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.name}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>comissão {brl(b.commission)}</div>
                  </div>
                </div>
                <span className="money" style={{ color: 'var(--accent-text)' }}>{brl(b.revenue)}</span>
              </div>
            )) : <Empty mark="♞" title="Sem produção registrada" hint="Feche uma comanda para ver aqui." />}
          </div>
        </div>
      </div>
    </>
  )
}
