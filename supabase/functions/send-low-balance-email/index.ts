Deno.serve(async (request) => {
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== Deno.env.get('WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 })
  const payload = await request.json()
  const record = payload.record
  if (!record?.email) return new Response('No recipient', { status: 200 })
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('ALERT_FROM_EMAIL'), to: [record.email], subject: record.title || 'SnackFlow low balance alert', html: `<p>${record.body || 'A member wallet is below its configured threshold.'}</p>` }),
  })
  return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } })
})
