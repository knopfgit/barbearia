import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { brl, linkWhatsApp, MSG_WHATSAPP } from '../util.js'
import { Spinner, Empty, Modal, Field } from '../components.jsx'

export default function Clientes() {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const toast = useToast()

  function load() { api(`/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setList).catch(() => setList([])) }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [q])

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Cadastros</div><h1>Clientes</h1><p>Base de clientes da barbearia.</p></div>
        <button className="btn btn--primary" onClick={() => setEditing({})}>Novo cliente</button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Buscar por nome ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} />
      </div>
      <div className="card">
        {!list ? <Spinner /> : list.length === 0 ? <div className="card__body"><Empty mark="☻" title="Nenhum cliente" hint="Cadastre o primeiro cliente." /></div> : (
          <table className="table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="muted">{c.phone || '—'}</td>
                  <td className="muted">{c.email || '—'}</td>
                  <td className="right"><button className="btn btn--ghost btn--sm" onClick={() => setEditing(c)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <ClientModal client={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function ClientModal({ client, onClose, onSaved }) {
  const isNew = !client.id
  const [f, setF] = useState({ name: client.name || '', phone: client.phone || '', email: client.email || '', birthdate: client.birthdate || '', notes: client.notes || '' })
  const [history, setHistory] = useState([])
  const [shopName, setShopName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => { if (!isNew) api(`/clients/${client.id}`).then((d) => setHistory(d.history || [])) }, [])
  useEffect(() => { api('/settings').then((s) => setShopName(s.shopName || '')).catch(() => {}) }, [])

  // Sem horário nenhum aqui, então nada de data inventada: a mensagem é só a
  // saudação identificando a barbearia. Segue o campo enquanto é digitado, então
  // corrigir o telefone já libera o botão.
  const linkZap = linkWhatsApp(f.phone, MSG_WHATSAPP.saudacao({
    nome: String(f.name || '').trim().split(/\s+/)[0] || 'tudo bem',
    barbearia: shopName || 'Barbearia',
  }))

  async function save() {
    if (!f.name.trim()) return toast.erro('Informe o nome.')
    setBusy(true)
    try {
      if (isNew) await api('/clients', { method: 'POST', body: f })
      else await api(`/clients/${client.id}`, { method: 'PUT', body: f })
      toast.ok(isNew ? 'Cliente cadastrado.' : 'Cliente atualizado.'); onSaved()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }
  async function remove() {
    if (!confirm('Excluir este cliente?')) return
    await api(`/clients/${client.id}`, { method: 'DELETE' }); toast.ok('Cliente excluído.'); onSaved()
  }

  return (
    <Modal title={isNew ? 'Novo cliente' : f.name} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn btn--danger btn--sm" onClick={remove} style={{ marginRight: 'auto' }}>Excluir</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <Field label="Nome"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
      <div className="cols-2">
        <Field label="Telefone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Nascimento"><input className="input" type="date" value={f.birthdate || ''} onChange={set('birthdate')} /></Field>
      </div>
      <div className="row" style={{ margin: '-4px 0 14px' }}>
        {linkZap ? (
          <a className="btn btn--sm btn--zap" href={linkZap} target="_blank" rel="noopener">💬 Abrir no WhatsApp</a>
        ) : (
          <button className="btn btn--sm" disabled title="Cliente sem telefone válido para WhatsApp">💬 Abrir no WhatsApp</button>
        )}
        {!linkZap && <span className="faint" style={{ fontSize: 12 }}>Cliente sem telefone válido para WhatsApp.</span>}
      </div>
      <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
      <Field label="Observações"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
      {!isNew && history.length > 0 && (
        <>
          <div className="eyebrow" style={{ margin: '8px 0' }}>Últimos atendimentos</div>
          {history.map((h) => (
            <div className="spread" key={h.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
              <span className="muted">{h.closedAt?.slice(0, 10)} · {h.barber || '—'}</span>
              <span className="money">{brl(h.total)}</span>
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}
