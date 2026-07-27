import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/utils'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

type Account={id:string;name:string;account_type:string;balance:number;low_balance_threshold:number;active:boolean}

export function PersonalFinanceAccountsPage(){
  const[accounts,setAccounts]=useState<Account[]>([]),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState<string|null>(null)
  const load=async()=>{const{data,error:loadError}=await supabase.from('pf_account_balances').select('*').order('name');if(loadError)setError(loadError.message);else setAccounts((data||[]) as Account[])}
  useEffect(()=>{void load()},[])

  const save=async(account:Account,patch:Partial<Account>)=>{const next={...account,...patch};const{error:updateError}=await supabase.rpc('pf_update_account',{p_id:next.id,p_name:next.name,p_account_type:next.account_type,p_low_balance_threshold:Number(next.low_balance_threshold),p_active:next.active});if(updateError)setError(updateError.message);else{setSuccess(`Account updated: ${next.name}`);await load()}}
  const remove=async(account:Account)=>{if(!confirm(`Remove ${account.name}? Accounts with transactions will be archived, not permanently deleted.`))return;const{data,error:removeError}=await supabase.rpc('pf_remove_account',{p_id:account.id});if(removeError)setError(removeError.message);else{setSuccess(data==='archived'?'Account archived because transaction history exists.':'Account permanently deleted.');await load()}}

  return <><div className="page-title"><div><h1>Finance Accounts</h1><p>Edit, activate, archive or remove your private finance accounts</p></div></div><ErrorText error={error}/><SuccessText text={success}/><Card title={`Accounts (${accounts.length})`}>{accounts.length?<div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Balance</th><th>Low alert</th><th>Status</th><th>Actions</th></tr></thead><tbody>{accounts.map(a=><AccountRow key={a.id} account={a} onSave={save} onRemove={remove}/>)}</tbody></table></div>:<Empty text="No finance accounts found."/>}</Card></>
}

function AccountRow({account,onSave,onRemove}:{account:Account;onSave:(a:Account,p:Partial<Account>)=>Promise<void>;onRemove:(a:Account)=>Promise<void>}){
  const[name,setName]=useState(account.name),[type,setType]=useState(account.account_type),[threshold,setThreshold]=useState(String(account.low_balance_threshold)),[active,setActive]=useState(account.active)
  return <tr><td><input value={name} onChange={e=>setName(e.target.value)}/></td><td><select value={type} onChange={e=>setType(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_wallet">Mobile wallet</option><option value="credit">Credit</option><option value="investment">Investment</option><option value="other">Other</option></select></td><td><strong>{money(account.balance)}</strong></td><td><input type="number" min="0" step="0.01" value={threshold} onChange={e=>setThreshold(e.target.value)}/></td><td><select value={active?'active':'inactive'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td><div className="row-actions"><button className="tiny secondary" onClick={()=>void onSave(account,{name,account_type:type,low_balance_threshold:Number(threshold),active})}>Save</button><button className="tiny danger-btn" onClick={()=>void onRemove(account)}>Delete</button></div></td></tr>
}
