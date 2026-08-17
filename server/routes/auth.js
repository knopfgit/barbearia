import { Router } from 'express'
import { login, destroySession, requireAuth, conferePassword, trocaPassword, usaSenhaPadrao, SENHA_PADRAO } from '../auth.js'
import { wrap } from './_helpers.js'

const r = Router()

// Limite de tentativas por IP+e-mail, em memória (sem dependência nova): evita força
// bruta contra a conta admin. Reseta ao reiniciar o servidor — aceitável pra esse porte.
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const attempts = new Map()

function isLocked(key) {
  const a = attempts.get(key)
  if (!a) return false
  if (Date.now() - a.firstAttemptAt > WINDOW_MS) { attempts.delete(key); return false }
  return a.count >= MAX_ATTEMPTS
}
function registerFailure(key) {
  const a = attempts.get(key)
  if (!a || Date.now() - a.firstAttemptAt > WINDOW_MS) attempts.set(key, { count: 1, firstAttemptAt: Date.now() })
  else a.count++
}

r.post('/login', wrap((req, res) => {
  const { email, password } = req.body || {}
  const key = `${req.ip}:${String(email || '').toLowerCase().trim()}`
  if (isLocked(key)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' })
  const result = login(email, password)
  if (!result) { registerFailure(key); return res.status(401).json({ error: 'E-mail ou senha incorretos.' }) }
  attempts.delete(key)
  res.json(result)
}))

// `senhaPadrao` avisa a tela de que a conta ainda está com a senha de primeiro
// acesso (que é pública), pra ela poder cobrar a troca.
r.get('/me', requireAuth, (req, res) => res.json({
  user: req.user,
  senhaPadrao: usaSenhaPadrao(req.user.id),
}))

const MIN_SENHA = 8

// Troca da própria senha. Até existir tela de usuários, é o único jeito de sair da
// senha de primeiro acesso — antes disso o sistema ficava preso nela pra sempre.
r.post('/password', requireAuth, wrap((req, res) => {
  const { senhaAtual, novaSenha } = req.body || {}
  if (!conferePassword(req.user.id, senhaAtual)) {
    return res.status(400).json({ error: 'Senha atual incorreta.' })
  }
  const nova = String(novaSenha || '')
  if (nova.length < MIN_SENHA) {
    return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${MIN_SENHA} caracteres.` })
  }
  if (nova === SENHA_PADRAO) {
    return res.status(400).json({ error: 'Essa é a senha de primeiro acesso, que é pública. Escolha outra.' })
  }
  if (nova === String(senhaAtual)) {
    return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' })
  }
  trocaPassword(req.user.id, nova, req.token)
  res.json({ ok: true })
}))

r.post('/logout', requireAuth, (req, res) => {
  destroySession(req.token)
  res.json({ ok: true })
})

export default r
