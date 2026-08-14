// Schema da barbearia. Dinheiro é SEMPRE em centavos (inteiro) para não ter
// erro de arredondamento de float. Datas/horas em ISO 8601 (texto).
export const migrations = [
  {
    id: '0001_base',
    up(d) {
      d.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'staff',      -- admin | staff
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sessions (
          token TEXT PRIMARY KEY,
          userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          expiresAt TEXT NOT NULL
        );

        CREATE TABLE barbers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          color TEXT NOT NULL DEFAULT '#c8a15a',
          commissionPct REAL NOT NULL DEFAULT 40,  -- % padrão de comissão
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          birthdate TEXT,
          notes TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price INTEGER NOT NULL DEFAULT 0,        -- centavos
          durationMin INTEGER NOT NULL DEFAULT 30,
          commissionPct REAL,                       -- NULL = usa a do barbeiro
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sku TEXT,
          price INTEGER NOT NULL DEFAULT 0,        -- centavos, venda
          cost INTEGER NOT NULL DEFAULT 0,         -- centavos, custo
          stock INTEGER NOT NULL DEFAULT 0,
          commissionPct REAL NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE appointments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          clientId INTEGER REFERENCES clients(id) ON DELETE SET NULL,
          barberId INTEGER REFERENCES barbers(id) ON DELETE SET NULL,
          serviceId INTEGER REFERENCES services(id) ON DELETE SET NULL,
          startAt TEXT NOT NULL,                    -- ISO
          durationMin INTEGER NOT NULL DEFAULT 30,
          price INTEGER NOT NULL DEFAULT 0,         -- snapshot em centavos
          status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|confirmed|done|canceled|noshow
          notes TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_appointments_start ON appointments(startAt);
        CREATE INDEX idx_appointments_barber ON appointments(barberId, startAt);

        CREATE TABLE cash_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          openedBy INTEGER REFERENCES users(id),
          openedAt TEXT NOT NULL DEFAULT (datetime('now')),
          openingFloat INTEGER NOT NULL DEFAULT 0,  -- troco inicial (centavos)
          closedBy INTEGER REFERENCES users(id),
          closedAt TEXT,
          closingCounted INTEGER,                   -- dinheiro contado no fechamento
          expectedCash INTEGER,                     -- esperado em dinheiro
          difference INTEGER,                       -- contado - esperado
          status TEXT NOT NULL DEFAULT 'open',      -- open|closed
          notes TEXT
        );

        CREATE TABLE tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          clientId INTEGER REFERENCES clients(id) ON DELETE SET NULL,
          barberId INTEGER REFERENCES barbers(id) ON DELETE SET NULL,
          appointmentId INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
          cashSessionId INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'open',      -- open|closed|canceled
          subtotal INTEGER NOT NULL DEFAULT 0,
          discount INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0,
          paymentMethod TEXT,                       -- dinheiro|debito|credito|pix
          openedAt TEXT NOT NULL DEFAULT (datetime('now')),
          closedAt TEXT,
          notes TEXT
        );
        CREATE INDEX idx_tickets_status ON tickets(status);
        CREATE INDEX idx_tickets_closed ON tickets(closedAt);

        CREATE TABLE ticket_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticketId INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,                       -- service|product
          refId INTEGER,
          description TEXT NOT NULL,
          barberId INTEGER REFERENCES barbers(id) ON DELETE SET NULL,
          qty INTEGER NOT NULL DEFAULT 1,
          unitPrice INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0,
          commissionPct REAL NOT NULL DEFAULT 0,
          commissionValue INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_items_ticket ON ticket_items(ticketId);
        CREATE INDEX idx_items_barber ON ticket_items(barberId);

        CREATE TABLE cash_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sessionId INTEGER REFERENCES cash_sessions(id) ON DELETE CASCADE,
          type TEXT NOT NULL,                       -- sale|in|out
          amount INTEGER NOT NULL,                  -- centavos (sempre positivo)
          method TEXT,                              -- dinheiro|debito|credito|pix
          description TEXT,
          ticketId INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
          userId INTEGER REFERENCES users(id),
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `)
    },
  },
  {
    id: '0002_estoque',
    up(d) {
      d.exec(`
        ALTER TABLE products ADD COLUMN minStock INTEGER NOT NULL DEFAULT 0;

        -- Movimentações manuais de estoque (entrada|saida|ajuste). qty é sempre o delta
        -- efetivamente aplicado ao estoque (positivo em entrada, negativo em saida/ajuste
        -- que reduz), pra virar um extrato consistente.
        CREATE TABLE stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          type TEXT NOT NULL,                       -- entrada|saida|ajuste
          qty INTEGER NOT NULL,                     -- delta aplicado (pode ser negativo)
          reason TEXT,
          userId INTEGER REFERENCES users(id),
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_stock_movements_product ON stock_movements(productId, createdAt);

        -- Ficha técnica: quanto de cada produto/insumo um serviço consome por execução.
        CREATE TABLE service_consumables (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serviceId INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          qty INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX idx_service_consumables_service ON service_consumables(serviceId);

        -- Snapshot do consumo real no momento da venda (a ficha técnica pode mudar depois,
        -- isso preserva o histórico e é o que se reverte se o item for removido/cancelado).
        CREATE TABLE ticket_item_consumables (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticketItemId INTEGER NOT NULL REFERENCES ticket_items(id) ON DELETE CASCADE,
          productId INTEGER REFERENCES products(id) ON DELETE SET NULL,
          productName TEXT NOT NULL,
          qty INTEGER NOT NULL
        );
        CREATE INDEX idx_ticket_item_consumables_item ON ticket_item_consumables(ticketItemId);
      `)
    },
  },
  {
    id: '0003_fidelidade',
    up(d) {
      d.exec(`
        -- Extrato de pontos de fidelidade por cliente. points é sempre positivo; type
        -- define o sinal do efeito no saldo (credito soma, debito/ajuste-negativo subtrai).
        CREATE TABLE loyalty_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          clientId INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          type TEXT NOT NULL,                       -- credito|debito
          points INTEGER NOT NULL,
          reason TEXT,
          ticketId INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
          userId INTEGER REFERENCES users(id),
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_loyalty_client ON loyalty_movements(clientId, createdAt);
      `)
    },
  },
  {
    id: '0004_time_blocks',
    up(d) {
      d.exec(`
        -- Indisponibilidade de barbeiro (almoço, folga, intervalo...), fora da tabela de
        -- agendamentos porque não é atendimento de cliente. Uma regra pode ser pontual
        -- (date), diária ou semanal (weekday), com início/fim de vigência opcionais.
        CREATE TABLE time_blocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          barberId INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
          reason TEXT NOT NULL DEFAULT 'outro',      -- almoco|folga|intervalo|outro
          recurrence TEXT NOT NULL DEFAULT 'none',   -- none|daily|weekly
          weekday INTEGER,                           -- 0(Dom)-6(Sáb), só p/ weekly
          date TEXT,                                 -- YYYY-MM-DD, só p/ none
          startTime TEXT NOT NULL,                   -- HH:MM
          endTime TEXT NOT NULL,                     -- HH:MM
          startDate TEXT,                            -- vigência: a partir de quando (daily/weekly)
          endDate TEXT,                               -- vigência: até quando (opcional)
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_time_blocks_barber ON time_blocks(barberId);

        -- Exceção de um dia específico dentro de uma regra recorrente. skip = nesse dia
        -- não há bloqueio; override = nesse dia o bloqueio é em outro horário. Uma exceção
        -- sempre vence a regra recorrente pro dia em questão.
        CREATE TABLE time_block_exceptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          blockId INTEGER NOT NULL REFERENCES time_blocks(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          type TEXT NOT NULL,                        -- skip|override
          startTime TEXT,                            -- só p/ override
          endTime TEXT,                               -- só p/ override
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX idx_time_block_exceptions_unique ON time_block_exceptions(blockId, date);
      `)
    },
  },
]
