# Digital Receipt & Email Billing Setup

This feature sends a professional HTML bill and a soft one-page PDF receipt after a successful SnackFlow order. The PDF includes a QR code containing the plain-text bill summary.

## 1. Run the database migration

In Supabase SQL Editor, run:

```text
supabase/migrations/007_email_pdf_receipts.sql
```

## 2. Create a Resend account

Create an API key in Resend and verify a sending domain/address. During testing, use an address Resend allows for the selected account.

## 3. Set Supabase Edge Function secrets

Set these secrets in Supabase:

```text
RESEND_API_KEY=re_xxxxxxxxx
RECEIPT_FROM_EMAIL=SnackFlow <billing@your-verified-domain.com>
```

Supabase automatically provides these function variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Never expose the service-role key in GitHub Pages or browser code.

## 4. Deploy the function

Deploy:

```text
supabase/functions/send-order-receipt
```

Using Supabase CLI:

```bash
supabase functions deploy send-order-receipt --project-ref YOUR_PROJECT_REF
```

## 5. Add member email

SnackFlow > Members:

- Add or edit the member email address.
- Keep `Send PDF bill by email` enabled.

## 6. Test

1. Post an order for a member with an enabled email.
2. The order remains successful even if email delivery fails.
3. Recent Orders shows `Sending`, `Sent`, `Failed`, or `Skipped`.
4. Use the `Email` button to resend.
5. Open the PDF and scan the QR. It should show the bill summary text.

## PDF content

- SnackFlow branding
- Order and member information
- Item, quantity, and amount table
- Total and wallet deduction
- Remaining wallet balance
- Order status
- Processed-by name
- QR code with the text bill summary

## Security design

- Resend API key remains inside the Supabase Edge Function.
- Browser users must be signed in and active.
- The service-role key is never exposed to the frontend.
- Email failure does not roll back or delete a confirmed order.
