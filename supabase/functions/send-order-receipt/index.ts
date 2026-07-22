import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import QRCode from 'https://esm.sh/qrcode@1.5.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c))
const money = (value: number) => `BDT ${Number(value || 0).toFixed(2)}`

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = request.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { order_id } = await request.json()
    if (!order_id) throw new Error('order_id is required')

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await admin.from('profiles').select('full_name,status').eq('id', user.id).single()
    if (profile?.status !== 'active') throw new Error('Account is not active')

    const { data: receipt, error: receiptError } = await admin.from('order_receipt_data').select('*').eq('id', order_id).single()
    if (receiptError || !receipt) throw new Error(receiptError?.message || 'Order not found')

    const { data: items, error: itemError } = await admin.from('order_items').select('item_name,quantity,unit_price').eq('order_id', order_id).order('item_name')
    if (itemError) throw itemError

    const recipient = receipt.receipt_email || receipt.member_email
    if (!recipient || !receipt.email_receipt_enabled) {
      await admin.from('orders').update({ email_status: 'skipped', email_error: recipient ? 'Receipt email disabled' : 'Member has no email address' }).eq('id', order_id)
      return new Response(JSON.stringify({ status: 'skipped' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    await admin.from('orders').update({ receipt_email: recipient, email_status: 'pending', email_error: null }).eq('id', order_id)
    const { count } = await admin.from('order_email_deliveries').select('*', { count: 'exact', head: true }).eq('order_id', order_id)
    const attemptNo = (count || 0) + 1
    const { data: delivery } = await admin.from('order_email_deliveries').insert({ order_id, recipient_email: recipient, attempt_no: attemptNo }).select('id').single()

    const orderDate = new Date(receipt.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })
    const summaryLines = [
      'SnackFlow Micro ERP - Bill Summary',
      `Order: ${receipt.invoice_no}`,
      `Date: ${orderDate}`,
      `Member: ${receipt.full_name}`,
      `Employee ID: ${receipt.employee_id}`,
      ...((items || []).map(i => `${i.item_name} x ${Number(i.quantity)} = ${money(Number(i.quantity) * Number(i.unit_price))}`)),
      `Total: ${money(receipt.total)}`,
      `Wallet Deduction: ${money(receipt.total)}`,
      `Remaining Balance: ${money(receipt.remaining_balance)}`,
      `Status: ${String(receipt.status).toUpperCase()}`,
      `Processed By: ${profile?.full_name || 'SnackFlow User'}`,
    ]
    const summaryText = summaryLines.join('\n')
    const qrDataUrl = await QRCode.toDataURL(summaryText, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
    const qrBase64 = qrDataUrl.split(',')[1]

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([420, 595])
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const qr = await pdf.embedPng(Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0)))
    const teal = rgb(0.08, 0.46, 0.42)
    const ink = rgb(0.10, 0.13, 0.18)
    const muted = rgb(0.42, 0.45, 0.50)
    const soft = rgb(0.97, 0.97, 0.94)

    page.drawRectangle({ x: 0, y: 0, width: 420, height: 595, color: soft })
    page.drawRectangle({ x: 24, y: 24, width: 372, height: 547, color: rgb(1, 1, 1), borderColor: rgb(0.88, 0.88, 0.84), borderWidth: 1 })
    page.drawRectangle({ x: 24, y: 501, width: 372, height: 70, color: teal })
    page.drawText('SnackFlow', { x: 45, y: 535, size: 21, font: bold, color: rgb(1, 1, 1) })
    page.drawText('DIGITAL BILL COPY', { x: 45, y: 516, size: 9, font: regular, color: rgb(0.83, 1, 0.96) })
    page.drawText(receipt.invoice_no, { x: 280, y: 534, size: 10, font: bold, color: rgb(1, 1, 1) })
    page.drawText(orderDate, { x: 280, y: 517, size: 7, font: regular, color: rgb(0.86, 1, 0.97) })

    page.drawText(receipt.full_name, { x: 45, y: 475, size: 14, font: bold, color: ink })
    page.drawText(`Employee ID: ${receipt.employee_id}`, { x: 45, y: 458, size: 9, font: regular, color: muted })
    page.drawText('ITEM', { x: 45, y: 428, size: 8, font: bold, color: muted })
    page.drawText('QTY', { x: 240, y: 428, size: 8, font: bold, color: muted })
    page.drawText('AMOUNT', { x: 300, y: 428, size: 8, font: bold, color: muted })
    page.drawLine({ start: { x: 45, y: 420 }, end: { x: 375, y: 420 }, thickness: 1, color: rgb(0.88, 0.88, 0.84) })

    let y = 402
    for (const item of (items || []).slice(0, 10)) {
      page.drawText(String(item.item_name).slice(0, 29), { x: 45, y, size: 9, font: regular, color: ink })
      page.drawText(String(Number(item.quantity)), { x: 248, y, size: 9, font: regular, color: ink })
      page.drawText(money(Number(item.quantity) * Number(item.unit_price)), { x: 300, y, size: 9, font: regular, color: ink })
      y -= 19
    }
    page.drawLine({ start: { x: 45, y: y + 7 }, end: { x: 375, y: y + 7 }, thickness: 1, color: rgb(0.88, 0.88, 0.84) })
    page.drawText('TOTAL', { x: 45, y: y - 12, size: 11, font: bold, color: ink })
    page.drawText(money(receipt.total), { x: 300, y: y - 12, size: 11, font: bold, color: teal })

    const boxY = 88
    page.drawRectangle({ x: 45, y: boxY, width: 215, height: 118, color: rgb(0.96, 0.99, 0.98) })
    const details = [
      ['Wallet deduction', money(receipt.total)],
      ['Remaining balance', money(receipt.remaining_balance)],
      ['Order status', String(receipt.status).toUpperCase()],
      ['Processed by', profile?.full_name || 'SnackFlow User'],
    ]
    details.forEach(([label, value], index) => {
      const dy = boxY + 91 - index * 23
      page.drawText(label, { x: 58, y: dy, size: 8, font: regular, color: muted })
      page.drawText(String(value).slice(0, 24), { x: 145, y: dy, size: 8, font: bold, color: ink })
    })
    page.drawImage(qr, { x: 282, y: 91, width: 91, height: 91 })
    page.drawText('Scan for bill summary', { x: 279, y: 76, size: 7, font: regular, color: muted })
    page.drawText('Thank you for using SnackFlow.', { x: 45, y: 48, size: 8, font: regular, color: muted })

    const pdfBytes = await pdf.save()
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes))
    const itemRows = (items || []).map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #eceee9">${esc(i.item_name)}</td><td style="text-align:center;border-bottom:1px solid #eceee9">${Number(i.quantity)}</td><td style="text-align:right;border-bottom:1px solid #eceee9">${money(Number(i.quantity) * Number(i.unit_price))}</td></tr>`).join('')
    const html = `<div style="font-family:Arial,sans-serif;background:#f4f6f3;padding:24px;color:#172033"><div style="max-width:600px;margin:auto;background:white;border-radius:18px;overflow:hidden"><div style="background:#137d73;color:white;padding:24px"><h1 style="margin:0">SnackFlow</h1><p style="margin:6px 0 0">Digital Bill Copy - ${esc(receipt.invoice_no)}</p></div><div style="padding:24px"><h2 style="margin-top:0">${esc(receipt.full_name)}</h2><p>Employee ID: ${esc(receipt.employee_id)}<br>Date: ${esc(orderDate)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>${itemRows}</tbody></table><h2 style="text-align:right;color:#137d73">Total: ${money(receipt.total)}</h2><div style="background:#eef9f6;padding:16px;border-radius:12px"><p>Wallet deduction: <b>${money(receipt.total)}</b><br>Remaining balance: <b>${money(receipt.remaining_balance)}</b><br>Status: <b>${esc(String(receipt.status).toUpperCase())}</b></p></div><div style="text-align:center;margin-top:22px"><img src="${qrDataUrl}" width="150" height="150" alt="Bill summary QR"><p style="color:#68707d;font-size:13px">Scan QR to view the bill summary text.</p></div><p style="color:#68707d;font-size:13px">A soft PDF copy is attached to this email.</p></div></div></div>`

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RECEIPT_FROM_EMAIL'),
        to: [recipient],
        subject: `SnackFlow Bill ${receipt.invoice_no} - ${money(receipt.total)}`,
        html,
        attachments: [{ filename: `${receipt.invoice_no}.pdf`, content: pdfBase64 }],
      }),
    })
    const providerBody = await resendResponse.json().catch(() => ({}))
    if (!resendResponse.ok) throw new Error(providerBody?.message || `Email provider returned ${resendResponse.status}`)

    await admin.from('orders').update({ email_status: 'sent', email_sent_at: new Date().toISOString(), email_error: null }).eq('id', order_id)
    if (delivery?.id) await admin.from('order_email_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerBody?.id || null }).eq('id', delivery.id)
    return new Response(JSON.stringify({ status: 'sent', email: recipient }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt email failed'
    try {
      const { order_id } = await request.clone().json()
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      if (order_id) await admin.from('orders').update({ email_status: 'failed', email_error: message }).eq('id', order_id)
    } catch { /* keep original error */ }
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
