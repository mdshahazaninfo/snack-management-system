export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 }).format(Number(value || 0))

export const today = () => new Date().toISOString().slice(0, 10)

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const csv = [keys.map(escape).join(','), ...rows.map(row => keys.map(k => escape(row[k])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function notify(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
}
