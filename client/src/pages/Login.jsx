import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { Field } from '../components.jsx'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('admin@barbearia.local')
  const [password, setPassword] = useState('admin123')
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
        <div className="login__pole" aria-hidden />
        <h1>Barbearia</h1>
        <p className="login__sub">Entre para gerenciar a operação do dia</p>
        <Field label="E-mail">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {err && <div className="toast toast--erro" style={{ marginBottom: 12, maxWidth: 'none' }}>{err}</div>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="faint" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
          Acesso de demonstração já preenchido
        </p>
      </form>
    </div>
  )
}
