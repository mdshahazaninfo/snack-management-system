import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

const LOW_BALANCE_LIMIT = 150

type Balance = { id: string; employee_id: string; full_name: string; balance: number; low_balance_threshold: number }

export function WalletPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [members, setMembers] = useState<Balance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase.from('member_balances').select('*').order('full_name')
    if (error) setError(error.message)
    else setMembers(data || [])
  }

  useEffect(() => { load() }, [])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const f = new FormData(e.currentTarget)
    const mode = isAdmin && f.get('mode') === 'adjust' ? 'adjust_wallet' : 'deposit_wallet'
    const { error } = await supabase.rpc(mode, {
      p_member_id: f.get('member_id'),
      p_amount: Number(f.get('amount')),
      p_note: f.get('note'),
    })
    if (error) setError(error.message)
    else {
      setSuccess('Wallet transaction posted.')
      e.currentTarget.reset()
      load()
    }
  }

  return <>
    <div className="page-title"><div><h1>Advance Wallet</h1><p>Deposit funds and monitor balances below BDT 150</p></div></div>
    <ErrorText error={error}/><SuccessText text={success}/>
    <Card title="Post transaction">
      <form className="form-grid wallet-form" onSubmit={submit}>
        <label>Member<select name="member_id" required><option value="">Select</option>{members.map(m => <option key={m.id} value={m.id}>{m.employee_id} — {m.full_name}</option>)}</select></label>
        {isAdmin && <label>Type<select name="mode"><option value="deposit">Deposit</option><option value="adjust">Signed adjustment</option></select></label>}
        <label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label>
        <label>Note<input name="note" required/></label>
        <button>Post</button>
      </form>
    </Card>
    <Card title="Balances">{members.length ? <div className="table-wrap"><table><thead><tr><th>ID</th><th>Member</th><th>Balance</th><th>Low Limit</th><th>Status</th></tr></thead><tbody>{members.map(m => { const low = Number(m.balance) < LOW_BALANCE_LIMIT; return <tr key={m.id}><td>{m.employee_id}</td><td>{m.full_name}</td><td>{money(m.balance)}</td><td>{money(LOW_BALANCE_LIMIT)}</td><td><span className={`pill ${low ? 'danger' : ''}`}>{low ? 'Low' : 'OK'}</span></td></tr> })}</tbody></table></div> : <Empty/>}</Card>
  </>
}
