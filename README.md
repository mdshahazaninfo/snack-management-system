# SnackFlow Micro ERP

Production-oriented member advance wallet and snack/canteen management system. The frontend is a React PWA deployed by GitHub Actions to GitHub Pages; authentication, database security, transactions and audit history run on Supabase.

## What is included

- Dashboard: daily sales, unique consumers, deposits, expenses, wallet liability, negative balances, estimated margin and trend charts.
- Members: employee ID, department, mobile, status, individual low-balance threshold, QR code and `.xlsx` import.
- Advance wallet: deposits, signed manager adjustments, live balances, member filter and CSV export.
- Menu: category, SKU/barcode, selling price, estimated cost, active status and immutable price history.
- Orders: cart, database-verified prices, atomic wallet deduction, invoice number, receipt, print/PDF, share, QR deep link, void and refund.
- Expenses: separate operating-expense ledger with void status.
- Reports: flexible date range, item performance, orders, CSV export and print/PDF.
- Administration: Admin/Manager/Cashier/Viewer roles, pre-approved email onboarding, month closing, JSON backup and audit log.
- PWA: installable, responsive, dark mode, cached app shell, in-app alerts and browser notifications while the app is active.
- Optional email alert Edge Function using Resend.

## Important accounting rules

Member deposits are **cash receipts and wallet liabilities—not sales revenue**. Revenue is recognized when an order is posted. Historical orders save the item name, selling price and estimated cost at the time of sale, so later menu-price changes never rewrite an old invoice.

Orders, wallet deductions and low-balance checks run in one PostgreSQL transaction. A duplicate click or concurrent cashier cannot partially save an order. Voiding an order retains the original record and posts a linked wallet refund.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Web app | React 19 + TypeScript + Vite | Responsive UI and PWA |
| Hosting | GitHub Pages + GitHub Actions | Static frontend deployment |
| Backend | Supabase Postgres | Persistent data and reports |
| Authentication | Supabase Auth | Email/password accounts |
| Authorization | PostgreSQL Row Level Security | Role and active-account enforcement |
| Critical writes | Security-definer database RPCs | Atomic orders, deposits, adjustments, closing |
| Optional email | Supabase Edge Function + Resend | Low-balance email |

GitHub Pages publishes static files and uses an Actions workflow for custom builds. It does not run the database or server-side business logic; Supabase provides those services.

## 1. Create the Supabase backend

1. Create a new project at [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor → New query**.
3. Paste and run [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) once.
4. Open **Project Settings / Connect** and copy:
   - Project URL
   - Publishable key (the legacy `anon` key also works)
5. Do **not** put the service-role key in this frontend or GitHub.

The first person who creates an app account becomes the active Admin. Later users must first be approved under **Settings → Users & roles**, then create an account using the same email address. Unapproved accounts remain Pending and cannot read company data.

If Supabase email confirmation is enabled, confirm the first account from its email before signing in.

## 2. Run locally

```bash
cp .env.example .env.local
# Put the Project URL and publishable key into .env.local
npm install
npm run dev
```

Production verification:

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

## 3. Deploy to GitHub Pages

1. Create an empty **public** GitHub repository named `snack-management-system`.
2. Push this project to its `main` branch.
3. In **Settings → Secrets and variables → Actions**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
5. Open **Actions → Deploy to GitHub Pages → Run workflow**.

The included [deployment workflow](.github/workflows/deploy-pages.yml) builds, uploads and deploys `dist/` automatically on each push to `main`.

In Supabase **Authentication → URL Configuration**, add the final GitHub Pages URL to the allowed redirect URLs.

## 4. Optional low-balance email

Browser and in-app notifications work without an email provider. To send email as well:

1. Create and verify a sender domain in [Resend](https://resend.com/).
2. Install the Supabase CLI and link this project.
3. Set function secrets:

```bash
supabase secrets set RESEND_API_KEY=... ALERT_FROM_EMAIL=alerts@your-domain.com WEBHOOK_SECRET=use-a-long-random-value
supabase functions deploy send-low-balance-email --no-verify-jwt
```

4. In Supabase **Database → Webhooks**, create an `INSERT` webhook for `public.notifications` pointing to the deployed function URL. Add request header `x-webhook-secret` with the same `WEBHOOK_SECRET`.
5. In SnackFlow **Settings → Notifications**, enter the recipient email and enable email alerts.

## Role matrix

| Capability | Admin | Manager | Cashier | Viewer |
|---|:---:|:---:|:---:|:---:|
| Read operational data/reports | Yes | Yes | Yes | Yes |
| Create orders and deposits | Yes | Yes | Yes | No |
| Members, menu and expenses | Yes | Yes | No | No |
| Wallet adjustment and month closing | Yes | Yes | No | No |
| Users, global settings and full backup | Yes | No | No | No |

Frontend controls are only a usability layer. The database repeats these permission checks with RLS and protected functions.

## Backup and restore

**Settings → General → Backup JSON** exports operational data without passwords, access tokens or Auth credentials. Keep backups private.

Production restoration should be performed by a database administrator into a new/staging Supabase project, followed by referential-integrity checks. Browser-based “one-click restore” is intentionally not enabled because a partial or malicious restore could permanently corrupt financial history.

## Current boundaries

- The PWA app shell can open offline, but new financial transactions require an internet connection. Offline order syncing is deliberately disabled to prevent duplicate or conflicting wallet deductions.
- SKU/barcode search works with keyboard-wedge/USB scanners. Dedicated camera barcode scanning is not bundled.
- WhatsApp alerts, inventory/purchase stock, Payroll and Attendance are extension modules—not part of this accounting-safe core release.
- “Estimated margin” is an internal operating estimate, not a statutory profit-and-loss statement.

See [`docs/PLAN_REVIEW.md`](docs/PLAN_REVIEW.md) for the corrections made to the original plan.

## Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY`.
- Keep RLS enabled on every public table.
- Do not edit wallet transactions or posted orders directly.
- Close only a completed month after reconciliation.
- Keep the repository free of real member data and `.env` files.

Official references: [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Supabase React Auth](https://supabase.com/docs/guides/auth/quickstarts/react), [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
