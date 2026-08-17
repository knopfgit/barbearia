import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, getToken, setToken } from './api.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())
  // Conta ainda com a senha de primeiro acesso (que é pública): a tela cobra a troca.
  const [senhaPadrao, setSenhaPadrao] = useState(false)

  const check = useCallback(() => {
    if (!getToken()) { setLoading(false); return }
    setLoading(true)
    api('/auth/me')
      .then((d) => { setUser(d.user); setSenhaPadrao(!!d.senhaPadrao) })
      .catch((e) => { if (e.status === 401 || e.status === 403) { setToken(null); setUser(null) } })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { check() }, [check])

  async function signIn(email, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } })
    setToken(token); setUser(user)
    api('/auth/me').then((d) => setSenhaPadrao(!!d.senhaPadrao)).catch(() => {})
  }
  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
    setToken(null); setUser(null); setSenhaPadrao(false)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, senhaPadrao, revalidar: check }}>
      {children}
    </AuthContext.Provider>
  )
}
