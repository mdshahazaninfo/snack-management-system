import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/utils'
import { Card, Stat } from '../components/Ui'

type Summary = { sales: number; orders: number; deposits: number; expenses: number; liability: number; low: number }
export function DashboardPage() {
  const [s, setS] = useState<Summary>({ sales: 0, orders: 0, deposits: 0, expenses: 0, liability: 0, low: 0 })
  useEffect(() => { (async () => {
    const day = today()
    const [{ data: orders }, { data: tx }, { data: expenses }, { data: members }] = await Promise.all([
      supabase.from('orders').select('total,status').gte('created_at', `${day}T00:00:00`).lt('created_at', `${day}T23:59:59`),
      supabase.from('wallet_transactions').select('amount,type').gte('created_at', `${day}T00:00:00`).lt('created_at', `${day}T23:59:59`),
      supabase.from('expenses').select('amount,status').eq('expense_date', day),
      supabase.from('member_balances').select('balance,low_balance_threshold'),
    ])
    const activeOrders = (orders || []).filter((o: any) => o.status === 'posted')
    const balances = members || []
    setS({
      sales: activeOrders.reduce((a: number, o: any) => a + Number(o.total), 0), orders: activeOrders.length,
      deposits: (tx || []).filter((t: any) => t.type === 'deposit').reduce((a: number, t: any) => a + Number(t.amount), 0),
      expenses: (expenses || []).filter((e: any) => e.status !== 'void').reduce((a: number, e: any) => a + Number(e.amount), 0),
      liability: balances.reduce((a: number, m: any) => a + Math.max(0, Number(m.balance)), 0),
      low: balances.filter((m: any) => Number(m.balance) <= Number(m.low_balance_threshold)).length,
    })
  })() }, [])
  return <><div className="page-title"><div><h1>Dashboard</h1><p>Today’s operating snapshot</p></div><span className="pill">{today()}</span></div>
    <div className="stats"><Stat label="Sales" value={money(s.sales)}/><Stat label="Orders" value={s.orders}/><Stat label="Deposits" value={money(s.deposits)}/><Stat label="Expenses" value={money(s.expenses)}/><Stat label="Wallet liability" value={money(s.liability)}/><Stat label="Low balance" value={s.low}/></div>
    <div className="grid-2"><Card title="Accounting note"><p>Deposits increase cash and member wallet liability. Revenue is recognized only when an order is posted.</p></Card><Card title="Estimated operating margin"><strong className="big-number">{money(s.sales - s.expenses)}</strong><p className="muted">Sales less operating expenses; item-level cost estimates are available in Reports.</p></Card></div>
  </>
}
