import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { Field, Logo } from '../components.jsx'

export default function Login() {
  const { signIn } = useAuth()
  // Campos vazios de propósito: já vieram preenchidos com a conta e a senha de
  // primeiro acesso, e isso ia parar no bundle publicado — quem abrisse a tela
  // entrava como administrador só apertando Enter.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await signIn(email, password) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__logo"><Logo size={44} /></div>
        <h1>Barbearia Mattos</h1>
        <p className="login__sub">Entre para gerenciar a operação do dia</p>
        <Field label="E-mail">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {err && <div className="toast toast--erro" style={{ marginBottom: 12, maxWidth: 'none' }}>{err}</div>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
