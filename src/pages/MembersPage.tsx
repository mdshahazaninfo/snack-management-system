import { useEffect, useRef, useState, type FormEvent } from 'react'
import { readSheet } from 'read-excel-file/browser'
import { supabase } from '../lib/supabase'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

type Member = {
  id: string
  employee_id: string
  full_name: string
  department: string | null
  mobile: string | null
  email: string | null
  email_receipt_enabled: boolean
  status: 'active' | 'inactive'
  low_balance_threshold: number
}

type SpreadsheetCell = string | number | boolean | Date | null
type MemberImportRow = { employee_id:string; full_name:string; department:string; mobile:string; email:string|null; email_receipt_enabled:boolean; low_balance_threshold:number }

export function MembersPage() {
  const [rows, setRows] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const load = async () => {
    const { data, error: loadError } = await supabase.from('members').select('*').order('full_name')
    if (loadError) setError(loadError.message)
    else setRows((data ?? []) as Member[])
  }
  useEffect(() => { void load() }, [])

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const f = new FormData(form)
    const { error: insertError } = await supabase.from('members').insert({
      employee_id:String(f.get('employee_id')??'').trim(), full_name:String(f.get('full_name')??'').trim(),
      department:String(f.get('department')??'').trim()||null, mobile:String(f.get('mobile')??'').trim()||null,
      email:String(f.get('email')??'').trim().toLowerCase()||null,
      email_receipt_enabled:f.get('email_receipt_enabled')==='on', low_balance_threshold:Number(f.get('threshold')||150),
    })
    if (insertError) setError(insertError.message)
    else { setError(null); setSuccess('Member added.'); form.reset(); await load() }
  }

  const saveMember = async (member: Member, patch: Partial<Member>) => {
    setError(null); setSuccess(null)
    const next = { ...member, ...patch }
    const { error: updateError } = await supabase.rpc('admin_update_member', {
      p_id:next.id, p_employee_id:next.employee_id, p_full_name:next.full_name,
      p_department:next.department||'', p_mobile:next.mobile||'', p_email:next.email||'',
      p_email_receipt_enabled:next.email_receipt_enabled,
      p_low_balance_threshold:Number(next.low_balance_threshold), p_status:next.status,
    })
    if (updateError) setError(updateError.message)
    else { setSuccess(`Member updated: ${next.full_name}`); await load() }
  }

  const removeMember = async (member: Member) => {
    if (!confirm(`Remove ${member.full_name}? Members with wallet/order history will be archived instead of permanently deleted.`)) return
    const { data, error: removeError } = await supabase.rpc('admin_remove_member', { p_id: member.id })
    if (removeError) setError(removeError.message)
    else { setSuccess(data === 'archived' ? 'Member archived because financial history exists.' : 'Member permanently deleted.'); await load() }
  }

  const importFile = async (input?: File) => {
    if (!input) return
    try {
      setError(null); setSuccess(null)
      const sheet = (await readSheet(input)) as SpreadsheetCell[][]
      if (!sheet.length) return setError('The selected Excel file is empty.')
      const headers = sheet[0].map(value => String(value ?? '').trim().toLowerCase())
      const index = (...names: string[]) => headers.findIndex(header => names.includes(header))
      const employeeIdIndex=index('employee_id','employee id'), fullNameIndex=index('full_name','full name'), departmentIndex=index('department'), mobileIndex=index('mobile'), emailIndex=index('email','email address'), receiptIndex=index('email_receipt_enabled','email receipt','send receipt'), thresholdIndex=index('low_balance_threshold','threshold')
      if (employeeIdIndex < 0 || fullNameIndex < 0) return setError('Excel must contain Employee ID and Full Name columns.')
      const importedRows: MemberImportRow[] = sheet.slice(1).map(row => {
        const receiptValue = receiptIndex >= 0 ? String(row[receiptIndex] ?? 'yes').trim().toLowerCase() : 'yes'
        return { employee_id:String(row[employeeIdIndex]??'').trim(), full_name:String(row[fullNameIndex]??'').trim(), department:departmentIndex>=0?String(row[departmentIndex]??'').trim():'', mobile:mobileIndex>=0?String(row[mobileIndex]??'').trim():'', email:emailIndex>=0?String(row[emailIndex]??'').trim().toLowerCase()||null:null, email_receipt_enabled:!['no','false','0','off'].includes(receiptValue), low_balance_threshold:thresholdIndex>=0?Number(row[thresholdIndex]||150):150 }
      }).filter(row=>row.employee_id&&row.full_name)
      if (!importedRows.length) return setError('No valid member rows were found in the Excel file.')
      const { error: importError } = await supabase.from('members').upsert(importedRows,{onConflict:'employee_id'})
      if (importError) setError(importError.message); else { setSuccess(`${importedRows.length} members imported.`); await load() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the selected Excel file.') }
    finally { if (file.current) file.current.value='' }
  }

  return <>
    <div className="page-title"><div><h1>Members</h1><p>Employee profiles, wallet alerts and digital receipt email</p></div><div><input hidden ref={file} type="file" accept=".xlsx" onChange={e=>void importFile(e.target.files?.[0])}/><button className="secondary" onClick={()=>file.current?.click()}>Import Excel</button></div></div>
    <ErrorText error={error}/><SuccessText text={success}/>
    <Card title="Add member"><form className="form-grid" onSubmit={add}><label>Employee ID<input name="employee_id" required/></label><label>Full name<input name="full_name" required/></label><label>Department<input name="department"/></label><label>Mobile<input name="mobile"/></label><label>Email for bill copy<input name="email" type="email" placeholder="member@example.com"/></label><label>Low-balance threshold<input name="threshold" type="number" min="0" defaultValue="150"/></label><label className="checkbox-label"><input name="email_receipt_enabled" type="checkbox" defaultChecked/> Send PDF bill by email</label><button>Add member</button></form></Card>
    <Card title={`All members (${rows.length})`}>{rows.length?<div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Mobile</th><th>Email receipt</th><th>Status</th><th>Threshold</th><th>Actions</th></tr></thead><tbody>{rows.map(member=><MemberRow key={member.id} member={member} onSave={saveMember} onRemove={removeMember}/>)}</tbody></table></div>:<Empty/>}</Card>
  </>
}

function MemberRow({member,onSave,onRemove}:{member:Member;onSave:(m:Member,p:Partial<Member>)=>Promise<void>;onRemove:(m:Member)=>Promise<void>}){
  const [name,setName]=useState(member.full_name),[department,setDepartment]=useState(member.department||''),[mobile,setMobile]=useState(member.mobile||''),[email,setEmail]=useState(member.email||''),[enabled,setEnabled]=useState(member.email_receipt_enabled),[threshold,setThreshold]=useState(String(member.low_balance_threshold)),[status,setStatus]=useState<Member['status']>(member.status)
  return <tr><td>{member.employee_id}</td><td><input value={name} onChange={e=>setName(e.target.value)}/></td><td><input value={department} onChange={e=>setDepartment(e.target.value)}/></td><td><input value={mobile} onChange={e=>setMobile(e.target.value)}/></td><td><div className="member-email-editor"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="No email"/><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Send</label></div></td><td><select value={status} onChange={e=>setStatus(e.target.value as Member['status'])}><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td><input type="number" min="0" value={threshold} onChange={e=>setThreshold(e.target.value)}/></td><td><div className="row-actions"><button className="tiny secondary" onClick={()=>void onSave(member,{full_name:name,department,mobile,email,email_receipt_enabled:enabled,low_balance_threshold:Number(threshold),status})}>Save</button><button className="tiny danger-btn" onClick={()=>void onRemove(member)}>Delete</button></div></td></tr>
}
