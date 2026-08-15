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
  const setBool = (k) => (e) => setF({ ...f, [k]: e.target.checked ? '1' : '0' })

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
          <div className="card__head"><h2>Expediente</h2></div>
          <div className="card__body">
            <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
              Usado para calcular a disponibilidade no mini-calendário da Agenda (dias lotados vs. com horário livre).
            </p>
            <div className="cols-2">
              <Field label="Abertura"><input className="input" type="time" value={f.openTime || ''} onChange={set('openTime')} /></Field>
              <Field label="Fechamento"><input className="input" type="time" value={f.closeTime || ''} onChange={set('closeTime')} /></Field>
            </div>
            <Field label="Duração do slot (minutos)">
              <input className="input" type="number" min="5" step="5" value={f.slotMinutes || ''} onChange={set('slotMinutes')} style={{ maxWidth: 120 }} />
            </Field>
            <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card__head"><h2>Fidelidade</h2></div>
          <div className="card__body">
            <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={f.loyaltyEnabled === '1' || f.loyaltyEnabled === undefined} onChange={setBool('loyaltyEnabled')} />
              <span>Programa de fidelidade ativo</span>
            </label>
            <Field label="Pontos por real gasto">
              <input className="input" type="number" min="0" step="0.5" value={f.loyaltyPointsPerReal ?? ''} onChange={set('loyaltyPointsPerReal')} style={{ maxWidth: 120 }} />
            </Field>
            <div className="cols-2">
              <Field label="Nível Prata a partir de (visitas)"><input className="input" type="number" min="0" value={f.loyaltyTierPrata ?? ''} onChange={set('loyaltyTierPrata')} /></Field>
              <Field label="Nível Ouro a partir de (visitas)"><input className="input" type="number" min="0" value={f.loyaltyTierOuro ?? ''} onChange={set('loyaltyTierOuro')} /></Field>
            </div>
            <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card__head"><h2>Sobre este sistema</h2></div>
          <div className="card__body">
            <p className="muted" style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.6 }}>
              Sistema de gestão para barbearia: agenda, comanda, caixa, comissões,
              estoque e fidelidade.
            </p>
            <div className="faint" style={{ fontSize: 12 }}>Versão 1.0.0</div>
          </div>
        </div>
      </div>
    </>
  )
}
