import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, getToken, setToken } from './api.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  const check = useCallback(() => {
    if (!getToken()) { setLoading(false); return }
    setLoading(true)
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch((e) => { if (e.status === 401 || e.status === 403) { setToken(null); setUser(null) } })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { check() }, [check])

  async function signIn(email, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } })
    setToken(token); setUser(user)
  }
  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
    setToken(null); setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>
}
