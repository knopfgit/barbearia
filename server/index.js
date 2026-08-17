import { createApp, ensureSeeded } from './app.js'
import { getDb, resolveDbPath } from './db.js'
import { usaSenhaPadrao } from './auth.js'

const PORT = Number(process.env.PORT) || 3001

const state = ensureSeeded()
const app = createApp()

// Contas que continuam na senha de primeiro acesso (pública no README). Avisa alto,
// porque é o tipo de coisa que passa batido até o dia em que o sistema fica exposto.
function contasComSenhaPadrao() {
  return getDb().prepare('SELECT id, email FROM users WHERE active = 1').all()
    .filter((u) => usaSenhaPadrao(u.id))
}

app.listen(PORT, () => {
  console.log(`💈 Barbearia Control API em http://localhost:${PORT}`)
  console.log(`   Banco de dados: ${resolveDbPath()}`)
  if (state.seeded && process.env.NODE_ENV !== 'production') {
    console.log(`   Primeiro acesso → e-mail: ${state.email} · senha: ${state.pass}`)
  }
  const pendentes = contasComSenhaPadrao()
  if (pendentes.length) {
    console.warn(`\n   ⚠  ATENÇÃO: ${pendentes.length} conta(s) ainda com a senha de primeiro acesso: ${pendentes.map((u) => u.email).join(', ')}`)
    console.warn('      Essa senha é pública (README). Troque em Configurações → Senha de acesso.\n')
  }
})
