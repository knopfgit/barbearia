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

      {/* O rodapé do indicador mostra SINAL, não enfeite: só ganha cor onde existe um
          estado de verdade pra ler (tem venda fechada? tem gente em atendimento? o
          caixa está aberto?). Não há comparação de período na API, então nada de
          "+12% vs. ontem" — número de variação inventado seria pior que nenhum. */}
      <div className="kpis" style={{ marginBottom: 'var(--sp-secao)' }}>
        <div className="kpi">
          <div className="kpi__label">Faturamento hoje</div>
          <div className="kpi__value money">{brl(d.revenueToday)}</div>
          <div className="kpi__foot">
            {d.ticketsToday > 0
              ? <span className="kpi__delta kpi__delta--positivo"><i className="kpi__ponto" />{d.ticketsToday} comanda(s) fechada(s)</span>
              : <span className="kpi__delta kpi__delta--neutro"><i className="kpi__ponto" />nenhuma comanda fechada ainda</span>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Agendamentos</div>
          <div className="kpi__value">{d.apptsToday}</div>
          <div className="kpi__foot">marcados para hoje</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Comandas abertas</div>
          <div className="kpi__value">{d.openTickets}</div>
          <div className="kpi__foot">
            {d.openTickets > 0
              ? <span className="kpi__delta kpi__delta--positivo"><i className="kpi__ponto" />em atendimento agora</span>
              : 'nenhuma em atendimento'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Caixa</div>
          <div className="kpi__value">{d.cashOpen ? 'Aberto' : 'Fechado'}</div>
          <div className="kpi__foot">
            <span className={`kpi__delta kpi__delta--${d.cashOpen ? 'positivo' : 'negativo'}`}>
              <i className="kpi__ponto" />{d.cashOpen ? 'pronto para vender' : 'abra para registrar vendas'}
            </span>
            {' · '}<Link to="/caixa" className="muted" style={{ textDecoration: 'underline' }}>gerenciar</Link>
          </div>
        </div>
      </div>

      <div className="grid grid--principal">
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
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</div>
                    <div className="faint" style={{ fontSize: 11 }}>comissão {brl(b.commission)}</div>
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
