import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

type Profile={id:string;full_name:string|null;email:string|null;role:string;status:string}

const backupTables = [
  'profiles','user_invites','members','menu_items','menu_price_history',
  'wallet_transactions','orders','order_items','order_email_deliveries',
  'expenses','month_closings','notifications','app_settings','audit_logs',
  'pf_accounts','pf_categories','pf_transactions','pf_budgets','pf_goals','pf_recurring',
]

export function SettingsPage(){
  const { profile } = useAuth()
  const [users,setUsers]=useState<Profile[]>([])
  const [alertEmail,setAlertEmail]=useState('')
  const [error,setError]=useState<string|null>(null)
  const [success,setSuccess]=useState<string|null>(null)

  const load=async()=>{
    const [{data:profiles,error:profilesError},{data:setting,error:settingError}] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('app_settings').select('value').eq('key','low_balance_email').maybeSingle(),
    ])
    if(profilesError||settingError){setError((profilesError||settingError)?.message||'Could not load settings.');return}
    setUsers((profiles as Profile[])||[])
    const value = setting?.value as {email?:string}|undefined
    setAlertEmail(value?.email||'')
  }

  useEffect(()=>{void load()},[])

  const invite=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError(null);setSuccess(null)
    const form=e.currentTarget
    const f=new FormData(form)
    const email=String(f.get('email')).trim().toLowerCase()
    const selectedRole=String(f.get('role'))
    const dbRole=selectedRole==='admin'?'admin':'cashier'
    const {error:inviteError}=await supabase.from('user_invites').upsert({email,full_name:f.get('name'),role:dbRole,status:'approved'},{onConflict:'email'})
    if(inviteError){setError(inviteError.message);return}
    const {error:updateError}=await supabase.from('profiles').update({role:dbRole,status:'active',full_name:f.get('name')}).eq('email',email)
    if(updateError){setError(updateError.message);return}
    setSuccess('User approved. Existing pending account was activated; otherwise they can sign up with this email.')
    form.reset();await load()
  }

  const saveAlertEmail=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError(null);setSuccess(null)
    const f=new FormData(e.currentTarget)
    const email=String(f.get('email')).trim().toLowerCase()
    const {error:saveError}=await supabase.from('app_settings').upsert({key:'low_balance_email',value:{email}},{onConflict:'key'})
    if(saveError)setError(saveError.message);else{setAlertEmail(email);setSuccess('Low-balance alert email saved.')}
  }

  const close=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError(null);setSuccess(null);const f=new FormData(e.currentTarget);const{error:closeError}=await supabase.rpc('close_month',{p_month:String(f.get('month'))+'-01'});if(closeError)setError(closeError.message);else setSuccess('Month closed successfully.')}

  const backup=async()=>{
    setError(null);setSuccess(null)
    const out:Record<string,unknown>={exported_at:new Date().toISOString(),format_version:2}
    const failures:string[]=[]
    for(const table of backupTables){
      const{data,error:tableError}=await supabase.from(table).select('*')
      if(tableError){failures.push(`${table}: ${tableError.message}`);out[table]=[]}
      else out[table]=data||[]
    }
    if(failures.length){setError(`Backup stopped because ${failures.length} table(s) could not be read: ${failures.join(' | ')}`);return}
    const a=document.createElement('a')
    const url=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}))
    a.href=url;a.download=`snackflow-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)
    setSuccess('Complete JSON backup downloaded.')
  }

  return <><div className="page-title"><div><h1>Settings</h1><p>Users, alerts, closing and backup</p></div><button className="secondary" onClick={()=>void backup()}>Backup JSON</button></div><ErrorText error={error}/><SuccessText text={success}/>
    {profile?.role==='admin'&&<Card title="Approve user"><form className="form-grid" onSubmit={invite}><label>Name<input name="name" required/></label><label>Email<input name="email" type="email" required/></label><label>Access<select name="role"><option value="user">User — Orders, wallet deposit, expense/report view</option><option value="admin">Admin — Full access</option></select></label><button>Approve</button></form></Card>}
    <Card title="Low-balance email"><form className="form-grid" onSubmit={saveAlertEmail}><label>Recipient email<input name="email" type="email" defaultValue={alertEmail} required/></label><button>Save email</button></form><p className="muted">An email notification record is created when an order leaves a member below BDT 150. Supabase webhook and Resend must also be configured to deliver it.</p></Card>
    <Card title="Month closing"><form className="form-grid" onSubmit={close}><label>Month<input type="month" name="month" required/></label><button className="danger-btn">Close month</button></form><p className="muted">Closing blocks new or changed financial transactions dated inside that month.</p></Card>
    <Card title="Users">{users.length?<div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role==='admin'?'Admin':'User'}</td><td>{u.status}</td></tr>)}</tbody></table></div>:<Empty/>}</Card>
    <Card title="Browser notifications"><button className="secondary" onClick={()=>Notification.requestPermission()}>Enable browser notifications</button></Card>
  </>}
