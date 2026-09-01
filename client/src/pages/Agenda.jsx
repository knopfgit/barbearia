import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { hm, today, linkWhatsApp, whatsAppNumero, MSG_WHATSAPP, STATUS_LABELS, BLOCK_REASON_LABELS } from '../util.js'
import { Spinner, Empty, StatusBadge, Modal, Field } from '../components.jsx'
import { BuscaCliente } from '../buscacliente.jsx'

export default function Agenda() {
  const [date, setDate] = useState(today())
  const [appts, setAppts] = useState(null)
  const [barbers, setBarbers] = useState([])
  const [services, setServices] = useState([])
  const [editing, setEditing] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const dirtyRef = useRef(false)
  const [blocks, setBlocks] = useState(null)
  const [blockEditing, setBlockEditing] = useState(null)
  const [scopePrompt, setScopePrompt] = useState(null)
  const [zap, setZap] = useState(null)
  const [shopName, setShopName] = useState('')
  const toast = useToast()
  const navigate = useNavigate()

  function requestOpen(target) {
    if (editing && dirtyRef.current) {
      if (!confirm('Você tem um agendamento não finalizado. Deseja descartar?')) return
    }
    dirtyRef.current = false
    setFormKey((k) => k + 1)
    setEditing(target)
  }
  function requestCloseEditing() {
    if (dirtyRef.current) {
      if (!confirm('Você tem um agendamento não finalizado. Deseja descartar?')) return
    }
    dirtyRef.current = false
    setEditing(null)
  }

  function load() {
    setAppts(null)
    api(`/appointments?date=${date}`).then(setAppts).catch(() => setAppts([]))
  }
  function loadBlocks() {
    setBlocks(null)
    api(`/timeblocks/for-day?date=${date}`).then(setBlocks).catch(() => setBlocks([]))
  }
  useEffect(load, [date])
  useEffect(loadBlocks, [date])
  useEffect(() => {
    api('/barbers').then(setBarbers)
    api('/services').then(setServices)
    api('/settings').then((s) => setShopName(s.shopName || '')).catch(() => {})
  }, [])

  const items = useMemo(() => {
    const list = [
      ...(appts || []).map((a) => ({ type: 'appt', key: `a${a.id}`, time: hm(a.startAt), data: a })),
      ...(blocks || []).map((b) => ({ type: 'block', key: `b${b.id}`, time: b.startTime, data: b })),
    ]
    list.sort((x, y) => x.time.localeCompare(y.time))
    return list
  }, [appts, blocks])

  async function removeBlock(b) {
    if (b.recurrence !== 'none') { setScopePrompt({ kind: 'delete', block: b }); return }
    if (!confirm('Excluir este bloqueio?')) return
    try {
      await api(`/timeblocks/${b.id}`, { method: 'DELETE' })
      toast.ok('Bloqueio excluído.'); loadBlocks()
    } catch (e) { toast.erro(e.message) }
  }
  async function openEditBlock(b) {
    try { setBlockEditing(await api(`/timeblocks/${b.id}`)) }
    catch (e) { toast.erro(e.message) }
  }
  async function resolveScope(scope) {
    const p = scopePrompt
    setScopePrompt(null)
    if (!p) return
    try {
      if (p.kind === 'delete') {
        const q = scope === 'occurrence' ? `?scope=occurrence&date=${date}` : ''
        await api(`/timeblocks/${p.block.id}${q}`, { method: 'DELETE' })
        toast.ok(scope === 'occurrence' ? 'Bloqueio removido só deste dia.' : 'Bloqueio excluído.')
      } else {
        const body = scope === 'occurrence'
          ? { scope: 'occurrence', date, startTime: p.payload.startTime, endTime: p.payload.endTime }
          : { scope: 'series', ...p.payload }
        await api(`/timeblocks/${p.block.id}`, { method: 'PUT', body })
        toast.ok(scope === 'occurrence' ? 'Horário ajustado só para este dia.' : 'Bloqueio atualizado.')
      }
      loadBlocks()
    } catch (e) { toast.erro(e.message) }
  }

  async function setStatus(a, status) {
    await api(`/appointments/${a.id}`, { method: 'PUT', body: { status } })
    toast.ok(`Status: ${STATUS_LABELS[status]}`); load()
  }
  async function openTicket(a) {
    try {
      const t = await api('/tickets', { method: 'POST', body: { appointmentId: a.id, clientId: a.clientId, barberId: a.barberId } })
      navigate(`/comanda?id=${t.id}`)
    } catch (e) { toast.erro(e.message) }
  }

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Operação</div><h1>Agenda</h1><p>Horários marcados por dia.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--ghost" onClick={() => setBlockEditing({})}>Bloquear horário</button>
          <button className="btn btn--primary" onClick={() => requestOpen({})}>Novo agendamento</button>
        </div>
      </div>

      <div className="agenda-toolbar">
        <button className="btn btn--sm" onClick={() => setDate(shift(date, -1))}>‹ Anterior</button>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        <button className="btn btn--sm" onClick={() => setDate(shift(date, 1))}>Próximo ›</button>
        <button className="btn btn--ghost btn--sm" onClick={() => setDate(today())}>Hoje</button>
      </div>

      {!appts || !blocks ? <Spinner /> : items.length === 0 ? (
        <div className="card"><div className="card__body"><Empty mark="🗓" title="Nenhum horário neste dia" hint="Clique em “Novo agendamento” para marcar." /></div></div>
      ) : items.map((it) => it.type === 'appt' ? (
        <div className="slot" key={it.key}>
          <div className="slot__time">{it.time}</div>
          <div className="slot__bar" style={{ background: it.data.barberColor || 'var(--accent)' }} />
          <div className="slot__main">
            <div className="slot__client">{it.data.clientName || 'Sem cliente'}</div>
            <div className="slot__meta">{it.data.serviceName || 'Serviço a definir'} · {it.data.barberName || '—'}{it.data.notes ? ` · ${it.data.notes}` : ''}</div>
          </div>
          <StatusBadge status={it.data.status} />
          <div className="row" style={{ gap: 6 }}>
            {/* Só aparece com telefone aproveitável — sem cliente ou com número
                torto, a linha fica limpa em vez de oferecer um botão morto. */}
            {whatsAppNumero(it.data.clientPhone) && (
              <button className="btn btn--sm btn--zap" title="Avisar no WhatsApp"
                aria-label={`Avisar ${it.data.clientName} no WhatsApp`}
                onClick={() => setZap(it.data)}>💬</button>
            )}
            {it.data.status !== 'done' && <button className="btn btn--sm" onClick={() => openTicket(it.data)}>Comanda →</button>}
            <select className="select btn--sm" style={{ width: 128 }} value={it.data.status} onChange={(e) => setStatus(it.data, e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn btn--ghost btn--sm" onClick={() => requestOpen(it.data)}>Editar</button>
          </div>
        </div>
      ) : (
        <div className="slot slot--block" key={it.key}>
          <div className="slot__time">{it.time}</div>
          <div className="slot__bar" style={{ background: it.data.barberColor || 'var(--faint)' }} />
          <div className="slot__main">
            <div className="slot__client">{it.data.reasonLabel}</div>
            <div className="slot__meta">
              {it.data.barberName} · {it.data.startTime}–{it.data.endTime}
              {it.data.recurrence === 'daily' ? ' · Todo dia' : it.data.recurrence === 'weekly' ? ' · Toda semana' : ''}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => openEditBlock(it.data)}>Editar</button>
            <button className="btn btn--ghost btn--sm" onClick={() => removeBlock(it.data)}>Excluir</button>
          </div>
        </div>
      ))}

      {editing && (
        <ApptModal key={formKey} appt={editing} date={date} barbers={barbers} services={services}
          dirtyRef={dirtyRef}
          onClose={requestCloseEditing}
          onSaved={(diaSalvo) => {
            dirtyRef.current = false
            setEditing(null)
            // Um encaixe pode ter jogado o agendamento pra outro dia. Sem isso, a tela
            // ficaria no dia antigo e pareceria que nada foi salvo.
            if (diaSalvo && diaSalvo !== date) setDate(diaSalvo)
            else load()
          }} />
      )}

      {blockEditing && (
        <BlockModal block={blockEditing} barbers={barbers} date={date}
          onClose={() => setBlockEditing(null)}
          onNeedsScope={(payload) => { setScopePrompt({ kind: 'edit', block: blockEditing, payload }); setBlockEditing(null) }}
          onSaved={() => { setBlockEditing(null); loadBlocks() }} />
      )}

      {zap && <ZapModal appt={zap} shopName={shopName} onClose={() => setZap(null)} />}

      {scopePrompt && (
        <ScopeModal
          text={scopePrompt.kind === 'delete'
            ? 'Este bloqueio se repete. Excluir só neste dia (o resto da série continua) ou a série inteira?'
            : 'Este bloqueio se repete. Ajustar o horário só neste dia, ou aplicar profissional/motivo/horário pra série inteira?'}
          onClose={() => setScopePrompt(null)}
          onOccurrence={() => resolveScope('occurrence')}
          onSeries={() => resolveScope('series')}
        />
      )}
    </>
  )
}

