import { useEffect, useRef, useState, type FormEvent } from 'react'
import readXlsxFile from 'read-excel-file'
import { supabase } from '../lib/supabase'
import { Card, Empty, ErrorText } from '../components/Ui'

type Member = { id: string; employee_id: string; full_name: string; department: string | null; mobile: string | null; status: string; low_balance_threshold: number }
export function MembersPage() {
  const [rows, setRows] = useState<Member[]>([]); const [error, setError] = useState<string | null>(null); const file = useRef<HTMLInputElement>(null)
  const load = async () => { const { data, error } = await supabase.from('members').select('*').order('full_name'); if (error) setError(error.message); else setRows(data || []) }
  useEffect(() => { load() }, [])
  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget)
    const { error } = await supabase.from('members').insert({ employee_id: f.get('employee_id'), full_name: f.get('full_name'), department: f.get('department'), mobile: f.get('mobile'), low_balance_threshold: Number(f.get('threshold') || 200) })
    if (error) setError(error.message); else { e.currentTarget.reset(); load() }
  }
  const importFile = async (input?: File) => {
    if (!input) return
    const sheet = await readXlsxFile(input)
    if (!sheet.length) return
    const headers = sheet[0].map(value => String(value || '').trim().toLowerCase())
    const index = (...names: string[]) => headers.findIndex(header => names.includes(header))
    const employeeIdIndex = index('employee_id', 'employee id')
    const fullNameIndex = index('full_name', 'full name')
    const departmentIndex = index('department')
    const mobileIndex = index('mobile')
    const thresholdIndex = index('low_balance_threshold', 'threshold')
    if (employeeIdIndex < 0 || fullNameIndex < 0) { setError('Excel must contain Employee ID and Full Name columns.'); return }
    const data = sheet.slice(1).map(row => ({
      employee_id: String(row[employeeIdIndex] || '').trim(),
      full_name: String(row[fullNameIndex] || '').trim(),
      department: departmentIndex >= 0 ? String(row[departmentIndex] || '').trim() : '',
      mobile: mobileIndex >= 0 ? String(row[mobileIndex] || '').trim() : '',
      low_balance_threshold: thresholdIndex >= 0 ? Number(row[thresholdIndex] || 200) : 200,
    })).filter(row => row.employee_id && row.full_name)
    const { error } = await supabase.from('members').upsert(data, { onConflict: 'employee_id' }); if (error) setError(error.message); else load()
  }
  return <><div className="page-title"><div><h1>Members</h1><p>Employee profiles and low-balance thresholds</p></div><div><input hidden ref={file} type="file" accept=".xlsx,.xls" onChange={e => importFile(e.target.files?.[0])}/><button className="secondary" onClick={() => file.current?.click()}>Import Excel</button></div></div><ErrorText error={error}/>
    <Card title="Add member"><form className="form-grid" onSubmit={add}><label>Employee ID<input name="employee_id" required/></label><label>Full name<input name="full_name" required/></label><label>Department<input name="department"/></label><label>Mobile<input name="mobile"/></label><label>Low-balance threshold<input name="threshold" type="number" min="0" defaultValue="200"/></label><button>Add member</button></form></Card>
    <Card title={`All members (${rows.length})`}>{rows.length ? <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Mobile</th><th>Status</th><th>Threshold</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.employee_id}</td><td>{r.full_name}</td><td>{r.department}</td><td>{r.mobile}</td><td><span className="pill">{r.status}</span></td><td>{r.low_balance_threshold}</td></tr>)}</tbody></table></div> : <Empty/>}</Card>
  </>
}
