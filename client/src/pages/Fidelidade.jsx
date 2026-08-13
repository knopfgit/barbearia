import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { hm } from '../util.js'
import { Spinner, Empty, Field, Modal } from '../components.jsx'

const TIER_LABELS = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' }

export default function Fidelidade() {
  const [data, setData] = useState(null)
  const [adjust, setAdjust] = useState(null) // cliente selecionado pra ajuste
  const [history, setHistory] = useState(null) // cliente selecionado pra histórico
  const toast = useToast()

  const load = useCallback(() => api('/loyalty/clients').then(setData).catch(() => setData({ settings: {}, clients: [] })), [])
  useEffect(load, [load])

  if (!data) return <Spinner />
  const { settings, clients } = data

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Gestão</div><h1>Fidelidade</h1>
          <p>{settings.enabled ? `${settings.pointsPerReal} ponto(s) por real gasto · Prata a partir de ${settings.tierPrata} visitas · Ouro a partir de ${settings.tierOuro}` : 'Programa desativado em Configurações.'}</p>
        </div>
      </div>

      <div className="card">
        {clients.length === 0 ? <div className="card__body"><Empty mark="♥" title="Nenhum cliente cadastrado" /></div> : (
          <table className="table">
            <thead><tr><th>Cliente</th><th className="num">Visitas</th><th>Nível</th><th className="num">Pontos</th><th></th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="num">{c.visits}</td>
                  <td><span className={`badge badge--${c.tier}`}>{TIER_LABELS[c.tier]}</span></td>
                  <td className="num mono">{c.points}</td>
                  <td className="right">
                    <button className="btn btn--ghost btn--sm" onClick={() => setHistory(c)}>Histórico</button>{' '}
                    <button className="btn btn--ghost btn--sm" onClick={() => setAdjust(c)}>Ajustar pontos</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adjust && <AdjustModal client={adjust} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); load() }} toast={toast} />}
      {history && <HistoryModal client={history} onClose={() => setHistory(null)} />}
    </>
  )
}

function AdjustModal({ client, onClose, onDone, toast }) {
  const [type, setType] = useState('credito')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api('/loyalty/adjust', { method: 'POST', body: { clientId: client.id, type, points, reason } })
      toast.ok('Pontos ajustados.'); onDone()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title={`Ajustar pontos — ${client.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn--primary" onClick={submit} disabled={busy}>{busy ? 'Salvando…' : 'Confirmar'}</button></>}>
      <Field label="Tipo">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="credito">Crédito (adicionar pontos)</option>
          <option value="debito">Débito (remover pontos)</option>
        </select>
      </Field>
      <Field label="Pontos"><input className="input" type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} autoFocus /></Field>
      <Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: resgate de brinde, correção manual" /></Field>
    </Modal>
  )
}

function HistoryModal({ client, onClose }) {
  const [d, setD] = useState(null)
  useEffect(() => { api(`/loyalty/clients/${client.id}`).then(setD).catch(() => setD({ movements: [] })) }, [client.id])

  return (
    <Modal title={`Histórico — ${client.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      {!d ? <Spinner /> : d.movements.length === 0 ? <Empty mark="—" title="Sem movimentações ainda" /> : (
        <table className="table">
          <thead><tr><th>Quando</th><th>Tipo</th><th>Motivo</th><th className="num">Pontos</th></tr></thead>
          <tbody>
            {d.movements.map((m) => (
              <tr key={m.id}>
                <td className="mono">{hm(m.createdAt)}</td>
                <td>{m.type === 'credito' ? 'Crédito' : 'Débito'}</td>
                <td className="muted">{m.reason || '—'}</td>
                <td className="num" style={{ color: m.type === 'debito' ? 'var(--oxblood)' : 'var(--green)' }}>{m.type === 'debito' ? '−' : '+'}{m.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
