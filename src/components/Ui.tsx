import type { ReactNode } from 'react'

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="card">{(title || actions) && <header className="card-head"><h2>{title}</h2>{actions}</header>}{children}</section>
}
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
}
export function Empty({ text = 'No records found.' }: { text?: string }) { return <div className="empty">{text}</div> }
export function ErrorText({ error }: { error: string | null }) { return error ? <div className="alert error">{error}</div> : null }
export function SuccessText({ text }: { text: string | null }) { return text ? <div className="alert success">{text}</div> : null }
