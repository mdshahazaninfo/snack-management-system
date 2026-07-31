import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import '../auth.css'

const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString()

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [replayKey, setReplayKey] = useState(0)

  useEffect(() => {
    setIntroDone(false)
    const timer = window.setTimeout(() => setIntroDone(true), 5200)
    return () => window.clearTimeout(timer)
  }, [replayKey])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: appUrl,
          },
        })

    if (result.error) setError(result.error.message)
    else if (mode === 'signup') setSuccess('Account created. Confirm your email, then sign in.')
    setBusy(false)
  }

  const resendConfirmation = async () => {
    if (!email) return setError('Enter your email address first.')
    setBusy(true)
    setError(null)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: appUrl },
    })
    if (resendError) setError(resendError.message)
    else setSuccess('A new confirmation email has been sent.')
    setBusy(false)
  }

  const switchMode = () => {
    setMode(current => current === 'signin' ? 'signup' : 'signin')
    setError(null)
    setSuccess(null)
  }

  const replay = () => {
    setSuccess(null)
    setError(null)
    setReplayKey(value => value + 1)
  }

  return <main className={`bag-auth ${introDone ? 'bag-ready' : ''} ${success ? 'bag-successful' : ''}`} key={replayKey}>
    <header className="bag-auth-header">
      <div className="bag-auth-logo"><span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div></div>
      <div className="bag-auth-actions">
        <button type="button" onClick={replay}>Replay</button>
        {!introDone && <button type="button" onClick={() => setIntroDone(true)}>Skip</button>}
      </div>
    </header>

    <section className="bag-stage">
      <div className="bag-character" aria-hidden="true">
        <i className="bag-hair"/>
        <i className="bag-head"/>
        <i className="bag-body"/>
        <i className="bag-arm bag-arm-left"/>
        <i className="bag-arm bag-arm-right"/>
        <i className="bag-leg bag-leg-left"/>
        <i className="bag-leg bag-leg-right"/>
      </div>
      <div className="bag-case" aria-hidden="true"><i/></div>

      <form className="bag-login-form" onSubmit={submit}>
        <h1>{mode === 'signin' ? 'LOGIN NOW' : 'REGISTER NOW'}</h1>
        <p>{mode === 'signin' ? 'Welcome back to SnackFlow' : 'Create your secure SnackFlow account'}</p>
        {mode === 'signup' && <input value={name} onChange={event => setName(event.target.value)} placeholder="Full name" autoComplete="name" required />}
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" required />
        <input type="password" minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
        <label className="bag-remember"><input type="checkbox" defaultChecked/><span>Remember me</span></label>
        {error && <div className="bag-form-message error">{error}</div>}
        <button className="bag-submit" disabled={busy}>{busy ? 'PLEASE WAIT…' : mode === 'signin' ? 'LOGIN' : 'SIGN UP'}</button>
        {mode === 'signup' && <button type="button" className="bag-form-link" onClick={resendConfirmation} disabled={busy}>Resend confirmation email</button>}
        <button type="button" className="bag-form-link" onClick={switchMode}>{mode === 'signin' ? 'Create account' : 'Already have an account?'}</button>
      </form>

      <div className="bag-success-card" role="status">
        <strong>SUCCESS!</strong>
        <span>{success || 'Your request has been completed.'}</span>
        <button type="button" onClick={() => { setSuccess(null); setMode('signin') }}>BACK TO LOGIN</button>
      </div>
    </section>

    <p className="bag-auth-caption">Secure access to SnackFlow orders, wallets, reports and personal finance.</p>
  </main>
}
