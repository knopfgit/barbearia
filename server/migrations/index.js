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
]
