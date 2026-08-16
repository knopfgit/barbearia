import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useToast } from '../toast.jsx'
import { hm, utcDate, espera } from '../util.js'
import { Spinner, Empty, Modal, Field } from '../components.jsx'

export default function Fila() {
  const [fila, setFila] = useState(null)
  const [barbers, setBarbers] = useState([])
  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [barberId, setBarberId] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  // O tempo de espera vem calculado do servidor (waitMin) e aqui só corre o
  // cronômetro por cima, contando a partir de quando a lista chegou — assim o
  // relógio da máquina do balcão, certo ou errado, não muda a conta.
  const carregadoEm = useRef(Date.now())
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(() => (
    api('/queue').then((rows) => {
      carregadoEm.current = Date.now()
      setAgora(Date.now())
      setFila(rows)
    }).catch(() => setFila([]))
  ), [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api('/barbers').then((bs) => { setBarbers(bs); setBarberId((cur) => cur || bs[0]?.id || '') })
    api('/clients').then(setClients)
    api('/services').then(setServices)
  }, [])

  const decorrido = Math.floor((agora - carregadoEm.current) / 60000)
  const barbeiro = barbers.find((b) => String(b.id) === String(barberId))
  const pedindoEsse = useMemo(
    () => (fila || []).filter((q) => String(q.preferredBarberId) === String(barberId)).length,
    [fila, barberId]
  )
  const semPreferencia = useMemo(() => (fila || []).filter((q) => !q.preferredBarberId).length, [fila])

  async function chamar(rota, corpo) {
    if (!barberId) return toast.erro('Escolha o profissional que vai atender.')
    setBusy(true)
    try {
      const t = await api(rota, { method: 'POST', body: corpo })
      toast.ok(`Comanda #${t.id} aberta para ${t.clientName || 'cliente avulso'}.`)
      navigate(`/comanda?id=${t.id}`)
    } catch (e) { toast.erro(e.message); setBusy(false); load() }
  }
  async function desistir(item) {
    if (!confirm(`Tirar ${nomeDe(item)} da fila?`)) return
    try {
      await api(`/queue/${item.id}/give-up`, { method: 'POST' })
      toast.info(`${nomeDe(item)} saiu da fila.`); load()
    } catch (e) { toast.erro(e.message); load() }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Operação</div>
          <h1>Fila de espera</h1>
          <p>Ordem de chegada, respeitando quem pediu um profissional.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setAdicionando(true)}>+ Adicionar à fila</button>
      </div>

      <div className="fila">
        <div>
          {!fila ? <Spinner /> : fila.length === 0 ? (
            <div className="card"><div className="card__body">
              <Empty mark="⏳" title="Ninguém na fila" hint="Clique em “Adicionar à fila” quando alguém chegar sem hora marcada." />
            </div></div>
          ) : fila.map((q, i) => (
            <div className="slot" key={q.id}>
              <div className="slot__time">{i + 1}º</div>
              <div className="slot__bar" style={{ background: q.preferredBarberColor || 'var(--faint)' }} />
              <div className="slot__main">
                <div className="slot__client">
                  {nomeDe(q)}
                  {!q.clientId && <span className="badge" style={{ marginLeft: 8 }}>Avulso</span>}
                </div>
                <div className="slot__meta">
                  {q.serviceName || 'Serviço a definir'}
                  {q.preferredBarberName ? ` · quer ${q.preferredBarberName}` : ' · qualquer profissional'}
                  {' · '}chegou {hm(utcDate(q.createdAt))}
                </div>
              </div>
              <span className="badge badge--scheduled" title="Tempo de espera">
                {espera((q.waitMin || 0) + decorrido)}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn--sm" disabled={busy}
                  onClick={() => chamar(`/queue/${q.id}/call`, { barberId })}>
                  Chamar{barbeiro ? ` · ${barbeiro.name.split(' ')[0]}` : ''}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => desistir(q)}>Desistiu</button>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card__head"><h2>Chamar próximo</h2></div>
          <div className="card__body">
            <Field label="Profissional que liberou">
              <select className="select" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
                {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <button className="btn btn--primary btn--block" disabled={busy || !fila?.length}
              onClick={() => chamar('/queue/call-next', { barberId })}>
              {busy ? 'Chamando…' : 'Chamar próximo →'}
            </button>
            <p className="faint" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Puxa primeiro quem pediu {barbeiro ? barbeiro.name.split(' ')[0] : 'este profissional'}
              {' '}({pedindoEsse} na fila); não havendo, o mais antigo sem preferência ({semPreferencia}).
              Abre a comanda e leva você direto pra ela.
            </p>
          </div>
        </div>
      </div>

      {adicionando && (
        <FilaModal clients={clients} services={services} barbers={barbers}
          onClose={() => setAdicionando(false)}
          onSaved={() => { setAdicionando(false); load() }} />
      )}
    </>
  )
}

function nomeDe(item) {
  return item.clientName || item.guestName || 'Sem nome'
}

// Entrada na fila: cliente cadastrado (com busca, a lista cresce) ou avulso, que
// existe só pelo nome. Serviço e preferência são opcionais — o balcão costuma só
// anotar o nome e resolver o resto na cadeira.
function FilaModal({ clients, services, barbers, onClose, onSaved }) {
  const [aba, setAba] = useState('cadastrado')
  const [busca, setBusca] = useState('')
  const [clientId, setClientId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [preferredBarberId, setPreferredBarberId] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const achados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = termo
      ? clients.filter((c) => c.name.toLowerCase().includes(termo) || String(c.phone || '').includes(termo))
      : clients
    return lista.slice(0, 40)
  }, [clients, busca])

  async function salvar() {
    const corpo = aba === 'cadastrado'
      ? { clientId, serviceId, preferredBarberId }
      : { guestName, serviceId, preferredBarberId }
    if (aba === 'cadastrado' && !clientId) return toast.erro('Escolha o cliente.')
    if (aba === 'avulso' && !guestName.trim()) return toast.erro('Informe o nome.')
    setBusy(true)
    try {
      await api('/queue', { method: 'POST', body: corpo })
      toast.ok('Entrou na fila.'); onSaved()
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  return (
    <Modal title="Adicionar à fila" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={salvar} disabled={busy}>{busy ? 'Salvando…' : 'Entrar na fila'}</button>
      </>}>
      <div className="catalog-tabs" style={{ marginBottom: 14 }}>
        <button className={`chip-tab${aba === 'cadastrado' ? ' active' : ''}`} onClick={() => setAba('cadastrado')}>Cliente cadastrado</button>
        <button className={`chip-tab${aba === 'avulso' ? ' active' : ''}`} onClick={() => setAba('avulso')}>Avulso (só o nome)</button>
      </div>

      {aba === 'cadastrado' ? (
        <>
          <Field label="Buscar cliente">
            <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou telefone" autoFocus />
          </Field>
          <Field label="Cliente">
            {/* A opção vazia precisa existir: num <select size=n> sem valor, o navegador
                realça a primeira linha, e o operador acharia que já escolheu alguém. */}
            <select className="select" size={6} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Escolha o cliente —</option>
              {achados.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </Field>
          {achados.length === 0 && <p className="faint" style={{ fontSize: 12, marginTop: -8 }}>Nenhum cliente encontrado — use a aba “Avulso”.</p>}
        </>
      ) : (
        <Field label="Nome">
          <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Ex.: Zé da esquina" autoFocus />
        </Field>
      )}

      <Field label="Serviço (opcional)">
        <select className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">— A definir na cadeira —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Profissional preferido (opcional)">
        <select className="select" value={preferredBarberId} onChange={(e) => setPreferredBarberId(e.target.value)}>
          <option value="">— Qualquer um (atende mais rápido) —</option>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
    </Modal>
  )
}
