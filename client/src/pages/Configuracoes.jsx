import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { Spinner, Field } from '../components.jsx'

export default function Configuracoes() {
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { api('/settings').then(setF).catch(() => setF({})) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save() {
    setBusy(true)
    try { setF(await api('/settings', { method: 'PUT', body: f })); toast.ok('Configurações salvas.') }
    catch (e) { toast.erro(e.message) }
    finally { setBusy(false) }
  }
  if (!f) return <Spinner />

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestão</div><h1>Configurações</h1><p>Dados da barbearia exibidos no sistema.</p></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 820 }}>
        <div className="card">
          <div className="card__head"><h2>Identificação</h2></div>
          <div className="card__body">
            <Field label="Nome da barbearia"><input className="input" value={f.shopName || ''} onChange={set('shopName')} /></Field>
            <Field label="Telefone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
            <Field label="Endereço"><input className="input" value={f.address || ''} onChange={set('address')} /></Field>
            <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card__head"><h2>Sobre este sistema</h2></div>
          <div className="card__body">
            <p className="muted" style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.6 }}>
              Gestão de barbearia com agenda, comanda/PDV, caixa, controle de comissões por
              profissional e relatório financeiro. Remodelado a partir da arquitetura de um
              sistema de gestão veterinária (React + Express + SQLite).
            </p>
            <div className="faint" style={{ fontSize: 12 }}>Versão 1.0.0</div>
          </div>
        </div>
      </div>
    </>
  )
}
