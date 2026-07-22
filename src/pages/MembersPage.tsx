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
  status: string
  low_balance_threshold: number
}

type SpreadsheetCell = string | number | boolean | Date | null

type MemberImportRow = {
  employee_id: string
  full_name: string
  department: string
  mobile: string
  email: string | null
  email_receipt_enabled: boolean
  low_balance_threshold: number
}

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
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const { error: insertError } = await supabase.from('members').insert({
      employee_id: String(formData.get('employee_id') ?? '').trim(),
      full_name: String(formData.get('full_name') ?? '').trim(),
      department: String(formData.get('department') ?? '').trim() || null,
      mobile: String(formData.get('mobile') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim().toLowerCase() || null,
      email_receipt_enabled: formData.get('email_receipt_enabled') === 'on',
      low_balance_threshold: Number(formData.get('threshold') || 150),
    })
    if (insertError) setError(insertError.message)
    else {
      setError(null); setSuccess('Member added.'); form.reset(); await load()
    }
  }

  const updateReceipt = async (member: Member, email: string, enabled: boolean) => {
    setError(null); setSuccess(null)
    const { error: updateError } = await supabase.from('members').update({
      email: email.trim().toLowerCase() || null,
      email_receipt_enabled: enabled,
    }).eq('id', member.id)
    if (updateError) setError(updateError.message)
    else { setSuccess(`Receipt settings updated for ${member.full_name}.`); await load() }
  }

  const importFile = async (input?: File) => {
    if (!input) return
    try {
      setError(null); setSuccess(null)
      const sheet = (await readSheet(input)) as SpreadsheetCell[][]
      if (!sheet.length) return setError('The selected Excel file is empty.')
      const headers = sheet[0].map(value => String(value ?? '').trim().toLowerCase())
      const index = (...names: string[]) => headers.findIndex(header => names.includes(header))
      const employeeIdIndex = index('employee_id', 'employee id')
      const fullNameIndex = index('full_name', 'full name')
      const departmentIndex = index('department')
      const mobileIndex = index('mobile')
      const emailIndex = index('email', 'email address')
      const receiptIndex = index('email_receipt_enabled', 'email receipt', 'send receipt')
      const thresholdIndex = index('low_balance_threshold', 'threshold')
      if (employeeIdIndex < 0 || fullNameIndex < 0) return setError('Excel must contain Employee ID and Full Name columns.')

      const importedRows: MemberImportRow[] = sheet.slice(1).map(row => {
        const receiptValue = receiptIndex >= 0 ? String(row[receiptIndex] ?? 'yes').trim().toLowerCase() : 'yes'
        return {
          employee_id: String(row[employeeIdIndex] ?? '').trim(),
          full_name: String(row[fullNameIndex] ?? '').trim(),
          department: departmentIndex >= 0 ? String(row[departmentIndex] ?? '').trim() : '',
          mobile: mobileIndex >= 0 ? String(row[mobileIndex] ?? '').trim() : '',
          email: emailIndex >= 0 ? String(row[emailIndex] ?? '').trim().toLowerCase() || null : null,
          email_receipt_enabled: !['no','false','0','off'].includes(receiptValue),
          low_balance_threshold: thresholdIndex >= 0 ? Number(row[thresholdIndex] || 150) : 150,
        }
      }).filter(row => row.employee_id && row.full_name)
      if (!importedRows.length) return setError('No valid member rows were found in the Excel file.')
      const { error: importError } = await supabase.from('members').upsert(importedRows, { onConflict: 'employee_id' })
      if (importError) setError(importError.message)
      else { setSuccess(`${importedRows.length} members imported.`); await load() }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not read the selected Excel file.')
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  return <>
    <div className="page-title"><div><h1>Members</h1><p>Employee profiles, wallet alerts and digital receipt email</p></div><div><input hidden ref={file} type="file" accept=".xlsx" onChange={event => void importFile(event.target.files?.[0])}/><button className="secondary" onClick={() => file.current?.click()}>Import Excel</button></div></div>
    <ErrorText error={error}/><SuccessText text={success}/>
    <Card title="Add member"><form className="form-grid" onSubmit={add}>
      <label>Employee ID<input name="employee_id" required/></label>
      <label>Full name<input name="full_name" required/></label>
      <label>Department<input name="department"/></label>
      <label>Mobile<input name="mobile"/></label>
      <label>Email for bill copy<input name="email" type="email" placeholder="member@example.com"/></label>
      <label>Low-balance threshold<input name="threshold" type="number" min="0" defaultValue="150"/></label>
      <label className="checkbox-label"><input name="email_receipt_enabled" type="checkbox" defaultChecked/> Send PDF bill by email</label>
      <button>Add member</button>
    </form></Card>
    <Card title={`All members (${rows.length})`}>{rows.length ? <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Mobile</th><th>Email receipt</th><th>Status</th><th>Threshold</th></tr></thead><tbody>{rows.map(member => <MemberRow key={member.id} member={member} onSave={updateReceipt}/>)}</tbody></table></div> : <Empty/>}</Card>
  </>
}

function MemberRow({ member, onSave }: { member: Member; onSave: (member: Member, email: string, enabled: boolean) => Promise<void> }) {
  const [email, setEmail] = useState(member.email || '')
  const [enabled, setEnabled] = useState(member.email_receipt_enabled)
  return <tr>
    <td>{member.employee_id}</td><td>{member.full_name}</td><td>{member.department || '—'}</td><td>{member.mobile || '—'}</td>
    <td><div className="member-email-editor"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="No email"/><label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/> Send</label><button className="tiny secondary" onClick={() => void onSave(member, email, enabled)}>Save</button></div></td>
    <td><span className="pill">{member.status}</span></td><td>{member.low_balance_threshold}</td>
  </tr>
}
