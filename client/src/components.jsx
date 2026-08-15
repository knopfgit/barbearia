import { useEffect } from 'react'
import { STATUS_LABELS } from './util.js'

export function Spinner() { return <div className="spinner" role="status" aria-label="Carregando" /> }

/**
 * Marca da barbearia: tesoura desenhada em SVG (sem arquivo externo) + nome.
 * `size` em px; a cor vem do CSS (`currentColor`), então o acento sai da paleta.
 *
 * PARA USAR UM LOGO REAL: coloque o arquivo em `client/public/` (ex.: logo.svg)
 * e troque o <svg> abaixo por:
 *   <img src="/logo.svg" alt="Barbearia Mattos" width={size} height={size} />
 */
export function Logo({ size = 34 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      role="img" aria-label="Barbearia Mattos">
      <circle cx="6" cy="19" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <line x1="16.6" y1="17.1" x2="7" y2="3.5" />
      <line x1="7.4" y1="17.1" x2="17" y2="3.5" />
    </svg>
  )
}

export function Empty({ mark = '✂', title, hint }) {
  return (
    <div className="empty">
      <div className="empty__mark">{mark}</div>
      <p>{title}</p>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export function StatusBadge({ status }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status] || status}</span>
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
