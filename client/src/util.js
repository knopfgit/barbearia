// Dinheiro é sempre centavos (inteiro) vindo do servidor.
export function brl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
/**
 * Converte texto digitado ("45,00" / "45.00" / "1.500,00" / "45") em número de reais.
 *
 * CUIDADO com o ponto: ele só é separador de MILHAR quando vêm três dígitos depois
 * ("1.500,00"). A versão anterior apagava o primeiro ponto sempre, então quem
 * digitava "150.00" no teclado numérico mandava mil e quinhentos por cento a mais —
 * R$ 15.000,00 de troco inicial, de sangria ou de desconto. Esta regra é a mesma do
 * toCents() do servidor (server/routes/_helpers.js); as duas precisam continuar iguais.
 */
export function parseMoney(str) {
  if (str == null || str === '') return 0
  const s = String(str).replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')   // ponto de milhar
    .replace(',', '.')
  const n = Number(s)
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
// Timestamps de datetime('now') do SQLite chegam em UTC e SEM sufixo "Z"
// ("2026-08-16 12:34:56"). new Date() nesse formato assume horário LOCAL, o que
// mostraria o horário 3h adiantado em Brasília. Normaliza antes de exibir:
// hm(utcDate(t.openedAt)).
export function utcDate(ts) {
  if (!ts) return null
  const iso = String(ts).replace(' ', 'T')
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
}
// "há 5 min" / "há 1h20" — espera de fila fica ilegível em minutos puros depois de 1h.
export function espera(min) {
  const m = Math.max(0, Math.floor(min || 0))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/**
 * Telefone do cliente -> número que o wa.me aceita (só dígitos, com país).
 * Devolve null quando não dá pra confiar no número, e aí a tela simplesmente não
 * oferece o botão — link de WhatsApp quebrado abriria conversa com desconhecido.
 *
 * Aceita: DDD + celular de 9 dígitos ou fixo de 8 (assume Brasil, prefixa 55) e o
 * mesmo já com o 55 na frente. O "0" de interurbano ("0 54 9999-0000") é descartado.
 *
 * A checagem NÃO é só de comprimento: um número dos EUA ("+1 415 555 2671") também
 * tem 11 dígitos e passava como se fosse celular brasileiro, abrindo conversa com um
 * desconhecido. Por isso o formato é conferido de verdade — celular brasileiro tem
 * sempre 9 como primeiro dígito do número, e fixo começa entre 2 e 5.
 *
 * Efeito colateral aceito: celular antigo guardado com 8 dígitos (sem o 9 na frente)
 * passa a não gerar botão. Ele também não seria encontrado no WhatsApp, que exige o
 * nono dígito — melhor não oferecer do que abrir conversa errada.
 */
export function whatsAppNumero(phone) {
  const digitos = String(phone || '').replace(/\D/g, '').replace(/^0+/, '')
  const nacional = digitos.length === 12 || digitos.length === 13
    ? (digitos.startsWith('55') ? digitos.slice(2) : null)
    : (digitos.length === 10 || digitos.length === 11 ? digitos : null)
  if (!nacional) return null
  const ddd = Number(nacional.slice(0, 2))
  if (!(ddd >= 11 && ddd <= 99)) return null   // não existe DDD abaixo de 11
  const numero = nacional.slice(2)
  const ehCelular = numero.length === 9 && numero[0] === '9'
  const ehFixo = numero.length === 8 && numero[0] >= '2' && numero[0] <= '5'
  if (!ehCelular && !ehFixo) return null
  return `55${nacional}`
}

// URL pronta do WhatsApp, ou null se o telefone não presta (ver whatsAppNumero).
// Nada é enviado: abre a conversa com o texto preenchido pro atendente conferir.
export function linkWhatsApp(phone, texto) {
  const numero = whatsAppNumero(phone)
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null
}

// Modelos de mensagem. O nome da barbearia vem de Configurações (settings.shopName).
export const MSG_WHATSAPP = {
  confirmacao: ({ nome, barbearia, data, hora }) =>
    `Oi ${nome}! Confirmando seu horário na ${barbearia} dia ${data} às ${hora}. Até lá! 💈`,
  lembrete: ({ nome, hora }) =>
    `Oi ${nome}! Passando pra lembrar do seu horário hoje às ${hora}. Te esperamos! 💈`,
  // Ficha do cliente: não há horário nenhum, então nada de data inventada — só a
  // saudação identificando quem está falando.
  saudacao: ({ nome, barbearia }) => `Oi ${nome}! Aqui é da ${barbearia}. Tudo bem?`,
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
export const PAYMENT_LABELS = { dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', pix: 'Pix' }
// Status da COMANDA (tickets). Fica separado do STATUS_LABELS de agendamento: os
// dois têm 'canceled', mas o resto não se parece.
export const TICKET_STATUS_LABELS = {
  open: 'Aberta', closed: 'Fechada', canceled: 'Cancelada', refunded: 'Estornada',
}
export const STATUS_LABELS = {
  scheduled: 'Agendado', confirmed: 'Confirmado', done: 'Atendido', canceled: 'Cancelado', noshow: 'Faltou',
}
export const BLOCK_REASON_LABELS = { almoco: 'Almoço', folga: 'Folga', intervalo: 'Intervalo', outro: 'Bloqueio' }
