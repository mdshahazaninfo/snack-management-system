import { useEffect, useRef, useState, type FormEvent } from 'react'
import { readSheet } from 'read-excel-file/browser'
import { supabase } from '../lib/supabase'
import { Card, Empty, ErrorText } from '../components/Ui'

type Member = {
  id: string
  employee_id: string
  full_name: string
  department: string | null
  mobile: string | null
  status: string
  low_balance_threshold: number
}

type SpreadsheetCell = string | number | boolean | Date | null

type MemberImportRow = {
  employee_id: string
  full_name: string
  department: string
  mobile: string
  low_balance_threshold: number
}

export function MembersPage() {
  const [rows, setRows] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from('members')
      .select('*')
      .order('full_name')

    if (loadError) setError(loadError.message)
    else setRows((data ?? []) as Member[])
  }

  useEffect(() => {
    void load()
  }, [])

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    const { error: insertError } = await supabase.from('members').insert({
      employee_id: String(formData.get('employee_id') ?? '').trim(),
      full_name: String(formData.get('full_name') ?? '').trim(),
      department: String(formData.get('department') ?? '').trim() || null,
      mobile: String(formData.get('mobile') ?? '').trim() || null,
      low_balance_threshold: Number(formData.get('threshold') || 200),
    })

    if (insertError) setError(insertError.message)
    else {
      setError(null)
      form.reset()
      await load()
    }
  }

  const importFile = async (input?: File) => {
    if (!input) return

    try {
      setError(null)
      const sheet = (await readSheet(input)) as SpreadsheetCell[][]
      if (!sheet.length) {
        setError('The selected Excel file is empty.')
        return
      }

      const headers = sheet[0].map((value: SpreadsheetCell) =>
        String(value ?? '').trim().toLowerCase(),
      )
      const index = (...names: string[]) =>
        headers.findIndex((header: string) => names.includes(header))

      const employeeIdIndex = index('employee_id', 'employee id')
      const fullNameIndex = index('full_name', 'full name')
      const departmentIndex = index('department')
      const mobileIndex = index('mobile')
      const thresholdIndex = index('low_balance_threshold', 'threshold')

      if (employeeIdIndex < 0 || fullNameIndex < 0) {
        setError('Excel must contain Employee ID and Full Name columns.')
        return
      }

      const importedRows: MemberImportRow[] = sheet
        .slice(1)
        .map((row: SpreadsheetCell[]) => ({
          employee_id: String(row[employeeIdIndex] ?? '').trim(),
          full_name: String(row[fullNameIndex] ?? '').trim(),
          department:
            departmentIndex >= 0 ? String(row[departmentIndex] ?? '').trim() : '',
          mobile: mobileIndex >= 0 ? String(row[mobileIndex] ?? '').trim() : '',
          low_balance_threshold:
            thresholdIndex >= 0 ? Number(row[thresholdIndex] || 200) : 200,
        }))
        .filter((row: MemberImportRow) => row.employee_id && row.full_name)

      if (!importedRows.length) {
        setError('No valid member rows were found in the Excel file.')
        return
      }

      const { error: importError } = await supabase
        .from('members')
        .upsert(importedRows, { onConflict: 'employee_id' })

      if (importError) setError(importError.message)
      else await load()
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'Could not read the selected Excel file.',
      )
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Members</h1>
          <p>Employee profiles and low-balance thresholds</p>
        </div>
        <div>
          <input
            hidden
            ref={file}
            type="file"
            accept=".xlsx"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
          <button className="secondary" onClick={() => file.current?.click()}>
            Import Excel
          </button>
        </div>
      </div>

      <ErrorText error={error} />

      <Card title="Add member">
        <form className="form-grid" onSubmit={add}>
          <label>
            Employee ID
            <input name="employee_id" required />
          </label>
          <label>
            Full name
            <input name="full_name" required />
          </label>
          <label>
            Department
            <input name="department" />
          </label>
          <label>
            Mobile
            <input name="mobile" />
          </label>
          <label>
            Low-balance threshold
            <input name="threshold" type="number" min="0" defaultValue="200" />
          </label>
          <button>Add member</button>
        </form>
      </Card>

      <Card title={`All members (${rows.length})`}>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => (
                  <tr key={member.id}>
                    <td>{member.employee_id}</td>
                    <td>{member.full_name}</td>
                    <td>{member.department}</td>
                    <td>{member.mobile}</td>
                    <td>
                      <span className="pill">{member.status}</span>
                    </td>
                    <td>{member.low_balance_threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Card>
    </>
  )
}
