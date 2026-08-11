// Dados de demonstração (só em desenvolvimento). Idempotente por checagem de
// contagem: não duplica se já houver barbeiros cadastrados.
export function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM barbers').get().n > 0) return

  const barbers = [
    ['Rafael Souza', '(54) 99911-0001', '#c8a15a', 50],
    ['Diego Martins', '(54) 99911-0002', '#7aa2f7', 45],
    ['Bruno Lima', '(54) 99911-0003', '#9ece6a', 40],
  ]
  const bIns = db.prepare('INSERT INTO barbers (name, phone, color, commissionPct) VALUES (?,?,?,?)')
  const bIds = barbers.map((b) => Number(bIns.run(...b).lastInsertRowid))

  const services = [
    ['Corte masculino', 4500, 30, null],
    ['Barba', 3000, 20, null],
    ['Corte + Barba', 7000, 45, null],
    ['Corte infantil', 3500, 30, null],
    ['Sobrancelha', 1500, 10, null],
    ['Pigmentação de barba', 6000, 40, 30],
    ['Platinado', 15000, 90, 25],
  ]
  const sIns = db.prepare('INSERT INTO services (name, price, durationMin, commissionPct) VALUES (?,?,?,?)')
  const sIds = services.map((s) => Number(sIns.run(...s).lastInsertRowid))

  const products = [
    ['Pomada modeladora', 'POM-01', 3500, 1800, 24, 10],
    ['Shampoo barba', 'SHB-01', 4200, 2200, 15, 10],
    ['Óleo para barba', 'OLE-01', 3900, 2000, 18, 10],
    ['Minoxidil 5%', 'MIN-01', 8900, 5000, 9, 10],
  ]
  const pIns = db.prepare('INSERT INTO products (name, sku, price, cost, stock, commissionPct) VALUES (?,?,?,?,?,?)')
  products.forEach((p) => pIns.run(...p))

  const clients = [
    ['João Pereira', '(54) 98800-1001', 'joao@email.com'],
    ['Carlos Eduardo', '(54) 98800-1002', 'cadu@email.com'],
    ['Marcos Antônio', '(54) 98800-1003', null],
    ['Felipe Nogueira', '(54) 98800-1004', 'felipe@email.com'],
    ['Anderson Silva', '(54) 98800-1005', null],
  ]
  const cIns = db.prepare('INSERT INTO clients (name, phone, email) VALUES (?,?,?)')
  const cIds = clients.map((c) => Number(cIns.run(...c).lastInsertRowid))

  // Agenda de hoje: alguns horários espalhados.
  const day = new Date().toISOString().slice(0, 10)
  const aIns = db.prepare(
    'INSERT INTO appointments (clientId, barberId, serviceId, startAt, durationMin, price, status) VALUES (?,?,?,?,?,?,?)'
  )
  const slots = [
    [cIds[0], bIds[0], sIds[0], '09:00', 'confirmed'],
    [cIds[1], bIds[1], sIds[2], '09:30', 'scheduled'],
    [cIds[2], bIds[0], sIds[1], '10:15', 'scheduled'],
    [cIds[3], bIds[2], sIds[3], '11:00', 'confirmed'],
    [cIds[4], bIds[1], sIds[0], '14:00', 'scheduled'],
  ]
  for (const [cid, bid, sid, hm, st] of slots) {
    const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(sid)
    aIns.run(cid, bid, sid, `${day}T${hm}:00`, svc.durationMin, svc.price, st)
  }
}
