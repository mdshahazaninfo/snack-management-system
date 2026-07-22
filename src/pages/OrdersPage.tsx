import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { money, notify } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

type Member = { id:string; employee_id:string; full_name:string; balance:number; email:string|null; email_receipt_enabled:boolean }
type Item = { id:string; name:string; sku:string; selling_price:number }
type Cart = Item & { qty:number }
type Order = { id:string; invoice_no:string; total:number; status:string; created_at:string; email_status?:string; email_error?:string|null; receipt_email?:string|null; members:{full_name:string}|null }
type Receipt = Order & { employee_id:string; remaining_balance:number; items:Cart[] }

const emailLabel = (status?:string) => ({sent:'Sent',failed:'Failed',skipped:'Skipped',pending:'Sending',not_requested:'Not sent'}[status || 'not_requested'] || status)

export function OrdersPage(){
 const{profile}=useAuth();const isAdmin=profile?.role==='admin'
 const[members,setMembers]=useState<Member[]>([]),[items,setItems]=useState<Item[]>([]),[orders,setOrders]=useState<Order[]>([])
 const[memberId,setMemberId]=useState(''),[search,setSearch]=useState(''),[cart,setCart]=useState<Cart[]>([])
 const[error,setError]=useState<string|null>(null),[success,setSuccess]=useState<string|null>(null),[receipt,setReceipt]=useState<Receipt|null>(null),[sending,setSending]=useState<string|null>(null)

 const load=async()=>{const[{data:m,error:me},{data:i,error:ie},{data:o,error:oe}]=await Promise.all([
  supabase.from('member_balances').select('id,employee_id,full_name,balance,email,email_receipt_enabled').eq('status','active').order('full_name'),
  supabase.from('menu_items').select('id,name,sku,selling_price').eq('active',true).order('name'),
  supabase.from('orders').select('id,invoice_no,total,status,created_at,email_status,email_error,receipt_email,members(full_name)').order('created_at',{ascending:false}).limit(20),
 ]);const e=me||ie||oe;if(e)setError(e.message);setMembers((m as Member[])||[]);setItems((i as Item[])||[]);setOrders((o as unknown as Order[])||[])}
 useEffect(()=>{void load()},[])
 const shown=items.filter(i=>`${i.name} ${i.sku}`.toLowerCase().includes(search.toLowerCase())).slice(0,12)
 const total=useMemo(()=>cart.reduce((a,x)=>a+x.selling_price*x.qty,0),[cart])
 const add=(i:Item)=>setCart(c=>c.some(x=>x.id===i.id)?c.map(x=>x.id===i.id?{...x,qty:x.qty+1}:x):[...c,{...i,qty:1}])

 const sendReceipt=async(orderId:string)=>{setSending(orderId);const{data,error:sendError}=await supabase.functions.invoke('send-order-receipt',{body:{order_id:orderId}});setSending(null);if(sendError)setError(`Order saved, but email failed: ${sendError.message}`);else if(data?.error)setError(`Order saved, but email failed: ${data.error}`);else setSuccess(data?.status==='sent'?`PDF bill emailed to ${data.email}.`:'Order saved. Email skipped because no enabled member email was found.');await load()}

 const post=async()=>{setError(null);setSuccess(null);if(!memberId||!cart.length)return setError('Select a member and add at least one item.')
  const selected=members.find(m=>m.id===memberId),cartSnapshot=cart.map(x=>({...x}))
  const{data,error:postError}=await supabase.rpc('create_order',{p_member_id:memberId,p_items:cart.map(x=>({menu_item_id:x.id,quantity:x.qty})),p_idempotency_key:crypto.randomUUID()})
  if(postError)return setError(postError.message)
  const order=Array.isArray(data)?data[0]:data
  setCart([])
  if(order&&selected){const receiptOrder={...order,members:{full_name:selected.full_name},employee_id:selected.employee_id,remaining_balance:Number(selected.balance)-Number(order.total),items:cartSnapshot} as Receipt;setReceipt(receiptOrder);notify('SnackFlow order posted',`${receiptOrder.invoice_no} — ${money(receiptOrder.total)}`);void sendReceipt(order.id)}
  setSuccess(selected?.email&&selected.email_receipt_enabled?'Order posted. Preparing PDF bill email…':'Order posted. Add/enable member email to send a PDF bill.');await load()
 }

 const voidOrder=async(id:string)=>{if(!isAdmin||!confirm('Void this order and refund the wallet?'))return;const{error:voidError}=await supabase.rpc('void_order',{p_order_id:id,p_reason:'Voided from application'});if(voidError)setError(voidError.message);else await load()}
 const qrSummary=receipt?['SnackFlow Micro ERP - Bill Summary',`Order: ${receipt.invoice_no}`,`Member: ${receipt.members?.full_name}`,`Employee ID: ${receipt.employee_id}`,...receipt.items.map(x=>`${x.name} x ${x.qty} = ${money(x.qty*x.selling_price)}`),`Total: ${money(receipt.total)}`,`Wallet Deduction: ${money(receipt.total)}`,`Remaining Balance: ${money(receipt.remaining_balance)}`,`Status: ${receipt.status.toUpperCase()}`,`Processed By: ${profile?.full_name||'SnackFlow User'}`].join('\n'):''

 return <>
  <div className="page-title"><div><h1>Daily Orders</h1><p>Create orders with automatic wallet deduction and PDF email bill</p></div></div>
  <ErrorText error={error}/><SuccessText text={success}/>
  <div className="grid-2 orders-grid"><Card title="Build order"><label>Member<select value={memberId} onChange={e=>setMemberId(e.target.value)}><option value="">Select member</option>{members.map(m=><option key={m.id} value={m.id}>{m.employee_id} — {m.full_name} ({money(m.balance)}){m.email?' · Email ready':''}</option>)}</select></label><label>Search by name / SKU<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Scan or type…"/></label><div className="item-grid">{shown.map(i=><button className="item-btn" key={i.id} onClick={()=>add(i)}><b>{i.name}</b><small>{i.sku} · {money(i.selling_price)}</small></button>)}</div></Card>
  <Card title="Cart">{cart.length?<>{cart.map(x=><div className="cart-row" key={x.id}><div><b>{x.name}</b><small>{x.qty} × {money(x.selling_price)}</small></div><div><button className="tiny" onClick={()=>setCart(c=>c.map(y=>y.id===x.id?{...y,qty:Math.max(1,y.qty-1)}:y))}>−</button><button className="tiny" onClick={()=>setCart(c=>c.map(y=>y.id===x.id?{...y,qty:y.qty+1}:y))}>+</button><button className="tiny danger-btn" onClick={()=>setCart(c=>c.filter(y=>y.id!==x.id))}>×</button></div></div>)}<div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div><button onClick={post}>Post order & email bill</button></>:<Empty text="Add menu items to begin."/>}</Card></div>
  {receipt&&<Card title="Latest digital receipt" actions={<button className="secondary" onClick={()=>window.print()}>Print / PDF</button>}><div className="receipt digital-receipt"><QRCodeSVG value={qrSummary} size={112}/><div><h3>{receipt.invoice_no}</h3><p>{receipt.members?.full_name} · {receipt.employee_id}</p><strong>{money(receipt.total)}</strong><small>QR contains the bill summary text.</small></div></div></Card>}
  <Card title="Recent orders">{orders.length?<div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Member</th><th>Time</th><th>Total</th><th>Status</th><th>Email bill</th><th/></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.invoice_no}</td><td>{o.members?.full_name}</td><td>{new Date(o.created_at).toLocaleString()}</td><td>{money(o.total)}</td><td>{o.status}</td><td><span className={`pill email-${o.email_status||'not_requested'}`} title={o.email_error||''}>{emailLabel(o.email_status)}</span>{o.receipt_email&&<small className="table-subtext">{o.receipt_email}</small>}</td><td><div className="row-actions">{o.status==='posted'&&<button className="tiny secondary" disabled={sending===o.id} onClick={()=>void sendReceipt(o.id)}>{sending===o.id?'…':'Email'}</button>}{isAdmin&&o.status==='posted'&&<button className="tiny danger-btn" onClick={()=>void voidOrder(o.id)}>Void</button>}</div></td></tr>)}</tbody></table></div>:<Empty/>}</Card>
 </>
}
