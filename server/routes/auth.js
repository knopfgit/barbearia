import { Router } from 'express'
import { login, destroySession, requireAuth } from '../auth.js'
import { wrap } from './_helpers.js'

const r = Router()

r.post('/login', wrap((req, res) => {
  const { email, password } = req.body || {}
  const result = login(email, password)
  if (!result) return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
  res.json(result)
}))

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

r.post('/logout', requireAuth, (req, res) => {
  destroySession(req.token)
  res.json({ ok: true })
})

export default r
