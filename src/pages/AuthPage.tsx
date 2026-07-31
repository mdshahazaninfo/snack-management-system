import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorText, SuccessText } from '../components/Ui'
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
  const [showPassword, setShowPassword] = useState(false)

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
    else if (mode === 'signup') setSuccess('Account created. Open the newest confirmation email, confirm your address, then sign in.')
    setBusy(false)
  }

  const resendConfirmation = async () => {
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: appUrl },
    })
    if (resendError) setError(resendError.message)
    else setSuccess('A new confirmation email has been sent. Use only the newest link.')
    setBusy(false)
  }

  const switchMode = () => {
    setMode(current => current === 'signin' ? 'signup' : 'signin')
    setError(null)
    setSuccess(null)
  }

  return <main className={`sf-auth ${mode} ${success ? 'completed' : ''}`}>
    <section className="sf-auth-story" aria-label="SnackFlow secure access">
      <div className="sf-auth-brand">
        <span>SF</span>
        <div><b>SnackFlow</b><small>Micro ERP</small></div>
      </div>

      <div className="sf-auth-copy">
        <span className="sf-auth-eyebrow">SMART · SECURE · SIMPLE</span>
        <h1>Your operations,<br/>ready to move.</h1>
        <p>Orders, advance wallets, digital bills and personal finance in one secure workspace.</p>
      </div>

      <div className="sf-auth-scene" aria-hidden="true">
        <div className="sf-scene-orbit sf-orbit-one"/>
        <div className="sf-scene-orbit sf-orbit-two"/>
        <div className="sf-auth-person">
          <i className="sf-person-head"/>
          <i className="sf-person-body"/>
          <i className="sf-person-arm left"/>
          <i className="sf-person-arm right"/>
          <i className="sf-person-leg left"/>
          <i className="sf-person-leg right"/>
        </div>
        <div className="sf-auth-case">
          <i className="sf-case-handle"/>
          <span>SF</span>
          <i className="sf-case-light"/>
        </div>
        <div className="sf-scene-line"/>
      </div>

      <div className="sf-auth-trust">
        <span><b>01</b> Role-based access</span>
        <span><b>02</b> Private finance data</span>
        <span><b>03</b> Auditable records</span>
      </div>
    </section>

    <section className="sf-auth-panel">
      <form className="sf-auth-card" onSubmit={submit}>
        <div className="sf-case-top" aria-hidden="true"><span/><i/><span/></div>
        <div className="sf-auth-mobile-brand">
          <span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div>
        </div>

        <div className="sf-auth-heading">
          <span className="sf-status-dot"/>
          <small>{mode === 'signin' ? 'SECURE SIGN IN' : 'ACCOUNT REGISTRATION'}</small>
          <h2>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p>{mode === 'signin'
            ? 'Enter your credentials to open your workspace.'
            : 'The first account becomes Admin. Later accounts require Admin approval.'}</p>
        </div>

        <ErrorText error={error}/>
        <SuccessText text={success}/>

        {mode === 'signup' && <label className="sf-field">
          <span>Full name</span>
          <input value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Mohammad Shahazan" required />
        </label>}

        <label className="sf-field">
          <span>Email address</span>
          <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" required />
        </label>

        <label className="sf-field">
          <span>Password</span>
          <div className="sf-password-field">
            <input type={showPassword ? 'text' : 'password'} minLength={6} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="Minimum 6 characters" required />
            <button type="button" className="sf-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
        </label>

        <button className="sf-auth-submit" disabled={busy}>
          <span>{busy ? 'Please wait…' : mode === 'signin' ? 'Open workspace' : 'Create account'}</span>
          <b aria-hidden="true">→</b>
        </button>

        {mode === 'signup' && <button type="button" className="sf-auth-text-button" disabled={busy} onClick={resendConfirmation}>Resend confirmation email</button>}

        <div className="sf-auth-switch">
          <span>{mode === 'signin' ? 'New to SnackFlow?' : 'Already registered?'}</span>
          <button type="button" onClick={switchMode}>{mode === 'signin' ? 'Create account' : 'Sign in'}</button>
        </div>

        <div className="sf-auth-security"><i/> Protected by Supabase authentication and database-level permissions.</div>
      </form>
    </section>
  </main>
}
