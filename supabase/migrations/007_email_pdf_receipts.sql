-- Digital Receipt & Email Billing

alter table public.members
  add column if not exists email text,
  add column if not exists email_receipt_enabled boolean not null default true;

alter table public.orders
  add column if not exists receipt_email text,
  add column if not exists email_status text not null default 'not_requested'
    check (email_status in ('not_requested','pending','sent','failed','skipped')),
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;

create table if not exists public.order_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  attempt_no integer not null default 1,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.order_email_deliveries enable row level security;

drop policy if exists order_email_deliveries_read on public.order_email_deliveries;
create policy order_email_deliveries_read
on public.order_email_deliveries for select
using (public.is_active_user());

revoke all on public.order_email_deliveries from anon;
grant select on public.order_email_deliveries to authenticated;

create index if not exists order_email_deliveries_order_idx
  on public.order_email_deliveries(order_id, created_at desc);

-- Preserve all existing member_balances columns and append receipt fields.
create or replace view public.member_balances
with (security_invoker = true)
as
select
  m.id,
  m.employee_id,
  m.full_name,
  m.department,
  m.mobile,
  m.status,
  m.low_balance_threshold,
  m.created_at,
  coalesce(sum(w.amount),0)::numeric(12,2) as balance,
  m.email,
  m.email_receipt_enabled
from public.members m
left join public.wallet_transactions w on w.member_id = m.id
group by m.id;

grant select on public.member_balances to authenticated;

-- Helper view for receipt email generation.
create or replace view public.order_receipt_data
with (security_invoker = true)
as
select
  o.id,
  o.invoice_no,
  o.total,
  o.status,
  o.created_at,
  o.created_by,
  o.receipt_email,
  o.email_status,
  m.employee_id,
  m.full_name,
  m.email as member_email,
  m.email_receipt_enabled,
  coalesce((
    select sum(w.amount)
    from public.wallet_transactions w
    where w.member_id = o.member_id
      and w.created_at <= o.created_at
  ), 0)::numeric(12,2) as remaining_balance
from public.orders o
join public.members m on m.id = o.member_id;

grant select on public.order_receipt_data to authenticated;
