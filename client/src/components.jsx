import { useEffect } from 'react'
import { STATUS_LABELS } from './util.js'

export function Spinner() { return <div className="spinner" role="status" aria-label="Carregando" /> }

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
