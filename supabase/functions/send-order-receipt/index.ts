import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import QRCode from 'https://esm.sh/qrcode@1.5.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const money = (value: unknown) => `BDT ${Number(value || 0).toFixed(2)}`
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c))
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  let orderId = ''
  let deliveryId = ''
  let admin: SupabaseClient | null = null

  try {
    const body = await request.json()
    orderId = String(body?.order_id || '')
    if (!orderId) throw new Error('order_id is required')

    const url = Deno.env.get('SUPABASE_URL')
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const sender = Deno.env.get('RECEIPT_FROM_EMAIL')
    if (!url || !anon || !service) throw new Error('Supabase function environment is incomplete')
    if (!resendKey || !sender) throw new Error('Receipt email secrets are not configured')

    const authHeader = request.headers.get('Authorization') || ''
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    admin = createClient(url, service)
    const { data: profile, error: profileError } = await admin.from('profiles').select('full_name,status,role').eq('id', user.id).single()
    if (profileError || profile?.status !== 'active') throw new Error('Account is not active')
    if (!['admin','cashier'].includes(String(profile.role))) throw new Error('Permission denied')

    const { data: receipt, error: receiptError } = await admin.from('order_receipt_data').select('*').eq('id', orderId).single()
    if (receiptError || !receipt) throw new Error(receiptError?.message || 'Order not found')
    const { data: items, error: itemError } = await admin.from('order_items').select('item_name,quantity,unit_price').eq('order_id', orderId).order('item_name')
    if (itemError) throw itemError

    const recipient = receipt.receipt_email || receipt.member_email
    if (!recipient || !receipt.email_receipt_enabled) {
      await admin.from('orders').update({ email_status: 'skipped', email_error: recipient ? 'Receipt email disabled' : 'Member has no email address' }).eq('id', orderId)
      return new Response(JSON.stringify({ status: 'skipped' }), { headers: cors })
    }

    await admin.from('orders').update({ receipt_email: recipient, email_status: 'pending', email_error: null }).eq('id', orderId)
    const { count } = await admin.from('order_email_deliveries').select('*', { count: 'exact', head: true }).eq('order_id', orderId)
    const { data: delivery, error: deliveryError } = await admin.from('order_email_deliveries').insert({ order_id: orderId, recipient_email: recipient, attempt_no: (count || 0) + 1 }).select('id').single()
    if (deliveryError) throw deliveryError
    deliveryId = delivery?.id || ''

    const orderDate = new Date(receipt.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })
    const itemLines = (items || []).map(item => `${item.item_name} x ${Number(item.quantity)} = ${money(Number(item.quantity) * Number(item.unit_price))}`)
    const summaryText = [
      'SnackFlow Micro ERP - Bill Summary',
      `Order: ${receipt.invoice_no}`,
      `Date: ${orderDate}`,
      `Member: ${receipt.full_name}`,
      `Employee ID: ${receipt.employee_id}`,
      ...itemLines,
      `Total: ${money(receipt.total)}`,
      `Wallet Deduction: ${money(receipt.total)}`,
      `Remaining Balance: ${money(receipt.remaining_balance)}`,
      `Status: ${String(receipt.status).toUpperCase()}`,
      `Processed By: ${profile?.full_name || 'SnackFlow User'}`,
    ].join('\n')

    const qrDataUrl = await QRCode.toDataURL(summaryText, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
    const qrBytes = Uint8Array.from(atob(qrDataUrl.split(',')[1]), c => c.charCodeAt(0))

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([420, 595])
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const qrImage = await pdf.embedPng(qrBytes)
    const teal = rgb(0.08, 0.49, 0.45), ink = rgb(0.09, 0.13, 0.20), muted = rgb(0.41, 0.45, 0.51)
    page.drawRectangle({ x: 0, y: 0, width: 420, height: 595, color: rgb(0.96, 0.97, 0.95) })
    page.drawRectangle({ x: 24, y: 24, width: 372, height: 547, color: rgb(1, 1, 1), borderColor: rgb(0.87, 0.88, 0.85), borderWidth: 1 })
    page.drawRectangle({ x: 24, y: 501, width: 372, height: 70, color: teal })
    page.drawText('SnackFlow', { x: 44, y: 536, size: 21, font: bold, color: rgb(1,1,1) })
    page.drawText('DIGITAL BILL COPY', { x: 44, y: 517, size: 9, font: regular, color: rgb(0.82,1,0.96) })
    page.drawText(String(receipt.invoice_no), { x: 275, y: 534, size: 10, font: bold, color: rgb(1,1,1) })
    page.drawText(orderDate, { x: 275, y: 517, size: 7, font: regular, color: rgb(0.85,1,0.97) })
    page.drawText(String(receipt.full_name), { x: 44, y: 475, size: 14, font: bold, color: ink })
    page.drawText(`Employee ID: ${receipt.employee_id}`, { x: 44, y: 457, size: 9, font: regular, color: muted })
    page.drawText('ITEM', { x: 44, y: 428, size: 8, font: bold, color: muted })
    page.drawText('QTY', { x: 244, y: 428, size: 8, font: bold, color: muted })
    page.drawText('AMOUNT', { x: 300, y: 428, size: 8, font: bold, color: muted })
    page.drawLine({ start:{x:44,y:420}, end:{x:376,y:420}, thickness:1, color:rgb(0.88,0.88,0.85) })
    let y = 402
    for (const item of (items || []).slice(0, 12)) {
      page.drawText(String(item.item_name).slice(0, 31), { x:44, y, size:8, font:regular, color:ink })
      page.drawText(String(Number(item.quantity)), { x:249, y, size:8, font:regular, color:ink })
      page.drawText(money(Number(item.quantity) * Number(item.unit_price)), { x:300, y, size:8, font:regular, color:ink })
      y -= 15
    }
    page.drawLine({ start:{x:44,y:y+6}, end:{x:376,y:y+6}, thickness:1, color:rgb(0.88,0.88,0.85) })
    page.drawText('TOTAL', { x:44, y:y-10, size:10, font:bold, color:ink })
    page.drawText(money(receipt.total), { x:300, y:y-10, size:10, font:bold, color:teal })
    page.drawRectangle({ x:44, y:88, width:216, height:112, color:rgb(0.94,0.99,0.98) })
    ;[
      ['Wallet deduction', money(receipt.total)],
      ['Remaining balance', money(receipt.remaining_balance)],
      ['Order status', String(receipt.status).toUpperCase()],
      ['Processed by', profile?.full_name || 'SnackFlow User'],
    ].forEach(([label,value], index) => {
      const lineY = 175 - index * 22
      page.drawText(label, { x:57, y:lineY, size:8, font:regular, color:muted })
      page.drawText(String(value).slice(0,24), { x:145, y:lineY, size:8, font:bold, color:ink })
    })
    page.drawImage(qrImage, { x:282, y:91, width:91, height:91 })
    page.drawText('Scan for bill summary', { x:279, y:76, size:7, font:regular, color:muted })
    page.drawText('Thank you for using SnackFlow.', { x:44, y:48, size:8, font:regular, color:muted })
    const pdfBase64 = bytesToBase64(await pdf.save())

    const rows = (items || []).map(item => `<tr><td style="padding:8px 0;border-bottom:1px solid #eceee9">${esc(item.item_name)}</td><td style="text-align:center;border-bottom:1px solid #eceee9">${Number(item.quantity)}</td><td style="text-align:right;border-bottom:1px solid #eceee9">${money(Number(item.quantity)*Number(item.unit_price))}</td></tr>`).join('')
    const html = `<div style="font-family:Arial,sans-serif;background:#f2f5f2;padding:24px;color:#172033"><div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#147e74;color:#fff;padding:24px"><h1 style="margin:0">SnackFlow</h1><p>Digital Bill Copy - ${esc(receipt.invoice_no)}</p></div><div style="padding:24px"><h2>${esc(receipt.full_name)}</h2><p>Employee ID: ${esc(receipt.employee_id)}<br>Date: ${esc(orderDate)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><h2 style="text-align:right;color:#147e74">Total: ${money(receipt.total)}</h2><div style="background:#eef9f6;padding:16px;border-radius:12px">Wallet deduction: <b>${money(receipt.total)}</b><br>Remaining balance: <b>${money(receipt.remaining_balance)}</b><br>Status: <b>${esc(String(receipt.status).toUpperCase())}</b></div><p style="color:#68707d;font-size:13px">Your professional PDF bill with a QR summary is attached.</p></div></div></div>`

    const response = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:`Bearer ${resendKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        from:sender, to:[recipient],
        subject:`SnackFlow Bill ${receipt.invoice_no} - ${money(receipt.total)}`,
        html,
        attachments:[{ filename:`${receipt.invoice_no}.pdf`, content:pdfBase64 }],
      }),
    })
    const provider = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(provider?.message || `Email provider returned ${response.status}`)

    const sentAt = new Date().toISOString()
    await admin.from('orders').update({ email_status:'sent', email_sent_at:sentAt, email_error:null }).eq('id', orderId)
    if (deliveryId) await admin.from('order_email_deliveries').update({ status:'sent', sent_at:sentAt, provider_message_id:provider?.id || null }).eq('id', deliveryId)
    return new Response(JSON.stringify({ status:'sent', email:recipient }), { headers:cors })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt email failed'
    if (admin && orderId) {
      await admin.from('orders').update({ email_status:'failed', email_error:message }).eq('id', orderId)
      if (deliveryId) await admin.from('order_email_deliveries').update({ status:'failed', error_message:message }).eq('id', deliveryId)
    }
    return new Response(JSON.stringify({ error:message }), { status:400, headers:cors })
  }
})
