# Plan Review and Corrections

The original concept is workable, but a static GitHub Pages application cannot safely provide authentication, database transactions or accounting controls by itself. This implementation uses GitHub Pages only for the React frontend and Supabase for Auth, Postgres, Row Level Security and atomic database functions.

## Corrections applied

1. Member deposits are wallet liabilities, not income. Sales revenue is posted only when an order is completed.
2. Each order item stores the item name, selling price and estimated unit cost as immutable snapshots.
3. Order creation, balance validation, wallet deduction and low-balance notification run in one database transaction.
4. Posted orders are never deleted. Voiding retains history and posts an automatic wallet refund.
5. Closed months reject backdated financial writes.
6. Admin, Manager, Cashier and Viewer permissions are enforced in both the UI and database RLS.
7. Real secrets, service-role keys, passwords and member data are excluded from Git.
8. Offline financial posting is deliberately disabled; only the PWA shell is cached.

## Production checklist

- Run `supabase/migrations/001_initial.sql` in a new Supabase project.
- Add only the project URL and publishable/anon key to GitHub Actions secrets.
- Enable GitHub Pages with GitHub Actions as the source.
- Create the first Admin account, then approve later users before signup.
- Reconcile cash, wallet liabilities, sales, expenses and refunds before closing a month.
