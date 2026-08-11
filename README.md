# Barbearia · Sistema de Gestão

Sistema web para gestão de barbearia: **agenda, comanda/PDV, caixa, controle de
comissões por profissional e relatório financeiro**.

Foi **remodelado a partir da arquitetura do sistema veterinário (`Vet`)** que você
enviou — mesma pilha e mesmos padrões (React 18 + React Router, Express,
`node:sqlite` com migrations versionadas, autenticação com bcrypt + token,
dinheiro em centavos, mensagens de erro em português voltadas ao balcão).

## Como o domínio foi remapeado

| Sistema veterinário (original) | Barbearia (este projeto) |
| --- | --- |
| Tutores | **Clientes** |
| Veterinários / profissionais | **Profissionais (barbeiros)** com % de comissão |
| Banho & tosa, consultas, cirurgias… | **Serviços** (corte, barba, combo, platinado…) |
| Estoque / produtos | **Produtos** (pomadas, cosméticos) |
| Agenda / schedule | **Agenda** de horários |
| PDV / Balcão / Caixa | **Comanda/PDV** + **Caixa** |
| Financeiro | **Financeiro** + **comissões por barbeiro** |
| Internação, vacinas, NFS-e, marketplace… | *removidos — não fazem sentido numa barbearia* |

O ganho principal específico de barbearia é o **cálculo de comissão por item da
comanda**: cada serviço/produto pode ser atribuído a um profissional diferente,
a comissão sai do % do serviço (ou, se vazio, do % padrão do barbeiro), e o
Financeiro consolida quanto repassar a cada um.

## Rodando

Requer **Node 22+** (usa o módulo nativo `node:sqlite`).

```bash
npm install
npm run dev      # sobe API (3001) + front com Vite (5173)
```

Acesse `http://localhost:5173`. No primeiro boot é criado um usuário e dados de
demonstração:

- **e-mail:** `admin@barbearia.local`
- **senha:** `admin123`

Para produção (um único processo servindo API + front compilado):

```bash
npm run build
npm start        # http://localhost:3001
```

Variáveis de ambiente úteis (`.env`): `PORT`, `DB_PATH`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `NODE_ENV=production` (não gera dados de demonstração).

## Estrutura

```
server/
  index.js            boot
  app.js              wiring do Express, guarda de sessão, seed do primeiro acesso
  db.js               conexão sqlite + runner de migrations
  auth.js             bcrypt + sessões por token
  migrations/         schema versionado
  routes/             auth, clients, barbers, services, products,
                      appointments, tickets (comanda), cash, reports, settings
  seed.js             dados de demonstração (só em dev)
client/src/
  App.jsx             rotas + layout + barra lateral
  api.js auth.jsx toast.jsx util.js components.jsx
  pages/              Login, Dashboard, Agenda, Comanda, Caixa, Clientes,
                      Profissionais, Servicos, Produtos, Financeiro, Configuracoes
  styles.css          design system (preto quente + latão)
```

## Fluxo de uso

1. **Caixa** → abrir caixa (troco inicial).
2. **Agenda** → marcar horário e, na hora, abrir a comanda direto do agendamento.
3. **Comanda/PDV** → adicionar serviços/produtos, atribuir profissional por item,
   aplicar desconto, escolher forma de pagamento e fechar. O valor entra no caixa.
4. **Financeiro** → faturamento por período, por forma de pagamento, por dia e
   **comissão a repassar por profissional**.
5. Fim do expediente: **Caixa** → fechar, conferindo o dinheiro contado.
