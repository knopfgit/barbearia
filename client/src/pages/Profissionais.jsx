import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { initials } from '../util.js'
import { Spinner, Empty, Modal, Field } from '../components.jsx'

// Cores de identificação do profissional (barrinha na agenda, iniciais no cadastro).
// Tons afinados com o tema azul-petróleo + laranja — ver :root em styles.css.
const COLORS = ['#d95a26', '#5f9ea0', '#e0a458', '#7a9e6e', '#b0503f', '#6d8fb0', '#a67ca8', '#c77b52']

export default function Profissionais() {
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null)
  function load() { api('/barbers?all=1').then(setList).catch(() => setList([])) }
  useEffect(load, [])

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Cadastros</div><h1>Profissionais</h1><p>Barbeiros e a comissão de cada um.</p></div>
        <button className="btn btn--primary" onClick={() => setEditing({})}>Novo profissional</button>
      </div>
      <div className="card">
        {!list ? <Spinner /> : list.length === 0 ? <div className="card__body"><Empty mark="♞" title="Nenhum profissional" /></div> : (
          <table className="table">
            <thead><tr><th>Profissional</th><th>Telefone</th><th className="num">Comissão</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td><div className="row" style={{ gap: 10 }}><span className="avatar" style={{ color: b.color }}>{initials(b.name)}</span><strong>{b.name}</strong></div></td>
                  <td className="muted">{b.phone || '—'}</td>
                  <td className="num">{b.commissionPct}%</td>
                  <td>{b.active ? <span className="badge badge--confirmed">Ativo</span> : <span className="badge">Inativo</span>}</td>
                  <td className="right"><button className="btn btn--ghost btn--sm" onClick={() => setEditing(b)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <BarberModal barber={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function BarberModal({ barber, onClose, onSaved }) {
  const isNew = !barber.id
  const [f, setF] = useState({ name: barber.name || '', phone: barber.phone || '', color: barber.color || COLORS[0], commissionPct: barber.commissionPct ?? 40, active: barber.active ?? 1 })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const set = (k, v) => setF({ ...f, [k]: v })

  async function save() {
    if (!f.name.trim()) return toast.erro('Informe o nome.')
    setBusy(true)
    try {
      if (isNew) await api('/barbers', { method: 'POST', body: f })
      else await api(`/barbers/${barber.id}`, { method: 'PUT', body: f })
      toast.ok(isNew ? 'Profissional cadastrado.' : 'Profissional atualizado.'); onSaved()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'Novo profissional' : f.name} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
      <Field label="Nome"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
      <div className="cols-2">
        <Field label="Telefone"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Comissão padrão (%)"><input className="input" type="number" min="0" max="100" value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></Field>
      </div>
      <Field label="Cor na agenda">
        <div className="row" style={{ gap: 8 }}>
          {COLORS.map((c) => (
            <button key={c} onClick={() => set('color', c)} title={c}
              style={{ width: 26, height: 26, borderRadius: 6, background: c, border: f.color === c ? '2px solid var(--cream)' : '1px solid var(--line)', cursor: 'pointer' }} />
          ))}
        </div>
      </Field>
      {!isNew && (
        <label className="row" style={{ gap: 8, marginTop: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} /> <span>Ativo</span>
        </label>
      )}
    </Modal>
  )
}
