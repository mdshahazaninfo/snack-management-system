import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/utils'

type Order = { total:number; estimated_cost:number; status:string; created_at:string }
type Balance = { full_name:string; balance:number; low_balance_threshold:number }
type ItemRow = { item_name:string; quantity:number }

export function SnackOverviewPage(){
  const [orders,setOrders]=useState<Order[]>([])
  const [balances,setBalances]=useState<Balance[]>([])
  const [items,setItems]=useState<ItemRow[]>([])
  const [period,setPeriod]=useState<'today'|'week'|'month'>('today')

  useEffect(()=>{(async()=>{
    const start=new Date()
    if(period==='week') start.setDate(start.getDate()-6)
    if(period==='month') start.setDate(1)
    const from=period==='today'?`${today()}T00:00:00`:start.toISOString()
    const [{data:o},{data:b},{data:i}]=await Promise.all([
      supabase.from('orders').select('total,estimated_cost,status,created_at').gte('created_at',from),
      supabase.from('member_balances').select('full_name,balance,low_balance_threshold').order('balance').limit(8),
      supabase.from('order_items').select('item_name,quantity,orders!inner(created_at,status)').gte('orders.created_at',from).eq('orders.status','posted'),
    ])
    setOrders((o as Order[])||[]);setBalances((b as Balance[])||[]);setItems((i as unknown as ItemRow[])||[])
  })()},[period])

  const posted=orders.filter(o=>o.status==='posted')
  const sales=posted.reduce((s,o)=>s+Number(o.total),0)
  const cost=posted.reduce((s,o)=>s+Number(o.estimated_cost||0),0)
  const margin=sales-cost
  const low=balances.filter(b=>Number(b.balance)<150)
  const top=useMemo(()=>Object.entries(items.reduce<Record<string,number>>((a,x)=>{a[x.item_name]=(a[x.item_name]||0)+Number(x.quantity);return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,5),[items])
  const max=Math.max(1,...top.map(([,q])=>q))

  return <div className="premium-page">
    <header className="premium-heading"><div><span className="eyebrow">SNACK OPERATIONS</span><h1>Operational overview</h1><p>Orders, revenue, margin and member wallet health.</p></div><div className="period-switch">{(['today','week','month'] as const).map(x=><button key={x} className={period===x?'active':''} onClick={()=>setPeriod(x)}>{x}</button>)}</div></header>

    <div className="premium-kpis">
      <Link to="/orders" className="premium-kpi"><small>Posted orders</small><strong>{posted.length}</strong><span>Open daily orders →</span></Link>
      <div className="premium-kpi accent-yellow"><small>Sales</small><strong>{money(sales)}</strong><span>{period} performance</span></div>
      <div className="premium-kpi"><small>Estimated cost</small><strong>{money(cost)}</strong><span>Based on menu costs</span></div>
      <div className="premium-kpi accent-dark"><small>Estimated margin</small><strong>{money(margin)}</strong><span>{sales?`${((margin/sales)*100).toFixed(1)}% margin`:'No posted sales'}</span></div>
    </div>

    <div className="bento-grid snack-bento">
      <section className="bento-card bento-wide"><div className="card-title"><div><small>POPULAR ITEMS</small><h2>Top-selling food</h2></div><Link to="/menu">View menu ↗</Link></div>{top.length?<div className="bar-list">{top.map(([name,q])=><div className="bar-row" key={name}><div><b>{name}</b><span>{q} units</span></div><div className="bar-track"><i style={{width:`${(q/max)*100}%`}}/></div></div>)}</div>:<div className="premium-empty">Orders will build this ranking.</div>}</section>

      <section className="bento-card circular-card"><div className="card-title"><div><small>PERFORMANCE</small><h2>Margin pulse</h2></div></div><div className="ring" style={{'--value':`${Math.max(0,Math.min(100,sales?margin/sales*100:0))}%`} as React.CSSProperties}><div><strong>{sales?`${(margin/sales*100).toFixed(0)}%`:'0%'}</strong><span>margin</span></div></div><p>{money(margin)} retained after estimated item cost.</p></section>

      <section className="bento-card dark-card"><div className="card-title"><div><small>ATTENTION</small><h2>Low wallet alerts</h2></div><strong>{low.length}</strong></div><div className="alert-list">{low.length?low.slice(0,5).map(x=><Link to="/wallet" key={x.full_name}><span>{x.full_name}</span><b>{money(x.balance)}</b></Link>):<p>All member wallets are above BDT 150.</p>}</div></section>

      <section className="bento-card bento-wide"><div className="card-title"><div><small>QUICK ACTIONS</small><h2>Run snack operations</h2></div></div><div className="quick-grid"><Link to="/orders">＋ New order</Link><Link to="/wallet">＋ Wallet deposit</Link><Link to="/members">Manage members</Link><Link to="/reports">Open reports</Link></div></section>
    </div>
  </div>
}
