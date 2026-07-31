import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import '../auth.css'

const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
const animationUrl = `${import.meta.env.BASE_URL}login-bag-animation.mp4`

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
    else if (mode === 'signup') setSuccess('SUCCESS! Account created. Confirm your email, then sign in.')
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
    else setSuccess('SUCCESS! A new confirmation email has been sent.')
    setBusy(false)
  }

  const switchMode = () => {
    setMode(current => current === 'signin' ? 'signup' : 'signin')
    setError(null)
    setSuccess(null)
  }

  const replay = () => {
    setIntroDone(false)
    setSuccess(null)
    setError(null)
    setReplayKey(value => value + 1)
  }

  return <main className={`bag-auth ${introDone ? 'bag-ready' : ''} ${success ? 'bag-successful' : ''}`}>
    <header className="bag-auth-header">
      <div className="bag-auth-logo"><span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div></div>
      <div className="bag-auth-actions">
        <button type="button" onClick={replay}>Replay</button>
        {!introDone && <button type="button" onClick={() => setIntroDone(true)}>Skip</button>}
      </div>
    </header>

    <section className="bag-stage">
      <video
        key={replayKey}
        className="bag-character-video"
        src={animationUrl}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => setIntroDone(true)}
        onError={() => setIntroDone(true)}
      />

      <form className="bag-login-form" onSubmit={submit}>
        <h1>{mode === 'signin' ? 'LOGIN NOW' : 'REGISTRATION NOW'}</h1>
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
