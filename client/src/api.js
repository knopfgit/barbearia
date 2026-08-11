const TOKEN_KEY = 'barbearia.token'

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique a internet — os dados na tela podem estar desatualizados.', 0)
  }
  let data = null
  try { data = await res.json() } catch { /* sem corpo */ }
  if (!res.ok) throw new ApiError(data?.error || recadoPadrao(res.status), res.status)
  return data
}

function recadoPadrao(status) {
  if (status >= 500) return `O sistema não respondeu. Tente de novo em alguns segundos (erro ${status}).`
  if (status === 404) return `Esta informação não foi encontrada. Atualize a página (erro ${status}).`
  if (status === 401 || status === 403) return `Sua sessão não vale mais. Entre de novo (erro ${status}).`
  return `Não foi possível concluir (erro ${status}).`
}
