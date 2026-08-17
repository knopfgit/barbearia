import express from 'express'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { getDb } from './db.js'
import { requireAuth } from './auth.js'
import { hashPassword } from './auth.js'
import { seed } from './seed.js'

import authRoutes from './routes/auth.js'
import clients from './routes/clients.js'
import barbers from './routes/barbers.js'
import services from './routes/services.js'
import products from './routes/products.js'
import appointments from './routes/appointments.js'
import tickets from './routes/tickets.js'
import cash from './routes/cash.js'
import reports from './routes/reports.js'
import settings from './routes/settings.js'
import stock from './routes/stock.js'
import loyalty from './routes/loyalty.js'
import timeblocks from './routes/timeblocks.js'
import queue from './routes/queue.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))
  app.use('/api/auth', authRoutes)

  // Tudo abaixo exige sessão.
  app.use('/api', requireAuth)
  app.use('/api/clients', clients)
  app.use('/api/barbers', barbers)
  app.use('/api/services', services)
  app.use('/api/products', products)
  app.use('/api/appointments', appointments)
  app.use('/api/tickets', tickets)
  app.use('/api/cash', cash)
  app.use('/api/reports', reports)
  app.use('/api/settings', settings)
  app.use('/api/stock', stock)
  app.use('/api/loyalty', loyalty)
  app.use('/api/timeblocks', timeblocks)
  app.use('/api/queue', queue)

  // Front compilado (npm run build) servido pelo mesmo processo em produção.
  const dist = join(__dirname, '..', 'dist')
  if (existsSync(dist)) {
    app.use(express.static(dist))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      res.sendFile(join(dist, 'index.html'))
    })
  }

  // Tratador central: mensagem em português, status coerente.
  app.use((err, req, res, next) => {
    // Erro de entrada (4xx) é operação normal — vira uma linha. Stack trace só para
    // o que é defeito de verdade, senão o log some debaixo de validação recusada.
    if (err?.status >= 400 && err.status < 500) console.warn(`${req.method} ${req.originalUrl} → ${err.status}: ${err.message}`)
    else console.error(err)
    if (res.headersSent) return next(err)
    // SQLITE_BUSY (5): outra instância do sistema está escrevendo no mesmo banco.
    // Sem isso, o balcão via "database is locked" em inglês, sem saber que era só
    // esperar e repetir.
    const ocupado = err?.errcode === 5 || /database (is locked|table is locked)/i.test(err?.message || '')
    if (ocupado) return res.status(503).json({ error: 'O sistema está ocupado por outro acesso. Tente de novo em instantes.' })
    // `extras` deixa a rota mandar junto o que a tela precisa pra reagir (ex.: pedir
    // confirmação de venda sem estoque), em vez de só a mensagem.
    res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.', ...(err.extras || {}) })
  })

  return app
}

// Cria o admin e os dados de demonstração no primeiro boot (banco vazio).
export function ensureSeeded() {
  const db = getDb()
  const hasUser = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0
  if (!hasUser) {
    const email = (process.env.ADMIN_EMAIL || 'admin@barbearia.local').toLowerCase()
    const pass = process.env.ADMIN_PASSWORD || 'admin123'
    db.prepare('INSERT INTO users (name, email, passwordHash, role) VALUES (?,?,?,?)')
      .run('Administrador', email, hashPassword(pass), 'admin')
    if (process.env.NODE_ENV !== 'production') seed(db)
    return { seeded: true, email, pass }
  }
  return { seeded: false }
}
