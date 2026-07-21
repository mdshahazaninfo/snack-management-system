# SnackFlow Micro ERP

Production-oriented member advance wallet and snack/canteen management system. The frontend is a React PWA deployed by GitHub Actions to GitHub Pages; authentication, database security, transactions and audit history run on Supabase.

## Included modules

- Dashboard and daily analytics
- Member management and Excel import
- Advance wallet deposits and signed adjustments
- Menu, SKU/barcode search, unit cost and immutable price history
- Atomic orders, receipts, QR links, print/PDF and void with automatic refund
- Expense ledger, date-range reports and CSV export
- Admin/Manager/Cashier/Viewer roles, user approval, month closing and audit log
- JSON backup, low-balance in-app/browser alerts and optional Resend email function
- Responsive installable PWA and GitHub Actions deployment

## Setup

1. Create a Supabase project and run [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) in SQL Editor.
2. Copy `.env.example` to `.env.local` and add the Project URL and publishable/anon key.
3. Run `npm install && npm run dev` locally.
4. In GitHub Actions secrets add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Set GitHub Pages source to **GitHub Actions** and run the included workflow.

Never expose a service-role key in the browser or repository. See [`docs/PLAN_REVIEW.md`](docs/PLAN_REVIEW.md).