function shift(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Formata "YYYY-MM-DD" como "DD/MM/YYYY" sem passar por Date (evita parse como UTC).
function dmy(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Mini-calendário do mês: verde = tem horário livre, vermelho = lotado, para o barbeiro escolhido.
function MiniCalendar({ barberId, selectedDate, excludeId, onSelect }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7))
  const [avail, setAvail] = useState(null)

  useEffect(() => { setMonth(selectedDate.slice(0, 7)) }, [selectedDate])
  useEffect(() => {
    if (!barberId) { setAvail(null); return }
    setAvail(null)
    const q = excludeId ? `&excludeId=${excludeId}` : ''
    api(`/appointments/availability?barberId=${barberId}&month=${month}${q}`).then(setAvail).catch(() => setAvail(null))
  }, [barberId, month, excludeId])

  const [y, m] = month.split('-').map(Number)
  const firstWeekday = new Date(y, m - 1, 1).getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const todayStr = today()
  const rawLabel = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

  const cells = Array(firstWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`)

  return (
    <div className="mini-cal">
      <div className="mini-cal__head">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMonth((mo) => shiftMonth(mo, -1))}>‹</button>
        <div className="mini-cal__title">{monthLabel}</div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMonth((mo) => shiftMonth(mo, 1))}>›</button>
      </div>
      <div className="mini-cal__legend">
        <span><i className="mini-cal__dot" style={{ background: 'var(--green)' }} />Tem horário</span>
        <span><i className="mini-cal__dot" style={{ background: 'var(--oxblood)' }} />Lotado</span>
      </div>
      <div className="mini-cal__grid">
        {WEEKDAYS.map((w) => <div key={w} className="mini-cal__weekday">{w}</div>)}
        {cells.map((dt, i) => {
          if (!dt) return <div key={`b${i}`} className="mini-cal__day mini-cal__day--blank" />
          const isPast = dt < todayStr
          const status = avail?.days?.[dt]
          const cls = ['mini-cal__day']
          if (isPast) cls.push('mini-cal__day--past')
          else if (status === 'cheio') cls.push('mini-cal__day--cheio')
          else if (status === 'livre') cls.push('mini-cal__day--livre')
          if (dt === selectedDate) cls.push('mini-cal__day--selected')
          return (
            <div key={dt} className={cls.join(' ')} onClick={() => !isPast && onSelect(dt)}>
              {Number(dt.slice(8, 10))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ApptModal({ appt, date, barbers, services, dirtyRef, onClose, onSaved }) {
  const isNew = !appt.id
  const toast = useToast()
  const [apptDate, setApptDate] = useState(appt.startAt ? appt.startAt.slice(0, 10) : date)
  const [time, setTime] = useState(appt.startAt ? hm(appt.startAt) : '')
  const [clientId, setClientId] = useState(appt.clientId || '')
  const [barberId, setBarberId] = useState(appt.barberId || (barbers[0]?.id ?? ''))
  const [serviceId, setServiceId] = useState(appt.serviceId || '')
  const [notes, setNotes] = useState(appt.notes || '')
  const [busy, setBusy] = useState(false)
  const [slots, setSlots] = useState(null)
  const [slotsError, setSlotsError] = useState(false)
  const [encaixe, setEncaixe] = useState(null)
  const initialRef = useRef({ apptDate, time, clientId, barberId, serviceId, notes })

  useEffect(() => {
    if (!dirtyRef) return
    const i = initialRef.current
    dirtyRef.current = (
      apptDate !== i.apptDate ||
      time !== i.time ||
      String(clientId) !== String(i.clientId) ||
      String(barberId) !== String(i.barberId) ||
      String(serviceId) !== String(i.serviceId) ||
      notes !== i.notes
    )
  }, [apptDate, time, clientId, barberId, serviceId, notes, dirtyRef])

  const duration = services.find((s) => String(s.id) === String(serviceId))?.durationMin || ''

  useEffect(() => {
    if (!barberId || !apptDate) { setSlots(null); return }
    setSlots(null)
    setSlotsError(false)
    const q = (duration ? `&durationMin=${duration}` : '') + (isNew ? '' : `&excludeId=${appt.id}`)
    api(`/appointments/slots?barberId=${barberId}&date=${apptDate}${q}`).then(setSlots).catch(() => { setSlots([]); setSlotsError(true) })
  }, [barberId, apptDate, duration])

  // Encaixe: os próximos livres a partir do dia escolhido (e dos seguintes, se o dia
  // lotou). Sem profissional escolhido, o backend considera qualquer um ativo e diz
  // quem atende cada horário.
  useEffect(() => {
    if (!apptDate) { setEncaixe(null); return }
    setEncaixe(null)
    const q = (barberId ? `&barberId=${barberId}` : '') + (serviceId ? `&serviceId=${serviceId}` : '') + (isNew ? '' : `&excludeId=${appt.id}`)
    api(`/appointments/next-slots?date=${apptDate}${q}`).then(setEncaixe).catch(() => setEncaixe(null))
  }, [barberId, apptDate, serviceId])

  // Um chip preenche tudo de uma vez: dia, hora e — no modo "qualquer profissional" —
  // quem vai atender.
  function usarEncaixe(s) {
    if (s.date !== apptDate) setApptDate(s.date)
    if (String(s.barberId) !== String(barberId)) setBarberId(s.barberId)
    setTime(s.time)
  }

  async function save() {
    if (!barberId) return toast.erro('Escolha o profissional.')
    if (!time) return toast.erro('Escolha um horário.')
    setBusy(true)
    const startAt = `${apptDate}T${time}:00`
    try {
      if (isNew) await api('/appointments', { method: 'POST', body: { clientId, barberId, serviceId, startAt, notes } })
      else await api(`/appointments/${appt.id}`, { method: 'PUT', body: { clientId, barberId, serviceId, startAt, notes } })
      toast.ok(isNew ? 'Agendamento criado.' : 'Agendamento atualizado.'); onSaved(apptDate)
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }
  async function remove() {
    if (!confirm('Excluir este agendamento?')) return
    await api(`/appointments/${appt.id}`, { method: 'DELETE' }); toast.ok('Agendamento excluído.'); onSaved()
  }

  return (
    <Modal title={isNew ? 'Novo agendamento' : 'Editar agendamento'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn btn--danger btn--sm" onClick={remove} style={{ marginRight: 'auto' }}>Excluir</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <Field label="Profissional">
        <select className="select" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
          <option value="">— Qualquer profissional —</option>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>

      <MiniCalendar barberId={barberId} selectedDate={apptDate} excludeId={isNew ? null : appt.id} onSelect={(d) => { setApptDate(d); setTime('') }} />

      {/* Encaixe: atalho discreto pros próximos livres. Não substitui o seletor
          completo abaixo nem o horário digitado na mão. */}
      {encaixe && (
        <div style={{ margin: '0 0 13px' }}>
          {encaixe.slots.length === 0 ? (
            <div className="faint" style={{ fontSize: 12.5 }}>
              💡 Sem horários próximos — nada livre nos {encaixe.daysSearched} dias seguintes.
            </div>
          ) : (
            <>
              <div className="faint" style={{ fontSize: 12.5, marginBottom: 7 }}>
                {encaixe.otherDay
                  ? `💡 Sem vagas em ${dm(encaixe.requestedDate)} — próximo: ${dm(encaixe.slots[0].date)} às ${encaixe.slots[0].time}`
                  : '💡 Próximos livres:'}
              </div>
              <div className="slot-pick" style={{ margin: 0 }}>
                {encaixe.slots.map((s) => (
                  <button type="button" key={`${s.date}-${s.time}-${s.barberId}`}
                    className={`slot-pick__btn${s.date === apptDate && s.time === time ? ' active' : ''}`}
                    onClick={() => usarEncaixe(s)}>
                    {encaixe.otherDay ? `${dm(s.date)} ` : ''}{s.time}
                    {!barberId ? ` · ${String(s.barberName).split(' ')[0]}` : ''}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Field label={`Horário livre em ${dmy(apptDate)}`}>
        {!barberId ? (
          <div className="slot-pick__empty">Escolha o profissional para ver todos os horários do dia — ou use um encaixe acima.</div>
        ) : slots === null ? (
          <div className="slot-pick__empty">Carregando horários…</div>
        ) : slotsError ? (
          <div className="slot-pick__empty">Não foi possível carregar os horários. Tente trocar de dia ou recarregar a página.</div>
        ) : slots.length === 0 ? (
          <div className="slot-pick__empty">Nenhum horário livre nesse dia para este profissional.</div>
        ) : (
          <div className="slot-pick">
            {slots.map((s) => (
              <button type="button" key={s} className={`slot-pick__btn${s === time ? ' active' : ''}`} onClick={() => setTime(s)}>{s}</button>
            ))}
          </div>
        )}
      </Field>
      <Field label="Ou digite um horário manualmente">
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 140 }} />
      </Field>

      {/* O clientId continua sendo o estado do formulário (o dirtyRef compara ele),
          e o nome já veio no registro do agendamento — editar abre preenchido sem
          precisar buscar de novo. */}
      <BuscaCliente rotulo="Cliente" value={clientId} nomeInicial={appt.clientName || ''}
        onChange={(id) => setClientId(id)} permiteCadastro
        dica="Deixe em branco para agendar sem cliente (avulso)." />
      <Field label="Serviço">
        <select className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">— A definir —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Observações"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: cliente prefere máquina 2" /></Field>
    </Modal>
  )
}

// Criação/edição de bloqueio de horário (almoço, folga, intervalo...). Editar um
// bloqueio recorrente não salva direto: devolve o payload pro pai decidir (via
// ScopeModal) se aplica só nesse dia ou na série inteira.
function BlockModal({ block = {}, barbers, date, onClose, onSaved, onNeedsScope }) {
  const isNew = !block.id
  const toast = useToast()
  const [barberId, setBarberId] = useState(block.barberId || barbers[0]?.id || '')
  const [reason, setReason] = useState(block.reason || 'almoco')
  const [recurrence, setRecurrence] = useState(block.recurrence || 'none')
  const [weekday, setWeekday] = useState(block.weekday ?? new Date(date + 'T12:00:00').getDay())
  const [blockDate, setBlockDate] = useState(block.date || date)
  const [startTime, setStartTime] = useState(block.startTime || '12:00')
  const [endTime, setEndTime] = useState(block.endTime || '13:00')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!barberId) return toast.erro('Escolha o profissional.')
    const payload = {
      barberId, reason, recurrence, startTime, endTime,
      weekday: recurrence === 'weekly' ? weekday : undefined,
      date: recurrence === 'none' ? blockDate : undefined,
    }
    if (!isNew && block.recurrence !== 'none') { onNeedsScope(payload); return }
    setBusy(true)
    try {
      if (isNew) await api('/timeblocks', { method: 'POST', body: payload })
      else await api(`/timeblocks/${block.id}`, { method: 'PUT', body: payload })
      toast.ok(isNew ? 'Bloqueio criado.' : 'Bloqueio atualizado.'); onSaved()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'Bloquear horário' : 'Editar bloqueio'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : isNew ? 'Bloquear' : 'Salvar'}</button>
      </>}>
      <Field label="Profissional">
        <select className="select" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Motivo">
        <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
          {Object.entries(BLOCK_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Recorrência">
        <select className="select" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
          <option value="none">Pontual (só este dia)</option>
          <option value="daily">Diário</option>
          <option value="weekly">Semanal</option>
        </select>
      </Field>
      {recurrence === 'none' && (
        <Field label="Data"><input className="input" type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} /></Field>
      )}
      {recurrence === 'weekly' && (
        <Field label="Dia da semana">
          <select className="select" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
          </select>
        </Field>
      )}
      <div className="cols-2">
        <Field label="Início"><input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
        <Field label="Fim"><input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// "DD/MM" a partir de "YYYY-MM-DD", sem passar por Date (evita parse como UTC).
function dm(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

/**
 * Mensagem pronta de WhatsApp para um agendamento. NÃO envia nada: cada opção é um
 * link que abre a conversa com o texto preenchido, e quem manda é o atendente.
 * A mensagem aparece inteira aqui justamente para ser conferida antes.
 *
 * O lembrete só é oferecido no dia do horário — o texto diz "seu horário hoje", e
 * mandá-lo numa terça para um horário de sexta seria informação errada saindo em
 * nome da barbearia.
 */
function ZapModal({ appt, shopName, onClose }) {
  const nome = String(appt.clientName || '').trim().split(/\s+/)[0] || 'tudo bem'
  const barbearia = shopName || 'Barbearia'
  const hora = hm(appt.startAt)
  const dia = String(appt.startAt).slice(0, 10)
  const numero = whatsAppNumero(appt.clientPhone)

  const opcoes = [
    { chave: 'confirmacao', titulo: 'Confirmar horário', texto: MSG_WHATSAPP.confirmacao({ nome, barbearia, data: dm(dia), hora }) },
  ]
  if (dia === today()) {
    opcoes.push({ chave: 'lembrete', titulo: 'Lembrar (horário é hoje)', texto: MSG_WHATSAPP.lembrete({ nome, hora }) })
  }

  return (
    <Modal title={`WhatsApp · ${appt.clientName}`} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      <p className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Abre a conversa com <strong>+{numero}</strong> e o texto já escrito. Nada é enviado
        automaticamente — confira e mande você mesmo.
      </p>
      {opcoes.map((o) => (
        <div key={o.chave} style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{o.titulo}</div>
          <div className="zap-msg">{o.texto}</div>
          <a className="btn btn--sm btn--zap" href={linkWhatsApp(appt.clientPhone, o.texto)}
            target="_blank" rel="noopener" onClick={onClose} style={{ marginTop: 8 }}>
            💬 Abrir no WhatsApp
          </a>
        </div>
      ))}
      {opcoes.length === 1 && (
        <p className="faint" style={{ fontSize: 12 }}>
          O lembrete (“seu horário hoje”) aparece aqui no dia do agendamento.
        </p>
      )}
    </Modal>
  )
}

// Pergunta "este dia vs. série" ao editar/excluir um bloqueio recorrente.
function ScopeModal({ text, onOccurrence, onSeries, onClose }) {
  return (
    <Modal title="Bloqueio recorrente" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={onOccurrence}>Apenas este dia</button>
        <button className="btn btn--primary" onClick={onSeries}>Toda a série</button>
      </>}>
      <p>{text}</p>
    </Modal>
  )
}
