import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { Field, Modal } from './components.jsx'
import { useToast } from './toast.jsx'

const DEBOUNCE_MS = 280
const MAX_RESULTADOS = 8

/**
 * Busca de cliente conforme se digita, consumindo GET /api/clients?q= (o mesmo
 * filtro por nome OU telefone que a tela de Clientes usa).
 *
 * Substitui o <select> com a base inteira: com a lista crescendo, achar "Anderson"
 * numa combo de centenas de nomes é pior do que digitar três letras. Nada é
 * pré-carregado — só busca quando alguém digita.
 *
 * `value` é o id selecionado ('' = sem cliente) e continua vivendo na tela que usa o
 * componente, então nenhum fluxo de salvar muda. `nomeInicial` pré-preenche a
 * seleção sem ida ao servidor: na edição de agendamento o nome já veio junto do
 * registro (appt.clientName).
 *
 * `permiteCadastro` liga o cadastro rápido: quando a busca não acha ninguém, o
 * rodapé do dropdown vira um botão que abre o mini-formulário (nome + telefone) e,
 * ao salvar, seleciona o cliente recém-criado pelo MESMO caminho de quem foi
 * escolhido na lista — inclusive disparando o onChange, que é o que faz a Agenda
 * marcar o formulário como não finalizado. Sem a prop, o vazio mostra só a
 * mensagem.
 */
