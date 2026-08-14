import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { hm, today, STATUS_LABELS } from '../util.js'
import { Spinner, Empty, StatusBadge, Modal, Field } from '../components.jsx'

export default function Agenda() {
  const [date, setDate] = useState(today())
  const [appts, setAppts] = useState(null)
  const [barbers, setBarbers] = useState([])
  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [editing, setEditing] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const dirtyRef = useRef(false)
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
  useEffect(load, [date])
  useEffect(() => {
    api('/barbers').then(setBarbers)
    api('/clients').then(setClients)
    api('/services').then(setServices)
  }, [])

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
        <button className="btn btn--primary" onClick={() => requestOpen({})}>Novo agendamento</button>
      </div>

      <div className="agenda-toolbar">
        <button className="btn btn--sm" onClick={() => setDate(shift(date, -1))}>‹ Anterior</button>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        <button className="btn btn--sm" onClick={() => setDate(shift(date, 1))}>Próximo ›</button>
        <button className="btn btn--ghost btn--sm" onClick={() => setDate(today())}>Hoje</button>
      </div>

      {!appts ? <Spinner /> : appts.length === 0 ? (
        <div className="card"><div className="card__body"><Empty mark="🗓" title="Nenhum horário neste dia" hint="Clique em “Novo agendamento” para marcar." /></div></div>
      ) : appts.map((a) => (
        <div className="slot" key={a.id}>
          <div className="slot__time">{hm(a.startAt)}</div>
          <div className="slot__bar" style={{ background: a.barberColor || 'var(--brass)' }} />
          <div className="slot__main">
            <div className="slot__client">{a.clientName || 'Sem cliente'}</div>
            <div className="slot__meta">{a.serviceName || 'Serviço a definir'} · {a.barberName || '—'}{a.notes ? ` · ${a.notes}` : ''}</div>
          </div>
          <StatusBadge status={a.status} />
          <div className="row" style={{ gap: 6 }}>
            {a.status !== 'done' && <button className="btn btn--sm" onClick={() => openTicket(a)}>Comanda →</button>}
            <select className="select btn--sm" style={{ width: 128 }} value={a.status} onChange={(e) => setStatus(a, e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn btn--ghost btn--sm" onClick={() => requestOpen(a)}>Editar</button>
          </div>
        </div>
      ))}

      {editing && (
        <ApptModal key={formKey} appt={editing} date={date} barbers={barbers} clients={clients} services={services}
          dirtyRef={dirtyRef}
          onClose={requestCloseEditing}
          onSaved={() => { dirtyRef.current = false; setEditing(null); load() }} />
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

function ApptModal({ appt, date, barbers, clients, services, dirtyRef, onClose, onSaved }) {
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

  async function save() {
    if (!barberId) return toast.erro('Escolha o profissional.')
    if (!time) return toast.erro('Escolha um horário.')
    setBusy(true)
    const startAt = `${apptDate}T${time}:00`
    try {
      if (isNew) await api('/appointments', { method: 'POST', body: { clientId, barberId, serviceId, startAt, notes } })
      else await api(`/appointments/${appt.id}`, { method: 'PUT', body: { clientId, barberId, serviceId, startAt, notes } })
      toast.ok(isNew ? 'Agendamento criado.' : 'Agendamento atualizado.'); onSaved()
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
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>

      <MiniCalendar barberId={barberId} selectedDate={apptDate} excludeId={isNew ? null : appt.id} onSelect={(d) => { setApptDate(d); setTime('') }} />

      <Field label={`Horário livre em ${dmy(apptDate)}`}>
        {slots === null ? (
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

      <Field label="Cliente">
        <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— Sem cliente / avulso —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
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
