// Converte "R$ 45,00", "45.00", 4500 → centavos inteiros. Aceita número (reais)
// ou string. Nunca confie em float do cliente para dinheiro.
export function toCents(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Math.round(v * 100)
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function asInt(v, fallback = 0) {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

export function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

// "HH:MM" -> minutos desde 00:00, ou null se inválido.
export function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''))
  return m ? asInt(m[1]) * 60 + asInt(m[2]) : null
}

// Envolve um handler async e joga qualquer erro para o tratador central do Express.
export function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}
