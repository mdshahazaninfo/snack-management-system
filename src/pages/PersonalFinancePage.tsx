import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { downloadCsv, money, today } from '../lib/utils'
import { Card, Empty, ErrorText, Stat, SuccessText } from '../components/Ui'

type Account = { id:string; name:string; account_type:string; balance:number; low_balance_threshold:number; active:boolean }
type Category = { id:string; kind:'income'|'expense'; name:string; parent_name:string|null }
type Transaction = { id:string; transaction_date:string; kind:string; amount:number; description:string|null; payment_method:string|null; priority:string|null; pf_accounts:{name:string}|null; pf_categories:{name:string}|null }
type Budget = { id:string; month_start:string; amount:number; pf_categories:{name:string}|null }
type Goal = { id:string; name:string; target_amount:number; current_amount:number; target_date:string|null; status:string }
type Recurring = { id:string; title:string; kind:string; amount:number; frequency:string; next_due_date:string; active:boolean }

const monthStart = () => `${today().slice(0,7)}-01`
const monthEnd = () => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10) }

export function PersonalFinancePage(){
  const [accounts,setAccounts]=useState<Account[]>([])
  const [categories,setCategories]=useState<Category[]>([])
  const [transactions,setTransactions]=useState<Transaction[]>([])
  const [budgets,setBudgets]=useState<Budget[]>([])
  const [goals,setGoals]=useState<Goal[]>([])
  const [recurring,setRecurring]=useState<Recurring[]>([])
  const [error,setError]=useState<string|null>(null)
  const [success,setSuccess]=useState<string|null>(null)

  const load=async()=>{
    setError(null)
    const [a,c,t,b,g,r]=await Promise.all([
      supabase.from('pf_account_balances').select('*').order('name'),
      supabase.from('pf_categories').select('*').eq('active',true).order('kind').order('name'),
      supabase.from('pf_transactions').select('id,transaction_date,kind,amount,description,payment_method,priority,pf_accounts(name),pf_categories(name)').order('transaction_date',{ascending:false}).order('created_at',{ascending:false}).limit(100),
      supabase.from('pf_budgets').select('id,month_start,amount,pf_categories(name)').eq('month_start',monthStart()).order('amount',{ascending:false}),
      supabase.from('pf_goals').select('*').order('created_at',{ascending:false}),
      supabase.from('pf_recurring').select('id,title,kind,amount,frequency,next_due_date,active').eq('active',true).order('next_due_date'),
    ])
    const firstError=[a.error,c.error,t.error,b.error,g.error,r.error].find(Boolean)
    if(firstError){setError(firstError.message);return}
    setAccounts((a.data as Account[])||[])
    setCategories((c.data as Category[])||[])
    setTransactions((t.data as unknown as Transaction[])||[])
    setBudgets((b.data as unknown as Budget[])||[])
    setGoals((g.data as Goal[])||[])
    setRecurring((r.data as Recurring[])||[])
  }

  useEffect(()=>{load()},[])

  const currentMonth=transactions.filter(x=>x.transaction_date>=monthStart()&&x.transaction_date<=monthEnd())
  const income=currentMonth.filter(x=>x.kind==='income').reduce((s,x)=>s+Number(x.amount),0)
  const expense=currentMonth.filter(x=>x.kind==='expense').reduce((s,x)=>s+Number(x.amount),0)
  const savings=income-expense
  const savingsRate=income>0?(savings/income)*100:0
  const totalBalance=accounts.reduce((s,a)=>s+Number(a.balance),0)
  const budgetTotal=budgets.reduce((s,b)=>s+Number(b.amount),0)
  const remainingBudget=budgetTotal-expense
  const upcoming=recurring.filter(x=>x.next_due_date>=today()&&x.next_due_date<=new Date(Date.now()+7*86400000).toISOString().slice(0,10)).length
  const expenseCategories=useMemo(()=>categories.filter(c=>c.kind==='expense'),[categories])

  const done=(message:string)=>{setSuccess(message);setError(null);load()}

  const addAccount=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const{error}=await supabase.from('pf_accounts').insert({name:f.get('name'),account_type:f.get('type'),opening_balance:Number(f.get('opening')||0),low_balance_threshold:Number(f.get('threshold')||0)});if(error)setError(error.message);else{e.currentTarget.reset();done('Account added.')}}

  const addTransaction=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const kind=String(f.get('kind'));const{error}=await supabase.from('pf_transactions').insert({transaction_date:f.get('date'),kind,account_id:f.get('account'),category_id:f.get('category')||null,amount:Number(f.get('amount')),description:f.get('description'),payment_method:f.get('method'),priority:kind==='expense'?f.get('priority'):null,tags:String(f.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean)});if(error)setError(error.message);else{e.currentTarget.reset();done('Transaction saved.')}}

  const transfer=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const{error}=await supabase.rpc('pf_transfer',{p_from_account:f.get('from'),p_to_account:f.get('to'),p_amount:Number(f.get('amount')),p_date:f.get('date'),p_note:f.get('note')});if(error)setError(error.message);else{e.currentTarget.reset();done('Transfer completed.')}}

  const addBudget=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const{error}=await supabase.from('pf_budgets').upsert({month_start:`${f.get('month')}-01`,category_id:f.get('category'),amount:Number(f.get('amount'))},{onConflict:'owner_id,month_start,category_id'});if(error)setError(error.message);else done('Budget saved.')}

  const addGoal=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const{error}=await supabase.from('pf_goals').insert({name:f.get('name'),target_amount:Number(f.get('target')),current_amount:Number(f.get('current')||0),target_date:f.get('date')||null});if(error)setError(error.message);else{e.currentTarget.reset();done('Savings goal added.')}}

  const addRecurring=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const{error}=await supabase.from('pf_recurring').insert({title:f.get('title'),kind:f.get('kind'),amount:Number(f.get('amount')),account_id:f.get('account')||null,category_id:f.get('category')||null,frequency:f.get('frequency'),next_due_date:f.get('date')});if(error)setError(error.message);else{e.currentTarget.reset();done('Recurring reminder added.')}}

  const exportRows=transactions.map(x=>({date:x.transaction_date,type:x.kind,account:x.pf_accounts?.name||'',category:x.pf_categories?.name||'',amount:x.amount,description:x.description||'',method:x.payment_method||'',priority:x.priority||''}))

  return <>
    <div className="page-title"><div><h1>Personal Finance</h1><p>Private income, expenses, accounts, budgets and savings goals</p></div><button className="secondary" onClick={()=>downloadCsv(`personal-finance-${today()}.csv`,exportRows)}>Export CSV</button></div>
    <ErrorText error={error}/><SuccessText text={success}/>

    <div className="stats finance-stats">
      <Stat label="Monthly income" value={money(income)}/><Stat label="Monthly expense" value={money(expense)}/><Stat label="Current savings" value={money(savings)}/><Stat label="Savings rate" value={`${savingsRate.toFixed(1)}%`}/><Stat label="Total balance" value={money(totalBalance)}/><Stat label="Remaining budget" value={money(remainingBudget)}/><Stat label="Upcoming bills" value={upcoming}/>
    </div>

    <div className="grid-2 finance-grid">
      <Card title="Add income / expense"><form className="form-grid" onSubmit={addTransaction}><label>Date<input name="date" type="date" defaultValue={today()} required/></label><label>Type<select name="kind" required><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Account<select name="account" required><option value="">Select</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} — {money(a.balance)}</option>)}</select></label><label>Category<select name="category"><option value="">Select</option>{categories.map(c=><option key={c.id} value={c.id}>{c.kind} — {c.parent_name?`${c.parent_name} / `:''}{c.name}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Method<input name="method" placeholder="Cash, card, bKash..."/></label><label>Priority<select name="priority"><option value="essential">Essential</option><option value="important">Important</option><option value="optional">Optional</option></select></label><label>Description<input name="description"/></label><label>Tags<input name="tags" placeholder="family, work"/></label><button>Save transaction</button></form></Card>

      <Card title="Accounts"><form className="form-grid" onSubmit={addAccount}><label>Name<input name="name" placeholder="Cash Wallet" required/></label><label>Type<select name="type"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_wallet">Mobile wallet</option><option value="credit">Credit</option><option value="investment">Investment</option><option value="other">Other</option></select></label><label>Opening balance<input name="opening" type="number" step="0.01" defaultValue="0"/></label><label>Low balance alert<input name="threshold" type="number" step="0.01" defaultValue="0"/></label><button>Add account</button></form>{accounts.length?<div className="account-list">{accounts.map(a=><div className="account-row" key={a.id}><div><b>{a.name}</b><small>{a.account_type}</small></div><strong className={Number(a.balance)<=Number(a.low_balance_threshold)&&Number(a.low_balance_threshold)>0?'negative':''}>{money(a.balance)}</strong></div>)}</div>:<Empty text="Add your first cash, bank or mobile-wallet account."/>}</Card>
    </div>

    <Card title="Transfer between accounts"><form className="form-grid" onSubmit={transfer}><label>Date<input name="date" type="date" defaultValue={today()} required/></label><label>From<select name="from" required><option value="">Select</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>To<select name="to" required><option value="">Select</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Note<input name="note"/></label><button>Transfer</button></form></Card>

    <div className="grid-2 finance-grid">
      <Card title="Monthly category budget"><form className="form-grid" onSubmit={addBudget}><label>Month<input name="month" type="month" defaultValue={today().slice(0,7)} required/></label><label>Category<select name="category" required><option value="">Select</option>{expenseCategories.map(c=><option key={c.id} value={c.id}>{c.parent_name?`${c.parent_name} / `:''}{c.name}</option>)}</select></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required/></label><button>Save budget</button></form>{budgets.length?<div className="table-wrap"><table><thead><tr><th>Category</th><th>Budget</th></tr></thead><tbody>{budgets.map(b=><tr key={b.id}><td>{b.pf_categories?.name}</td><td>{money(b.amount)}</td></tr>)}</tbody></table></div>:<Empty text="No budget set for this month."/>}</Card>

      <Card title="Savings goals"><form className="form-grid" onSubmit={addGoal}><label>Goal<input name="name" placeholder="Emergency fund" required/></label><label>Target<input name="target" type="number" min="0.01" step="0.01" required/></label><label>Saved now<input name="current" type="number" min="0" step="0.01" defaultValue="0"/></label><label>Target date<input name="date" type="date"/></label><button>Add goal</button></form>{goals.length?<div className="goal-list">{goals.map(g=>{const p=Math.min(100,(Number(g.current_amount)/Number(g.target_amount))*100);return <div className="goal-row" key={g.id}><div><b>{g.name}</b><small>{money(g.current_amount)} of {money(g.target_amount)}</small><div className="progress"><span style={{width:`${p}%`}}/></div></div><strong>{p.toFixed(0)}%</strong></div>})}</div>:<Empty text="No savings goal added."/>}</Card>
    </div>

    <Card title="Recurring bills and income"><form className="form-grid" onSubmit={addRecurring}><label>Title<input name="title" placeholder="House rent" required/></label><label>Type<select name="kind"><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Account<select name="account"><option value="">Select</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Category<select name="category"><option value="">Select</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Frequency<select name="frequency"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select></label><label>Next due<input name="date" type="date" required/></label><button>Add reminder</button></form>{recurring.length?<div className="table-wrap"><table><thead><tr><th>Due</th><th>Title</th><th>Type</th><th>Amount</th><th>Frequency</th></tr></thead><tbody>{recurring.map(r=><tr key={r.id}><td>{r.next_due_date}</td><td>{r.title}</td><td>{r.kind}</td><td>{money(r.amount)}</td><td>{r.frequency}</td></tr>)}</tbody></table></div>:<Empty text="No recurring bill or income reminder."/>}</Card>

    <Card title="Recent transactions">{transactions.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id}><td>{t.transaction_date}</td><td><span className={`pill ${t.kind==='expense'?'danger':''}`}>{t.kind}</span></td><td>{t.pf_accounts?.name}</td><td>{t.pf_categories?.name||'—'}</td><td>{t.description||'—'}</td><td className={t.kind==='expense'||t.kind==='transfer_out'?'negative':'positive'}>{t.kind==='expense'||t.kind==='transfer_out'?'-':'+'}{money(t.amount)}</td></tr>)}</tbody></table></div>:<Empty text="No personal transaction recorded yet."/>}</Card>
  </>
}
