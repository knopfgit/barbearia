import { createApp, ensureSeeded } from './app.js'
import { resolveDbPath } from './db.js'

const PORT = Number(process.env.PORT) || 3001

const state = ensureSeeded()
const app = createApp()

app.listen(PORT, () => {
  console.log(`💈 Barbearia Control API em http://localhost:${PORT}`)
  console.log(`   Banco de dados: ${resolveDbPath()}`)
  if (state.seeded && process.env.NODE_ENV !== 'production') {
    console.log(`   Primeiro acesso → e-mail: ${state.email} · senha: ${state.pass}`)
  }
})
