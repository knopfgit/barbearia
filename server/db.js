import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrations as MIGRATIONS } from './migrations/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = join(__dirname, 'data', 'barbearia.db')

export function resolveDbPath() {
  return process.env.DB_PATH || DEFAULT_DB_PATH
}

let db = null

export function getDb() {
  if (db) return db
  const path = resolveDbPath()
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON;')
  runMigrations(db)
  return db
}

/**
 * Runner de migrations versionadas. Roda o que ainda falta, na ordem do array,
 * cada uma na sua transação. Mesmo padrão do sistema original: se uma falhar,
 * ela é desfeita por inteiro e o processo aborta, para o banco nunca ficar
 * num estado meio migrado.
 */
export function runMigrations(d, lista = MIGRATIONS) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );`)
  const aplicadas = new Set(d.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id))
  const pendentes = lista.filter((m) => !aplicadas.has(m.id))
  for (const m of pendentes) {
    d.exec('BEGIN')
    try {
      m.up(d)
      d.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id)
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      console.error(`Falha na migration ${m.id}:`, e.message)
      throw e
    }
  }
  return pendentes.map((m) => m.id)
}
