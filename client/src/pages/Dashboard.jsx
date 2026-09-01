import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { brl, hm, dia, initials } from '../util.js'
import { Spinner, Empty, StatusBadge } from '../components.jsx'
import { Icone } from '../icons.jsx'

// Saudação pelo relógio de quem está olhando — não é dado do sistema, é cortesia.
function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Últimos 7 dias com os buracos preenchidos por zero.
 *
 * O servidor só devolve dia que teve venda (é um GROUP BY). Se a tela desenhasse
 * direto o que vem, uma semana com três dias parados viraria um gráfico de três
 * colunas — parecendo movimento constante. Os dias sem venda existem e valem zero.
 */
function semanaCompleta(last7 = [], hoje) {
  const porDia = Object.fromEntries(last7.map((d) => [d.day, d]))
  const base = new Date(`${hoje}T12:00:00`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() - (6 - i))
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { day: chave, total: porDia[chave]?.total || 0, n: porDia[chave]?.n || 0, ehHoje: chave === hoje }
  })
}

// "vs ontem" só existe se ontem teve movimento — sem base, porcentagem não significa
// nada e vira número inventado. Nesse caso a tela diz o que houve, sem percentual.
function variacao(hoje, ontem) {
  if (!ontem) return null
  return Math.round(((hoje - ontem) / ontem) * 100)
}

