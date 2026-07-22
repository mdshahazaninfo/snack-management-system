export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(Number(value || 0))

const dateParts = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date)

export const today = () => dateParts(new Date())
export const businessDayStartIso = (date = today()) => `${date}T00:00:00+06:00`

export const dateAfterDays = (days: number) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return dateParts(date)
}

export const monthLastDay = () => {
  const [year, month] = today().split('-').map(Number)
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const csv = [keys.map(escape).join(','), ...rows.map(row => keys.map(k => escape(row[k])).join(','))].join('\n')
  const a = document.createElement('a')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function notify(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
}
