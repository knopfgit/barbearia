/**
 * Ícones de traço do menu, desenhados aqui mesmo — sem biblioteca.
 *
 * Um conjunto só, com a mesma régua: caixa de 24, traço de 1.5, pontas e cantos
 * arredondados, nada preenchido. Antes cada item do menu era um glifo solto
 * (▣ 🗓 ⏳ ✂ ▤ ☻ ♞ ≣ ▦ $ ▥ ♥ ⚙): pesos e tamanhos diferentes entre si, e os
 * emojis ainda vinham COLORIDOS pelo sistema, brigando com a paleta da casa.
 *
 * A cor vem de `currentColor`, então o ícone acompanha o estado do item (apagado,
 * creme no hover, laranja no ativo) sem nenhuma regra extra.
 */

const TRACO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const DESENHOS = {
  // Painel: quatro blocos — a visão geral do dia
  painel: <><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /></>,
  // Agenda: folhinha
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  // Fila: ampulheta
  fila: <><path d="M7 3h10M7 21h10" /><path d="M8 3v3.5c0 1.8 1.3 3.3 2.9 4.2.7.4.7 1.2 0 1.6C9.3 13.2 8 14.7 8 16.5V21" /><path d="M16 3v3.5c0 1.8-1.3 3.3-2.9 4.2-.7.4-.7 1.2 0 1.6 1.6.9 2.9 2.4 2.9 4.2V21" /></>,
  // Comanda: tesoura
  comanda: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M16.5 16.5 7 4M7.5 16.5 17 4" /></>,
  // Caixa: gaveta com a fresta do dinheiro
  caixa: <><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 11h19M9.5 15.5h5" /></>,
  // Clientes: pessoa
  clientes: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>,
  // Profissionais: duas pessoas (a equipe)
  profissionais: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M18 14.8c2.1.6 3.5 2.2 3.5 4.4" /></>,
  // Serviços: lista do cardápio
  servicos: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  // Produtos: caixa fechada
  produtos: <><path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5v-9Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  // Financeiro: barras subindo
  financeiro: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  // Estoque: prateleiras
  estoque: <><rect x="3" y="3" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /><path d="M7 6.5h.01M7 17.5h.01" /></>,
  // Fidelidade: coração
  fidelidade: <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20Z" />,
  // Configurações: engrenagem simplificada
  configuracoes: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  // Menu do celular
  menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />,
}

export function Icone({ nome, size = 18, className }) {
  const desenho = DESENHOS[nome]
  if (!desenho) return null
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...TRACO}>
      {desenho}
    </svg>
  )
}