export default function Dashboard() {
  const [d, setD] = useState(null)
  const { user } = useAuth()
  useEffect(() => { api('/reports/dashboard').then(setD).catch(() => setD({ error: true })) }, [])
  if (!d) return <Spinner />

  const semana = semanaCompleta(d.last7, d.date)
  const pico = Math.max(...semana.map((x) => x.total), 1)
  const ticketMedio = d.ticketsToday ? Math.round(d.revenueToday / d.ticketsToday) : 0
  const varia = variacao(d.revenueToday, d.revenueYesterday)
  const produzindo = d.topBarbers?.length || 0
  const topeRanking = d.topBarbers?.[0]?.revenue || 1
  // Dia que ainda não começou: quatro pastilhas zeradas lado a lado é um mural de
  // zeros, não informação. Nesse caso o hero convida a começar — o número zero
  // continua verdadeiro, só não vale quatro vezes.
  const diaParado = !produzindo && !d.queueWaiting && !d.apptsToday && !d.openTickets

  return (
    <>
      <div className="hero">
        <div className="hero__conteudo">
          <div className="eyebrow">{dia(`${d.date}T12:00:00`)}</div>
          <h1>{saudacao()}, {String(user?.name || '').split(' ')[0] || 'tudo bem'}</h1>
          {/* Cada pastilha é medida agora: produção do dia, fila, agenda e atendimento
              em curso. "Com produção hoje" não é o mesmo que "atendendo agora" — quem
              está na cadeira agora são as comandas abertas, e é assim que está escrito. */}
          {diaParado ? (
            <div className="hero__resumo">
              <span className="pilula">
                <Icone nome="relogio" size={14} className="ic" />
                Dia ainda sem movimento — abra uma comanda ou marque um horário para começar.
              </span>
            </div>
          ) : (
          <div className="hero__resumo">
            <span className={`pilula${produzindo ? ' pilula--ativa' : ''}`}>
              <Icone nome="profissionais" size={14} className="ic" />
              <strong>{produzindo}</strong> com produção hoje
            </span>
            <span className={`pilula${d.queueWaiting ? ' pilula--ativa' : ''}`}>
              <Icone nome="fila" size={14} className="ic" />
              <strong>{d.queueWaiting}</strong> na fila
            </span>
            <span className="pilula">
              <Icone nome="agenda" size={14} className="ic" />
              <strong>{d.apptsToday}</strong> agendado(s)
            </span>
            <span className="pilula">
              <Icone nome="comanda" size={14} className="ic" />
              <strong>{d.openTickets}</strong> em atendimento
            </span>
          </div>
          )}
        </div>
        <div className="hero__acoes">
          <Link to="/comanda" className="btn btn--primary">Nova comanda</Link>
          <Link to="/agenda" className="btn">Ver agenda</Link>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 'var(--sp-secao)' }}>
        <div className="kpi kpi--dinheiro">
          <div className="kpi__topo">
            <div className="kpi__label">Faturamento hoje</div>
            <span className="kpi__icone"><Icone nome="financeiro" size={19} /></span>
          </div>
          <div className="kpi__value money">{brl(d.revenueToday)}</div>
          <div className="kpi__foot">
            {varia === null ? (
              <span className="kpi__delta kpi__delta--neutro">
                <i className="kpi__ponto" />ontem não teve venda para comparar
              </span>
            ) : (
              <span className={`kpi__delta kpi__delta--${varia >= 0 ? 'positivo' : 'negativo'}`}>
                <Icone nome={varia >= 0 ? 'alta' : 'baixa'} size={13} />
                {varia >= 0 ? '+' : ''}{varia}% vs. ontem ({brl(d.revenueYesterday)})
              </span>
            )}
          </div>
        </div>

        <div className="kpi kpi--teal">
          <div className="kpi__topo">
            <div className="kpi__label">Ticket médio</div>
            <span className="kpi__icone"><Icone nome="ticket" size={19} /></span>
          </div>
          <div className="kpi__value money">{brl(ticketMedio)}</div>
          <div className="kpi__foot">
            {d.ticketsToday ? `${d.ticketsToday} comanda(s) fechada(s) hoje` : 'a primeira venda do dia ainda não saiu'}
          </div>
        </div>

        <div className="kpi kpi--azul">
          <div className="kpi__topo">
            <div className="kpi__label">Atendimentos</div>
            <span className="kpi__icone"><Icone nome="comanda" size={19} /></span>
          </div>
          <div className="kpi__value">{d.ticketsToday}</div>
          <div className="kpi__foot">
            {d.openTickets > 0
              ? <span className="kpi__delta kpi__delta--positivo"><i className="kpi__ponto" />mais {d.openTickets} em atendimento</span>
              : 'nenhuma comanda aberta agora'}
          </div>
        </div>

        <div className={`kpi ${d.cashOpen ? 'kpi--teal' : 'kpi--alerta'}`}>
          <div className="kpi__topo">
            <div className="kpi__label">Caixa</div>
            <span className="kpi__icone"><Icone nome="caixa" size={19} /></span>
          </div>
          <div className="kpi__value kpi__value--texto">{d.cashOpen ? 'Aberto' : 'Fechado'}</div>
          <div className="kpi__foot">
            <span className={`kpi__delta kpi__delta--${d.cashOpen ? 'positivo' : 'negativo'}`}>
              <i className="kpi__ponto" />{d.cashOpen ? 'pronto para vender' : 'abra para registrar vendas'}
            </span>
            {' · '}<Link to="/caixa" className="muted" style={{ textDecoration: 'underline' }}>gerenciar</Link>
          </div>
        </div>
      </div>

      <div className="grid grid--principal" style={{ marginBottom: 'var(--sp-secao)', alignItems: 'start' }}>
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Faturamento · 7 dias</h2>
              <p>Últimos 7 dias · hoje em destaque</p>
            </div>
            <Link to="/financeiro" className="btn btn--ghost btn--sm">Ver financeiro</Link>
          </div>
          <div className="card__body">
            {semana.every((x) => !x.total) ? (
              <Empty mark={<Icone nome="financeiro" size={26} />} title="Nenhuma venda nos últimos 7 dias" hint="As barras aparecem conforme as comandas são fechadas." />
            ) : (
              <div className="spark">
                {semana.map((x) => (
                  <div key={x.day} className={`spark__col${x.ehHoje ? ' spark__col--hoje' : ''}`}
                    title={`${x.day.slice(8)}/${x.day.slice(5, 7)}: ${brl(x.total)} · ${x.n} comanda(s)`}>
                    <div className={`spark__barra${x.total ? '' : ' spark__vazia'}`}
                      style={{ height: `${Math.max(3, (x.total / pico) * 108)}px` }} />
                    <span className="spark__dia">{x.ehHoje ? 'hoje' : `${x.day.slice(8)}/${x.day.slice(5, 7)}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__head"><h2>Profissionais hoje</h2></div>
          <div className="card__body" style={{ paddingTop: 'var(--sp-2)' }}>
            {d.topBarbers?.length ? d.topBarbers.map((b, i) => (
              <div className={`rank${i === 0 ? ' rank--primeiro' : ''}`} key={b.name}>
                <span className="rank__pos">{i + 1}</span>
                <span className="avatar" style={{ background: 'var(--ink-3)', color: b.color }}>{initials(b.name)}</span>
                <div className="rank__corpo">
                  <div className="rank__nome">{b.name}</div>
                  <div className="rank__meta">comissão {brl(b.commission)}</div>
                  <div className="bar-track" style={{ marginTop: 6 }}>
                    <div className="bar-fill" style={{ width: `${(b.revenue / topeRanking) * 100}%` }} />
                  </div>
                </div>
                <span className="rank__valor">{brl(b.revenue)}</span>
              </div>
            )) : <Empty mark={<Icone nome="profissionais" size={26} />} title="Sem produção registrada hoje" hint="Feche uma comanda para o ranking aparecer." />}
          </div>
        </div>
      </div>

      <div className="grid grid--principal" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card__head">
            <h2>Próximos horários</h2>
            <Link to="/agenda" className="btn btn--ghost btn--sm">Agenda completa</Link>
          </div>
          <div className="card__body" style={{ paddingTop: 'var(--sp-2)' }}>
            {d.nextAppts?.length ? d.nextAppts.map((a) => (
              <div className="slot" key={a.id}>
                <div className="slot__time">{hm(a.startAt)}</div>
                <div className="slot__bar" style={{ background: a.barberColor || 'var(--accent)' }} />
                <div className="slot__main">
                  <div className="slot__client">{a.clientName || 'Sem cliente'}</div>
                  <div className="slot__meta">{a.serviceName || 'Serviço a definir'} · {a.barberName || '—'}</div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            )) : <Empty mark={<Icone nome="relogio" size={26} />} title="Nenhum horário restante hoje" hint="Novos agendamentos aparecem aqui." />}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__head"><h2>Mais vendido hoje</h2></div>
            <div className="card__body">
              {d.topServiceToday ? (
                <>
                  <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, fontFamily: 'var(--label)' }}>{d.topServiceToday.name}</div>
                  <div className="spread" style={{ marginTop: 'var(--sp-3)' }}>
                    <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{d.topServiceToday.qty}× hoje</span>
                    <span className="money" style={{ color: 'var(--accent-text)' }}>{brl(d.topServiceToday.total)}</span>
                  </div>
                </>
              ) : <Empty mark={<Icone nome="servicos" size={26} />} title="Nenhum serviço vendido hoje" />}
            </div>
          </div>

          <div className="card">
            <div className="card__head"><h2>Agenda de hoje</h2></div>
            <div className="card__body">
              {d.apptsToday ? Object.entries(d.apptsByStatus || {}).map(([status, n]) => (
                <div className="spread" key={status} style={{ padding: '7px 0' }}>
                  <StatusBadge status={status} />
                  <span className="mono">{n}</span>
                </div>
              )) : <Empty mark={<Icone nome="agenda" size={26} />} title="Nada marcado para hoje" />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
