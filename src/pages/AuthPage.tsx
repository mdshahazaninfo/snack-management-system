import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorText, SuccessText } from '../components/Ui'

const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString()

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
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
    else if (mode === 'signup') setSuccess('Account created. Open the newest confirmation email and confirm your address, then sign in.')
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

  return <div className="auth-wrap"><form className="auth-card" onSubmit={submit}>
    <div className="brand large"><span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div></div>
    <h1>{mode === 'signin' ? 'Welcome back' : 'Create account'}</h1>
    <p>{mode === 'signin' ? 'Sign in to manage wallets and orders.' : 'The first account becomes Admin. Later accounts require approval.'}</p>
    <ErrorText error={error}/><SuccessText text={success}/>
    {mode === 'signup' && <label>Full name<input value={name} onChange={e => setName(e.target.value)} required /></label>}
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
    <button disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
    {mode === 'signup' && <button type="button" className="link" disabled={busy} onClick={resendConfirmation}>Resend confirmation email</button>}
    <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Need an account?' : 'Already have an account?'}</button>
  </form></div>
}
