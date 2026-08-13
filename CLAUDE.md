# CLAUDE.md — Barbearia (Sistema de Gestão)

Contexto e regras da casa para o Claude Code. Leia antes de mexer no código.

## O que é

Sistema web de gestão para **uma barbearia** (single-tenant): agenda, comanda/PDV,
caixa, clientes, profissionais, serviços, produtos/estoque com insumos, relatórios
financeiros, análise de uso de estoque e programa de fidelidade.

Foi remodelado a partir da arquitetura de um sistema veterinário, reaproveitando a
mesma stack e os mesmos padrões.

## Stack

- **Frontend:** React 18 + react-router-dom v6, build com **Vite**. Sem TypeScript.
- **Backend:** Node.js (>= 22) + Express.
- **Banco:** SQLite via **`node:sqlite`** nativo (`DatabaseSync`) — por isso exige
  Node 22+. Sem ORM, SQL escrito à mão com prepared statements.
- **Auth:** senha com `bcryptjs` + sessão por token opaco (hex) na tabela `sessions`.

## Como rodar

```bash
npm install
npm run dev      # API em :3001 + Vite em :5173 (proxy /api -> 3001)
```

Produção (um processo só, servindo o front compilado):

```bash
npm run build && npm start   # http://localhost:3001
```

Login criado no primeiro boot (banco vazio): **admin@barbearia.local / admin123**.
Em ambiente não-produção, `server/seed.js` popula dados de demonstração.
Variáveis: `PORT`, `DB_PATH`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV`.

## Estrutura

```
server/
  index.js            boot (porta, credenciais no primeiro acesso)
  app.js              wiring do Express, guarda de sessão, seed inicial, static do dist/
  db.js               conexão SQLite + runner de migrations versionadas
  auth.js             bcrypt + sessões por token (TTL 30 dias)
  migrations/index.js schema versionado (array de { id, up })
  routes/             auth, clients, barbers, services, products, appointments,
                      tickets, cash, reports, settings, stock, loyalty
  routes/_helpers.js  toCents, asInt, num, bool, clamp, hmToMin, wrap (async error catcher)
  seed.js             dados de demonstração (idempotente, só fora de produção)
client/
  index.html
  src/App.jsx         rotas + layout + sidebar (NAV)
  src/api.js          fetch helper (token em localStorage 'barbearia.token')
  src/auth.jsx        contexto de auth (só 401/403 encerram a sessão)
  src/util.js         brl(), parseMoney(), hm(), dia(), today(), PAYMENT_LABELS...
  src/components.jsx  Spinner, Empty, StatusBadge, Modal, Field
  src/toast.jsx       ToastProvider + useToast (ok/erro/info)
  src/styles.css      design system inteiro (variáveis CSS no topo)
  src/pages/          Login, Dashboard, Agenda, Comanda, Caixa, Clientes,
                      Profissionais, Servicos, Produtos, Financeiro,
                      Estoque, Fidelidade, Configuracoes
