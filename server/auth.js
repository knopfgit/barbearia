import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { getDb } from './db.js'

const TOKEN_TTL_DAYS = 30

export function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), 10)
}

export function createSession(userId) {
  const db = getDb()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 864e5).toISOString()
  db.prepare('INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, userId, expiresAt)
  return token
}

export function login(email, password) {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(String(email || '').toLowerCase().trim())
  if (!user) return null
  if (!bcrypt.compareSync(String(password), user.passwordHash)) return null
  const token = createSession(user.id)
  return { token, user: publicUser(user) }
}

export function userFromToken(token) {
  if (!token) return null
  const db = getDb()
  const sess = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!sess) return null
  if (new Date(sess.expiresAt) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(sess.userId)
  return user ? publicUser(user) : null
}

export function destroySession(token) {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role }
}

// Middleware: exige sessão válida. 401 quando falta ou vence — o front trata
// 401/403 como "sua sessão não vale mais" e manda para o login.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const user = userFromToken(token)
  if (!user) return res.status(401).json({ error: 'Sua sessão não vale mais. Entre de novo com a sua conta.' })
  req.user = user
  req.token = token
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Esta ação é só para a administração.' })
  next()
}
