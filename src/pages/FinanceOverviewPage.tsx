import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/utils'
import { ErrorText } from '../components/Ui'

type Tx={transaction_date:string;kind:string;amount:number;description:string|null;pf_categories:{name:string}|null;pf_accounts:{name:string}|null}
type Account={name:string;balance:number;account_type:string}
type Budget={amount:number}
type Recurring={title:string;amount:number;next_due_date:string;kind:string}
type Goal={name:string;target_amount:number;current_amount:number}
const monthStart=()=>`${today().slice(0,7)}-01`

export function FinanceOverviewPage(){
 const [tx,setTx]=useState<Tx[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[budgets,setBudgets]=useState<Budget[]>([]),[recurring,setRecurring]=useState<Recurring[]>([]),[goals,setGoals]=useState<Goal[]>([]),[error,setError]=useState<string|null>(null)
 useEffect(()=>{void(async()=>{setError(null);const[a,t,b,r,g]=await Promise.all([
  supabase.from('pf_account_balances').select('name,balance,account_type').order('balance',{ascending:false}),
  supabase.from('pf_transactions').select('transaction_date,kind,amount,description,pf_categories(name),pf_accounts(name)').gte('transaction_date',monthStart()).order('transaction_date',{ascending:false}),
  supabase.from('pf_budgets').select('amount').eq('month_start',monthStart()),
  supabase.from('pf_recurring').select('title,amount,next_due_date,kind').eq('active',true).gte('next_due_date',today()).order('next_due_date').limit(5),
  supabase.from('pf_goals').select('name,target_amount,current_amount').eq('status','active').limit(4),
 ]);const first=[a.error,t.error,b.error,r.error,g.error].find(Boolean);if(first){setError(first.message);return}setAccounts((a.data as Account[])||[]);setTx((t.data as unknown as Tx[])||[]);setBudgets((b.data as Budget[])||[]);setRecurring((r.data as Recurring[])||[]);setGoals((g.data as Goal[])||[])})()},[])
 const income=tx.filter(x=>x.kind==='income').reduce((s,x)=>s+Number(x.amount),0),expense=tx.filter(x=>x.kind==='expense').reduce((s,x)=>s+Number(x.amount),0),net=income-expense,total=accounts.reduce((s,x)=>s+Number(x.balance),0),budget=budgets.reduce((s,x)=>s+Number(x.amount),0),rate=income>0?Math.max(0,net/income*100):0
 const category=useMemo(()=>Object.entries(tx.filter(x=>x.kind==='expense').reduce<Record<string,number>>((a,x)=>{const k=x.pf_categories?.name||'Other';a[k]=(a[k]||0)+Number(x.amount);return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,5),[tx]);const max=Math.max(1,...category.map(([,v])=>v))
 return <div className="premium-page"><ErrorText error={error}/><header className="premium-heading"><div><span className="eyebrow">PERSONAL FINANCE</span><h1>Finance overview</h1><p>Your private cash flow, accounts, budgets and goals.</p></div><div className="heading-actions"><Link className="premium-button" to="/personal-finance/manage">＋ Add transaction</Link><Link className="premium-button secondary-action" to="/personal-finance/manage">Manage finance</Link></div></header>
 <div className="premium-kpis"><div className="premium-kpi"><small>Monthly income</small><strong>{money(income)}</strong><span>Current month</span></div><div className="premium-kpi accent-yellow"><small>Monthly expense</small><strong>{money(expense)}</strong><span>{budget?`${Math.min(999,expense/budget*100).toFixed(0)}% of budget`:'Set a monthly budget'}</span></div><div className="premium-kpi"><small>Net cash flow</small><strong>{money(net)}</strong><span>{rate.toFixed(1)}% savings rate</span></div><div className="premium-kpi accent-dark"><small>Total balance</small><strong>{money(total)}</strong><span>{accounts.length} active accounts</span></div></div>
 <div className="bento-grid finance-bento"><section className="bento-card bento-wide"><div className="card-title"><div><small>SPENDING MIX</small><h2>Expense by category</h2></div><Link to="/personal-finance/manage">Transactions ↗</Link></div>{category.length?<div className="bar-list">{category.map(([name,value])=><div className="bar-row" key={name}><div><b>{name}</b><span>{money(value)}</span></div><div className="bar-track"><i style={{width:`${value/max*100}%`}}/></div></div>)}</div>:<div className="premium-empty">Add expenses to see your spending pattern.</div>}</section>
 <section className="bento-card circular-card"><div className="card-title"><div><small>SAVINGS</small><h2>Monthly savings rate</h2></div></div><div className="ring" style={{'--value':`${Math.min(100,rate)}%`} as CSSProperties}><div><strong>{rate.toFixed(0)}%</strong><span>saved</span></div></div><p>{money(net)} net cash flow this month.</p></section>
 <section className="bento-card dark-card"><div className="card-title"><div><small>UPCOMING</small><h2>Bills & recurring</h2></div><strong>{recurring.length}</strong></div><div className="alert-list">{recurring.length?recurring.map(x=><Link to="/personal-finance/manage" key={`${x.title}-${x.next_due_date}`}><span><b>{x.title}</b><small>{x.next_due_date}</small></span><b>{money(x.amount)}</b></Link>):<p>No upcoming recurring items.</p>}</div></section>
 <section className="bento-card"><div className="card-title"><div><small>ACCOUNTS</small><h2>Balance summary</h2></div></div><div className="account-mini-list">{accounts.slice(0,5).map(a=><div key={a.name}><span><b>{a.name}</b><small>{a.account_type}</small></span><strong>{money(a.balance)}</strong></div>)}{!accounts.length&&<div className="premium-empty">Add your first personal account.</div>}</div></section>
 <section className="bento-card"><div className="card-title"><div><small>GOALS</small><h2>Savings progress</h2></div></div>{goals.length?<div className="goal-mini-list">{goals.map(g=>{const p=Math.min(100,Number(g.current_amount)/Number(g.target_amount)*100);return <div key={g.name}><div><b>{g.name}</b><span>{p.toFixed(0)}%</span></div><div className="bar-track"><i style={{width:`${p}%`}}/></div></div>})}</div>:<div className="premium-empty">Add a savings goal.</div>}</section></div></div>
}
