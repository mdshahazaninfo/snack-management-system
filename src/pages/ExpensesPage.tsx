import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { downloadCsv, money, today } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Card, Empty, ErrorText } from '../components/Ui'

type Expense = { id: string; expense_date: string; category: string; description: string; amount: number; status: string }

export function ExpensesPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Expense[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    if (error) setError(error.message)
    else setRows(data || [])
  }

  useEffect(() => { load() }, [])

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isAdmin) return
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.from('expenses').insert({
      expense_date: f.get('date'),
      category: f.get('category'),
      description: f.get('description'),
      amount: Number(f.get('amount')),
    })
    if (error) setError(error.message)
    else { e.currentTarget.reset(); load() }
  }

  return <>
    <div className="page-title"><div><h1>Expenses</h1><p>View and download the operating expense ledger</p></div><button className="secondary" onClick={() => downloadCsv(`snackflow-expenses-${today()}.csv`, rows)}>Export CSV</button></div>
    <ErrorText error={error}/>
    {isAdmin && <Card title="Add expense"><form className="form-grid" onSubmit={add}><label>Date<input name="date" type="date" defaultValue={today()} required/></label><label>Category<input name="category" required/></label><label>Description<input name="description" required/></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required/></label><button>Add expense</button></form></Card>}
    <Card title="Expense history">{rows.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.expense_date}</td><td>{r.category}</td><td>{r.description}</td><td>{money(r.amount)}</td><td>{r.status}</td></tr>)}</tbody></table></div> : <Empty/>}</Card>
  </>
}
