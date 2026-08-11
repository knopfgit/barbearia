import { useEffect, useMemo, useState } from 'react'
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
  const toast = useToast()
  const navigate = useNavigate()

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
        <button className="btn btn--primary" onClick={() => setEditing({})}>Novo agendamento</button>
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
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(a)}>Editar</button>
          </div>
        </div>
      ))}

      {editing && (
        <ApptModal appt={editing} date={date} barbers={barbers} clients={clients} services={services}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}
    </>
  )
}

function shift(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function ApptModal({ appt, date, barbers, clients, services, onClose, onSaved }) {
  const isNew = !appt.id
  const toast = useToast()
  const [time, setTime] = useState(appt.startAt ? hm(appt.startAt) : '09:00')
  const [clientId, setClientId] = useState(appt.clientId || '')
  const [barberId, setBarberId] = useState(appt.barberId || (barbers[0]?.id ?? ''))
  const [serviceId, setServiceId] = useState(appt.serviceId || '')
  const [notes, setNotes] = useState(appt.notes || '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!barberId) return toast.erro('Escolha o profissional.')
    setBusy(true)
    const startAt = `${date}T${time}:00`
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
      <div className="cols-2">
        <Field label="Horário"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Profissional">
          <select className="select" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      </div>
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
