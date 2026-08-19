import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
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
          <div className="card__head"><h2>Comissão</h2></div>
          <div className="card__body">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Comissão quando há desconto</div>
            <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'flex-start', flexWrap: 'nowrap', marginBottom: 10 }}>
              <input type="radio" name="commissionOnDiscount" style={{ marginTop: 3 }}
                checked={(f.commissionOnDiscount || 'cheio') !== 'liquido'}
                onChange={() => setF({ ...f, commissionOnDiscount: 'cheio' })} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>Sobre o valor cheio</strong>
                <span className="muted" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5 }}>
                  O profissional recebe a comissão do preço de tabela — o desconto sai todo da barbearia.
                </span>
              </span>
            </label>
            <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <input type="radio" name="commissionOnDiscount" style={{ marginTop: 3 }}
                checked={f.commissionOnDiscount === 'liquido'}
                onChange={() => setF({ ...f, commissionOnDiscount: 'liquido' })} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>Sobre o valor com desconto</strong>
                <span className="muted" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5 }}>
                  O desconto da comanda é dividido entre os itens (proporcional ao valor de cada um) antes
                  de calcular a comissão — profissional e barbearia dividem o desconto.
                </span>
              </span>
            </label>
            <p className="faint" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Vale para as comandas fechadas daqui em diante. Comandas já fechadas não mudam.
            </p>
            <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <TrocarSenha />
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

// Troca da senha da conta que está logada. Enquanto a senha for a de primeiro
// acesso (pública), o cartão avisa em vermelho — é o único jeito de sair dela.
function TrocarSenha() {
  const { senhaPadrao, revalidar } = useAuth()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function trocar() {
    if (novaSenha !== repetir) return toast.erro('A confirmação não bate com a nova senha.')
    setBusy(true)
    try {
      await api('/auth/password', { method: 'POST', body: { senhaAtual, novaSenha } })
      setSenhaAtual(''); setNovaSenha(''); setRepetir('')
      toast.ok('Senha alterada. Quem estava logado com a senha antiga foi desconectado.')
      revalidar()
    } catch (e) { toast.erro(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card__head"><h2>Senha de acesso</h2></div>
      <div className="card__body">
        {senhaPadrao && (
          <p style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--oxblood-text)' }}>
            ⚠ Esta conta ainda usa a senha de primeiro acesso, que é pública.
            Troque antes de deixar o sistema acessível a outras pessoas.
          </p>
        )}
        <Field label="Senha atual">
          <input className="input" type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
        </Field>
        <Field label="Nova senha (mínimo 8 caracteres)">
          <input className="input" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        </Field>
        <Field label="Repita a nova senha">
          <input className="input" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </Field>
        <button className="btn btn--primary" onClick={trocar} disabled={busy || !senhaAtual || !novaSenha}>
          {busy ? 'Trocando…' : 'Trocar senha'}
        </button>
      </div>
    </div>
  )
}
