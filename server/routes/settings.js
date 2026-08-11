import { Router } from 'express'
import { getDb } from '../db.js'
import { wrap } from './_helpers.js'

const r = Router()
const DEFAULTS = { shopName: 'Minha Barbearia', address: '', phone: '', accent: '#c8a15a' }

r.get('/', wrap((req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = { ...DEFAULTS }
  for (const row of rows) out[row.key] = row.value
  res.json(out)
}))

r.put('/', wrap((req, res) => {
  const db = getDb()
  const body = req.body || {}
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const [k, v] of Object.entries(body)) stmt.run(k, v == null ? '' : String(v))
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = { ...DEFAULTS }
  for (const row of rows) out[row.key] = row.value
  res.json(out)
}))

export default r
