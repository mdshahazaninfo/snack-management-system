import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

type Order={total:number;estimated_cost:number;status:string;created_at:string}
type Balance={full_name:string;balance:number;low_balance_threshold:number}
type PfTx={transaction_date:string;kind:string;amount:number;description:string|null}
type Account={name:string;balance:number}
type Recurring={title:string;amount:number;next_due_date:string}

export function DashboardPage(){
 const {profile}=useAuth();const[name,setName]=useState(profile?.full_name||'there')
 const[orders,setOrders]=useState<Order[]>([]),[balances,setBalances]=useState<Balance[]>([]),[pfTx,setPfTx]=useState<PfTx[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[recurring,setRecurring]=useState<Recurring[]>([]),[period,setPeriod]=useState<'today'|'month'>('month')
 useEffect(()=>{setName(profile?.full_name||'there')},[profile])
 useEffect(()=>{(async()=>{const month=`${today().slice(0,7)}-01`;const orderFrom=period==='today'?`${today()}T00:00:00`:`${month}T00:00:00`;const[o,b,t,a,r]=await Promise.all([
  supabase.from('orders').select('total,estimated_cost,status,created_at').gte('created_at',orderFrom),
  supabase.from('member_balances').select('full_name,balance,low_balance_threshold').order('balance').limit(8),
  supabase.from('pf_transactions').select('transaction_date,kind,amount,description').gte('transaction_date',month).order('transaction_date',{ascending:false}).limit(20),
  supabase.from('pf_account_balances').select('name,balance').order('balance',{ascending:false}),
  supabase.from('pf_recurring').select('title,amount,next_due_date').eq('active',true).gte('next_due_date',today()).order('next_due_date').limit(5),
 ]);setOrders((o.data as Order[])||[]);setBalances((b.data as Balance[])||[]);setPfTx((t.data as PfTx[])||[]);setAccounts((a.data as Account[])||[]);setRecurring((r.data as Recurring[])||[])})()},[period])
 const posted=orders.filter(o=>o.status==='posted'),sales=posted.reduce((s,o)=>s+Number(o.total),0),cost=posted.reduce((s,o)=>s+Number(o.estimated_cost||0),0),margin=sales-cost,low=balances.filter(x=>Number(x.balance)<150)
 const income=pfTx.filter(x=>x.kind==='income').reduce((s,x)=>s+Number(x.amount),0),expense=pfTx.filter(x=>x.kind==='expense').reduce((s,x)=>s+Number(x.amount),0),net=income-expense,totalBalance=accounts.reduce((s,x)=>s+Number(x.balance),0),savingsRate=income>0?Math.max(0,net/income*100):0
 const activity=useMemo(()=>[
  ...posted.slice(0,4).map((o,i)=>({label:`Snack order ${i+1}`,value:money(o.total),date:o.created_at,type:'order'})),
  ...pfTx.slice(0,4).map(x=>({label:x.description||x.kind,value:`${x.kind==='expense'?'-':'+'}${money(x.amount)}`,date:x.transaction_date,type:x.kind})),
 ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6),[posted,pfTx])
 const hour=new Date().getHours(),greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'
 return <div className="premium-page main-dashboard"><header className="premium-heading hero-heading"><div><span className="eyebrow">SNACKFLOW MICRO ERP</span><h1>{greeting}, {name}</h1><p>Your snack operations and personal finance at a glance.</p></div><div className="heading-actions"><div className="period-switch"><button className={period==='today'?'active':''} onClick={()=>setPeriod('today')}>Today</button><button className={period==='month'?'active':''} onClick={()=>setPeriod('month')}>This month</button></div><Link className="premium-button" to="/orders">＋ Quick order</Link></div></header>
 <div className="dashboard-progress"><div><span>Snack performance</span><div className="bar-track"><i style={{width:`${Math.min(100,sales?margin/sales*100:0)}%`}}/></div><b>{sales?`${(margin/sales*100).toFixed(0)}% margin`:'No sales yet'}</b></div><div><span>Personal savings</span><div className="bar-track yellow"><i style={{width:`${Math.min(100,savingsRate)}%`}}/></div><b>{savingsRate.toFixed(0)}% saved</b></div></div>
 <div className="hero-metrics"><div><small>Orders</small><strong>{posted.length}</strong><span>{period}</span></div><div><small>Snack sales</small><strong>{money(sales)}</strong><span>{money(margin)} margin</span></div><div><small>Personal balance</small><strong>{money(totalBalance)}</strong><span>{accounts.length} accounts</span></div></div>
 <div className="bento-grid main-bento">
  <section className="bento-card bento-wide performance-card"><div className="card-title"><div><small>MONTHLY PERFORMANCE</small><h2>Income, expense and savings</h2></div><Link to="/personal-finance">Finance ↗</Link></div><div className="performance-numbers"><div><span>Income</span><strong>{money(income)}</strong></div><div><span>Expense</span><strong>{money(expense)}</strong></div><div><span>Net</span><strong>{money(net)}</strong></div></div><div className="mini-columns">{[42,58,36,72,64,Math.max(8,Math.min(100,savingsRate))].map((v,i)=><span key={i} style={{height:`${v}%`}} className={i===5?'highlight':''}/>)}</div></section>
  <section className="bento-card circular-card"><div className="card-title"><div><small>SNACK OPERATIONS</small><h2>Margin pulse</h2></div><Link to="/snack">↗</Link></div><div className="ring" style={{'--value':`${Math.max(0,Math.min(100,sales?margin/sales*100:0))}%`} as CSSProperties}><div><strong>{sales?`${(margin/sales*100).toFixed(0)}%`:'0%'}</strong><span>{money(sales)}</span></div></div><p>{posted.length} posted orders in selected period.</p></section>
  <section className="bento-card dark-card"><div className="card-title"><div><small>IMPORTANT ALERTS</small><h2>Needs attention</h2></div><strong>{low.length+recurring.length}</strong></div><div className="alert-list">{low.slice(0,3).map(x=><Link to="/wallet" key={x.full_name}><span><b>{x.full_name}</b><small>Low member wallet</small></span><b>{money(x.balance)}</b></Link>)}{recurring.slice(0,3).map(x=><Link to="/personal-finance" key={`${x.title}-${x.next_due_date}`}><span><b>{x.title}</b><small>Due {x.next_due_date}</small></span><b>{money(x.amount)}</b></Link>)}{!low.length&&!recurring.length&&<p>No critical alerts right now.</p>}</div></section>
  <section className="bento-card"><div className="card-title"><div><small>ACCOUNT BALANCES</small><h2>Your money</h2></div><Link to="/personal-finance/manage">Manage ↗</Link></div><div className="account-mini-list">{accounts.slice(0,5).map(a=><div key={a.name}><span><b>{a.name}</b><small>Personal account</small></span><strong>{money(a.balance)}</strong></div>)}{!accounts.length&&<div className="premium-empty">Add your first personal account.</div>}</div></section>
  <section className="bento-card bento-wide"><div className="card-title"><div><small>RECENT ACTIVITY</small><h2>Latest movements</h2></div></div><div className="activity-list">{activity.map((x,i)=><div key={`${x.label}-${i}`}><span className={`activity-dot ${x.type}`}/><div><b>{x.label}</b><small>{String(x.date).slice(0,10)}</small></div><strong>{x.value}</strong></div>)}{!activity.length&&<div className="premium-empty">Your recent activity will appear here.</div>}</div></section>
  <section className="bento-card quick-card"><div className="card-title"><div><small>QUICK ACTIONS</small><h2>Do more, faster</h2></div></div><div className="quick-grid"><Link to="/orders">＋ New order</Link><Link to="/wallet">＋ Deposit</Link><Link to="/personal-finance/manage">＋ Expense</Link><Link to="/personal-finance/manage">↔ Transfer</Link></div></section>
 </div></div>
}