export function BuscaCliente({
  value, onChange, nomeInicial = '', rotulo = 'Cliente', dica = '',
  placeholder = 'Digite o nome ou o telefone…', permiteCadastro = false, autoFocus = false,
}) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [destacado, setDestacado] = useState(-1)
  // Nome do que está selecionado. Começa no nomeInicial pra edição já abrir preenchida.
  const [nomeSel, setNomeSel] = useState(nomeInicial)
  const [telSel, setTelSel] = useState('')
  // Nome digitado que abriu o cadastro (null = formulário fechado).
  const [cadastrando, setCadastrando] = useState(null)

  const caixaRef = useRef(null)
  const inputRef = useRef(null)
  // Sequência da busca: resposta que chega atrasada, depois de o usuário ter digitado
  // mais, é descartada. Sem isso o dropdown pisca o resultado de um termo antigo.
  const seqRef = useRef(0)

  const selecionado = value !== '' && value != null

  // Busca com debounce: digitar "Anderson" dispararia oito requisições sem isto.
  useEffect(() => {
    if (selecionado) return
    const q = termo.trim()
    if (!q) { setResultados([]); setBuscando(false); return }
    setBuscando(true)
    const seq = ++seqRef.current
    const t = setTimeout(() => {
      api(`/clients?q=${encodeURIComponent(q)}`)
        .then((lista) => { if (seq === seqRef.current) { setResultados(lista); setBuscando(false); setDestacado(lista.length ? 0 : -1) } })
        .catch(() => { if (seq === seqRef.current) { setResultados([]); setBuscando(false) } })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [termo, selecionado])

  // Clique fora fecha o dropdown (mesma ideia do Escape no Modal).
  useEffect(() => {
    if (!aberto) return
    const onDown = (e) => { if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberto])

  function escolhe(c) {
    setNomeSel(c.name); setTelSel(c.phone || '')
    setTermo(''); setResultados([]); setAberto(false); setDestacado(-1)
    onChange(c.id, c)
  }

  function limpa() {
    setNomeSel(''); setTelSel(''); setTermo(''); setResultados([]); setDestacado(-1)
    onChange('', null)
    // Trocar de cliente é quase sempre pra digitar outro nome logo em seguida.
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function onKeyDown(e) {
    const lista = resultados.slice(0, MAX_RESULTADOS)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!lista.length) return
      e.preventDefault()
      setAberto(true)
      setDestacado((i) => {
        const passo = e.key === 'ArrowDown' ? 1 : -1
        return (i + passo + lista.length) % lista.length
      })
    } else if (e.key === 'Enter') {
      // Só sequestra o Enter quando há um item destacado — senão o Enter continua
      // valendo para o formulário em volta.
      if (aberto && lista[destacado]) { e.preventDefault(); escolhe(lista[destacado]) }
    } else if (e.key === 'Escape') {
      if (aberto) { e.preventDefault(); setAberto(false) }
    }
  }

  if (selecionado) {
    return (
      <Field label={rotulo}>
        <div className="busca__sel">
          <div className="busca__sel-nome">
            {nomeSel || 'Cliente selecionado'}
            {telSel && <span className="faint" style={{ fontWeight: 400 }}> · {telSel}</span>}
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={limpa} title="Escolher outro cliente">✕ trocar</button>
        </div>
      </Field>
    )
  }

  const lista = resultados.slice(0, MAX_RESULTADOS)
  const temTermo = termo.trim().length > 0
  const mostraPainel = aberto && temTermo

  return (
    <>
      <Field label={rotulo}>
        <div className="busca" ref={caixaRef}>
          <input
            ref={inputRef}
            className="input"
            value={termo}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onChange={(e) => { setTermo(e.target.value); setAberto(true) }}
            onFocus={() => setAberto(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={mostraPainel}
            aria-autocomplete="list"
            aria-controls="busca-cliente-lista"
            aria-activedescendant={destacado >= 0 && lista[destacado] ? `busca-cliente-${lista[destacado].id}` : undefined}
          />
          {buscando && <span className="spinner spinner--inline busca__carregando" aria-label="Buscando" />}

          {mostraPainel && (
            <div className="busca__painel">
              {lista.length > 0 ? (
                <ul className="busca__lista" id="busca-cliente-lista" role="listbox">
                  {lista.map((c, i) => (
                    <li key={c.id} id={`busca-cliente-${c.id}`} role="option" aria-selected={i === destacado}
                      className={`busca__item${i === destacado ? ' destacado' : ''}`}
                      onMouseEnter={() => setDestacado(i)}
                      onMouseDown={(e) => e.preventDefault()}   // não tirar o foco do input antes do clique
                      onClick={() => escolhe(c)}>
                      <span className="busca__item-nome">{c.name}</span>
                      {c.phone && <span className="faint">{c.phone}</span>}
                    </li>
                  ))}
                  {resultados.length > MAX_RESULTADOS && (
                    <li className="busca__mais">
                      Mostrando {MAX_RESULTADOS} de {resultados.length} — escreva mais para afinar a busca.
                    </li>
                  )}
                </ul>
              ) : !buscando && (
                <div className="busca__vazio">
                  Nenhum cliente encontrado
                  {permiteCadastro && (
                    <div>
                      <button type="button" className="btn btn--sm" style={{ marginTop: 8 }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setAberto(false); setCadastrando(termo.trim()) }}>
                        + Cadastrar “{termo.trim()}”
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {dica && <small className="faint" style={{ display: 'block', marginTop: 5, fontSize: 11 }}>{dica}</small>}
      </Field>

      {/* Fora do <Field>: ele é um <label>, e clique em qualquer descendente de
          label é reencaminhado pro campo — os cliques do modal iriam parar no
          input da busca. */}
      {cadastrando !== null && (
        <NovoClienteModal nomeInicial={cadastrando} onClose={() => setCadastrando(null)}
          onCriado={(c) => { setCadastrando(null); escolhe(c) }} />
      )}
    </>
  )
}

/**
 * Cadastro rápido: só o que o balcão precisa na hora de atender (nome e telefone).
 * O resto da ficha — e-mail, nascimento, observações — fica na tela de Clientes;
 * pedir tudo aqui é atravessar a fila com um formulário.
 *
 * Reaproveita o POST /api/clients da tela de Clientes, que já devolve o cliente
 * criado com id — é ele que volta pro onCriado e vira a seleção da busca.
 */
function NovoClienteModal({ nomeInicial, onClose, onCriado }) {
  const [name, setName] = useState(nomeInicial)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function salva() {
    if (!name.trim()) return toast.erro('Informe o nome do cliente.')
    setBusy(true)
    try {
      const criado = await api('/clients', { method: 'POST', body: { name: name.trim(), phone: phone.trim() || null } })
      toast.ok(`${criado.name} cadastrado.`)
      onCriado(criado)
    } catch (e) { toast.erro(e.message); setBusy(false) }
  }

  // Enter salva: o cadastro acontece no meio do atendimento, com gente esperando.
  const aoTeclar = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!busy) salva() } }

  return (
    <Modal title="Novo cliente" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={salva} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <Field label="Nome">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={aoTeclar} />
      </Field>
      <Field label="Telefone (opcional)">
        <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          onKeyDown={aoTeclar} placeholder="(54) 99999-0000" />
      </Field>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        O resto da ficha (e-mail, nascimento, observações) pode ser completado depois em Clientes.
      </p>
    </Modal>
  )
}