vite.config.js        root em client/, build para ../dist, proxy /api
```

## Convenções OBRIGATÓRIAS (não quebrar)

1. **Dinheiro SEMPRE em centavos (inteiro)** no banco e na API. Nunca usar float
   para valor. Converta entrada do usuário com `toCents()` (backend) /
   `parseMoney()` (frontend) e exiba com `brl()`. **Cuidado:** `toCents()` espera
   REAIS — nunca passe um valor que já está em centavos para ele (foi a causa de um
   bug real: preço de serviço multiplicado por 100 ao abrir comanda pela agenda).
2. **Tudo em português** — labels de UI, mensagens de erro, comentários. Público é o
   balcão da barbearia.
3. **Comissão:** serviço usa `service.commissionPct`; se for `NULL`, cai na
   `barber.commissionPct`. Produto usa a `product.commissionPct` própria. A comissão
   é calculada **por item** da comanda (cada item pode ter um profissional).
4. **Checkout exige caixa aberto** (o backend recusa com erro em português).
5. **Migrations são versionadas e imutáveis.** Nunca edite uma migration já existente
   (0001, 0002, 0003). Para mudar schema, **adicione uma nova** `{ id: '000N_...', up }`
   no array de `server/migrations/index.js`. O runner aplica só o que falta.
6. **Erros de API:** retornar `res.status(4xx).json({ error: 'mensagem em pt' })`.
   Handlers async usam o wrapper `wrap()`.
7. **Estoque:** venda de produto e consumo de insumo baixam estoque ao lançar na
   comanda e devolvem ao remover/cancelar. Movimentações manuais (entrada/saída/
   ajuste) vão para `stock_movements`. O consumo de insumo por serviço fica em
   `service_consumables` (ficha técnica) + snapshot em `ticket_item_consumables`.

## Modelo de dados (resumo)

users, sessions, barbers, clients, services, products, appointments, cash_sessions,
tickets, ticket_items, cash_movements, settings, service_consumables,
ticket_item_consumables, stock_movements, loyalty_movements.

- `products.active = 0` significa **insumo interno** (não vendido no PDV, só consumido).
- `products.minStock` alimenta o alerta de estoque baixo.
- Fidelidade: pontos creditados no checkout (config em `settings`, tabela
  `loyalty_movements`), níveis bronze/prata/ouro por nº de visitas.

## Como testar

Não há suíte automatizada. O jeito usado até aqui: subir o servidor numa porta de
teste, logar via `POST /api/auth/login`, e exercitar a API com curl/script. O
sandbox reaparava processos entre comandos, então (naquele ambiente) servidor +
teste + kill iam num comando só. Localmente, basta `npm run dev` e testar na UI.
Sempre rode `npm run build` para garantir que o front compila antes de finalizar.

## Estado atual / cuidados

- Sistema funcional e revisado. Um bug de conversão de centavos (comanda aberta a
  partir do agendamento) foi corrigido em `server/routes/tickets.js` (não repassar
  `unitPrice` já em centavos para `addItem`).
- **Fuso horário:** datas usam `datetime('now')` (UTC do SQLite) e o front usa
  `new Date().toISOString()` (UTC). Para o Brasil (UTC-3), vendas após ~21h podem
  cair no relatório do dia seguinte. Melhoria pendente.
- **Transações:** operações multi-passo (checkout, baixa de estoque, cancelamento)
  não estão envolvidas em transação SQLite. Risco baixo com um usuário, mas é uma
  blindagem pendente.

## Aprimoramentos sugeridos (backlog, não obrigatórios)

- Robustez: tratar fuso horário (Brasília) nos relatórios; transações no banco.
- UX: mostrar "faltam X pontos" de fidelidade no checkout; busca de cliente ao abrir
  comanda; substituir `confirm()` do navegador por modal; aviso de aniversário.
- Features: recibo/comprovante (PDF) da comanda; filtro de agenda por profissional na
  UI; exportar relatórios (CSV/PDF).
- Visual: paleta trocável nas variáveis CSS do topo de `client/src/styles.css`
  (`--brass`, `--ink` etc.) quando a identidade da barbearia for definida.

## Visão de futuro (NÃO implementar agora — só contexto)

A ideia de longo prazo é virar uma **plataforma multi-tenant** (várias barbearias
assinando, cada uma com painel/tema isolado e dados protegidos), com **app para o
cliente final** (Play Store / App Store: agendamento, preços, preferências) e um
**marketplace** de produtos com comissão. Nada disso é para agora — a prioridade
atual é polir o sistema single-tenant e preparar a apresentação para o cliente.

## Preferências de trabalho

- Faça mudanças pequenas e revisáveis; explique o que mudou.
- Mantenha o estilo do código existente (sem TypeScript, sem libs novas sem motivo).
- Não suba `node_modules`, `dist` nem `server/data/*.db` (já no `.gitignore`).
- Commits e mensagens podem ser em português.
