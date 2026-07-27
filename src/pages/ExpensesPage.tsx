import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { downloadCsv, money, today } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

type Expense = { id:string; expense_date:string; category:string; description:string; amount:number; status:string }

export function ExpensesPage(){
  const{profile}=useAuth();const isAdmin=profile?.role==='admin'
  const[rows,setRows]=useState<Expense[]>([]),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState<string|null>(null)
  const load=async()=>{const{data,error:loadError}=await supabase.from('expenses').select('*').order('expense_date',{ascending:false});if(loadError)setError(loadError.message);else setRows((data||[]) as Expense[])}
  useEffect(()=>{void load()},[])

  const add=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!isAdmin)return;const form=e.currentTarget;const f=new FormData(form);const{error:insertError}=await supabase.from('expenses').insert({expense_date:f.get('date'),category:f.get('category'),description:f.get('description'),amount:Number(f.get('amount'))});if(insertError)setError(insertError.message);else{setSuccess('Expense added.');form.reset();await load()}}
  const save=async(expense:Expense,patch:Partial<Expense>)=>{if(!isAdmin)return;const next={...expense,...patch};const{error:updateError}=await supabase.from('expenses').update({expense_date:next.expense_date,category:next.category,description:next.description,amount:Number(next.amount),status:next.status}).eq('id',next.id);if(updateError)setError(updateError.message);else{setSuccess('Expense updated.');await load()}}
  const remove=async(expense:Expense)=>{if(!isAdmin||!confirm('Delete this expense? Closed-month records cannot be deleted.'))return;const{error:deleteError}=await supabase.from('expenses').delete().eq('id',expense.id);if(deleteError)setError(deleteError.message);else{setSuccess('Expense deleted.');await load()}}

  return <><div className="page-title"><div><h1>Expenses</h1><p>View and download the operating expense ledger</p></div><button className="secondary" onClick={()=>downloadCsv(`snackflow-expenses-${today()}.csv`,rows)}>Export CSV</button></div><ErrorText error={error}/><SuccessText text={success}/>{isAdmin&&<Card title="Add expense"><form className="form-grid" onSubmit={add}><label>Date<input name="date" type="date" defaultValue={today()} required/></label><label>Category<input name="category" required/></label><label>Description<input name="description" required/></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><button>Add expense</button></form></Card>}<Card title="Expense history">{rows.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th>{isAdmin&&<th>Actions</th>}</tr></thead><tbody>{rows.map(r=>isAdmin?<ExpenseRow key={r.id} expense={r} onSave={save} onRemove={remove}/>:<tr key={r.id}><td>{r.expense_date}</td><td>{r.category}</td><td>{r.description}</td><td>{money(r.amount)}</td><td>{r.status}</td></tr>)}</tbody></table></div>:<Empty/>}</Card></>
}

function ExpenseRow({expense,onSave,onRemove}:{expense:Expense;onSave:(e:Expense,p:Partial<Expense>)=>Promise<void>;onRemove:(e:Expense)=>Promise<void>}){
  const[date,setDate]=useState(expense.expense_date),[category,setCategory]=useState(expense.category),[description,setDescription]=useState(expense.description),[amount,setAmount]=useState(String(expense.amount)),[status,setStatus]=useState(expense.status)
  return <tr><td><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></td><td><input value={category} onChange={e=>setCategory(e.target.value)}/></td><td><input value={description} onChange={e=>setDescription(e.target.value)}/></td><td><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></td><td><select value={status} onChange={e=>setStatus(e.target.value)}><option value="posted">Posted</option><option value="void">Void</option></select></td><td><div className="row-actions"><button className="tiny secondary" onClick={()=>void onSave(expense,{expense_date:date,category,description,amount:Number(amount),status})}>Save</button><button className="tiny danger-btn" onClick={()=>void onRemove(expense)}>Delete</button></div></td></tr>
}
