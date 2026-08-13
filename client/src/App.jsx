import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { Spinner } from './components.jsx'
import { initials } from './util.js'

import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Agenda from './pages/Agenda.jsx'
import Comanda from './pages/Comanda.jsx'
import Caixa from './pages/Caixa.jsx'
import Clientes from './pages/Clientes.jsx'
import Profissionais from './pages/Profissionais.jsx'
import Servicos from './pages/Servicos.jsx'
import Produtos from './pages/Produtos.jsx'
import Estoque from './pages/Estoque.jsx'
import Fidelidade from './pages/Fidelidade.jsx'
import Financeiro from './pages/Financeiro.jsx'
import Configuracoes from './pages/Configuracoes.jsx'

const NAV = [
  { group: 'Operação', items: [
    { to: '/', label: 'Painel', icon: '▣', end: true },
    { to: '/agenda', label: 'Agenda', icon: '🗓' },
    { to: '/comanda', label: 'Comanda / PDV', icon: '✂' },
    { to: '/caixa', label: 'Caixa', icon: '▤' },
  ] },
  { group: 'Cadastros', items: [
    { to: '/clientes', label: 'Clientes', icon: '☻' },
    { to: '/profissionais', label: 'Profissionais', icon: '♞' },
    { to: '/servicos', label: 'Serviços', icon: '≣' },
    { to: '/produtos', label: 'Produtos', icon: '▦' },
  ] },
  { group: 'Gestão', items: [
    { to: '/financeiro', label: 'Financeiro', icon: '$' },
    { to: '/estoque', label: 'Estoque', icon: '▥' },
    { to: '/fidelidade', label: 'Fidelidade', icon: '♥' },
    { to: '/configuracoes', label: 'Configurações', icon: '⚙' },
  ] },
]

function Sidebar({ open, onClose }) {
  const { user, signOut } = useAuth()
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand">
        <div className="brand__mark">B</div>
        <div className="brand__name">Barbearia<small>Gestão</small></div>
      </div>
      <nav onClick={onClose}>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-group">{g.group}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <span className="ic">{it.icon}</span>{it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar__foot">
        <div className="user-chip">
          <div className="avatar">{initials(user?.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-chip__name">{user?.name}</div>
            <div className="user-chip__role">{user?.role === 'admin' ? 'Administração' : 'Equipe'}</div>
          </div>
        </div>
        <button className="btn btn--ghost btn--sm btn--block" onClick={signOut}>Sair</button>
      </div>
    </aside>
  )
}

function Layout() {
  const [open, setOpen] = useState(false)
  useLocation()
  return (
    <div className="shell">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div>
        <div className="mobile-bar">
          <button className="btn btn--ghost btn--sm" onClick={() => setOpen((o) => !o)}>☰</button>
          <div className="brand__name" style={{ fontSize: 13 }}>Barbearia</div>
        </div>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/comanda" element={<Comanda />} />
            <Route path="/caixa" element={<Caixa />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/profissionais" element={<Profissionais />} />
            <Route path="/servicos" element={<Servicos />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/fidelidade" element={<Fidelidade />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><Spinner /></div>
  if (!user) return <Login />
  return <Layout />
}
