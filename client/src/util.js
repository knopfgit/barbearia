// Dinheiro é sempre centavos (inteiro) vindo do servidor.
export function brl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
// Converte texto digitado ("45,00" / "45.00" / "45") em número de reais para enviar.
export function parseMoney(str) {
  if (str == null || str === '') return 0
  const n = Number(String(str).replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
export function hm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
export function dia(iso) {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}
// Usa componentes locais (não toISOString/UTC) para não adiantar o dia perto da
// virada UTC (~21h em Brasília, UTC-3).
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
export const PAYMENT_LABELS = { dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', pix: 'Pix' }
export const STATUS_LABELS = {
  scheduled: 'Agendado', confirmed: 'Confirmado', done: 'Atendido', canceled: 'Cancelado', noshow: 'Faltou',
}
