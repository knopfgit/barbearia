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
  // Nada impede duas instâncias do sistema abrirem o mesmo arquivo (atalho clicado
  // duas vezes, `npm start` com o `npm run dev` aberto). No modo padrão, a segunda
  // faz as escritas da primeira falharem com "database is locked" no meio da
  // operação — foi assim que apareceram comandas fechadas sem lançamento no caixa.
  // WAL deixa leitor e escritor conviverem; busy_timeout faz esperar em vez de
  // estourar na hora. Dois escritores continuam serializados, mas o erro fica raro.
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA busy_timeout = 5000;')
  runMigrations(db)
  return db
}

// Profundidade de transação por conexão. SQLite não aninha BEGIN, e há operação que
// chama outra já transacional (a fila chama createTicket) — a de dentro participa da
// transação de fora em vez de abrir a própria.
const profundidade = new WeakMap()

/**
 * Roda os passos numa transação: ou tudo grava, ou nada grava. Qualquer exceção
 * desfaz o que já tinha sido escrito e sobe para o tratador central responder em pt.
 *
 * BEGIN IMMEDIATE (e não BEGIN puro) porque, com WAL ligado, o BEGIN diferido só
 * pega o lock de escrita no primeiro INSERT/UPDATE — se outra instância do sistema
 * escreveu nesse intervalo, a falha viria NO MEIO da operação, justamente o que se
 * quer evitar. IMMEDIATE pega o lock na abertura e o busy_timeout vale para a espera.
 */
export function runInTransaction(db, fn) {
  if ((profundidade.get(db) || 0) > 0) return fn()   // já dentro de uma transação
  db.exec('BEGIN IMMEDIATE')
  profundidade.set(db, 1)
  try {
    const resultado = fn()
    db.exec('COMMIT')
    return resultado
  } catch (e) {
    try { db.exec('ROLLBACK') } catch { /* já desfeita pelo próprio SQLite */ }
    throw e
  } finally {
    profundidade.set(db, 0)
  }
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
