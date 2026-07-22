-- Personal Expense Manager
-- Each user's records are isolated with owner_id + RLS.

begin;

create table if not exists public.pf_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('cash','bank','mobile_wallet','credit','investment','other')),
  opening_balance numeric(14,2) not null default 0,
  low_balance_threshold numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.pf_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  name text not null,
  parent_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id, kind, name)
);

create table if not exists public.pf_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_date date not null default current_date,
  kind text not null check (kind in ('income','expense','transfer_in','transfer_out')),
  account_id uuid not null references public.pf_accounts(id) on delete restrict,
  category_id uuid references public.pf_categories(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  payment_method text,
  priority text check (priority is null or priority in ('essential','important','optional')),
  tags text[] not null default '{}',
  transfer_group uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.pf_budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month_start date not null,
  category_id uuid references public.pf_categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(owner_id, month_start, category_id)
);

create table if not exists public.pf_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date,
  status text not null default 'active' check (status in ('active','completed','paused')),
  created_at timestamptz not null default now()
);

create table if not exists public.pf_recurring (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid references public.pf_accounts(id) on delete set null,
  category_id uuid references public.pf_categories(id) on delete set null,
  frequency text not null default 'monthly' check (frequency in ('weekly','monthly','yearly')),
  next_due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pf_accounts enable row level security;
alter table public.pf_categories enable row level security;
alter table public.pf_transactions enable row level security;
alter table public.pf_budgets enable row level security;
alter table public.pf_goals enable row level security;
alter table public.pf_recurring enable row level security;

create policy pf_accounts_owner on public.pf_accounts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pf_categories_owner on public.pf_categories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pf_transactions_owner on public.pf_transactions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pf_budgets_owner on public.pf_budgets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pf_goals_owner on public.pf_goals for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pf_recurring_owner on public.pf_recurring for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace view public.pf_account_balances
with (security_invoker = true)
as
select
  a.id,
  a.owner_id,
  a.name,
  a.account_type,
  a.low_balance_threshold,
  a.active,
  (
    a.opening_balance + coalesce(sum(
      case
        when t.kind in ('income','transfer_in') then t.amount
        when t.kind in ('expense','transfer_out') then -t.amount
        else 0
      end
    ),0)
  )::numeric(14,2) as balance
from public.pf_accounts a
left join public.pf_transactions t on t.account_id = a.id
where a.owner_id = auth.uid()
group by a.id;

grant select on public.pf_account_balances to authenticated;
revoke all on public.pf_account_balances from anon;

create or replace function public.pf_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_date date,
  p_note text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_balance numeric(14,2);
begin
  if p_from_account = p_to_account then raise exception 'Choose two different accounts'; end if;
  if p_amount <= 0 then raise exception 'Transfer amount must be positive'; end if;

  if not exists(select 1 from public.pf_accounts where id=p_from_account and owner_id=auth.uid())
     or not exists(select 1 from public.pf_accounts where id=p_to_account and owner_id=auth.uid()) then
    raise exception 'Account not found';
  end if;

  select balance into v_balance from public.pf_account_balances where id=p_from_account;
  if coalesce(v_balance,0) < p_amount then raise exception 'Insufficient account balance'; end if;

  insert into public.pf_transactions(owner_id,transaction_date,kind,account_id,amount,description,transfer_group)
  values
    (auth.uid(),coalesce(p_date,current_date),'transfer_out',p_from_account,p_amount,p_note,v_group),
    (auth.uid(),coalesce(p_date,current_date),'transfer_in',p_to_account,p_amount,p_note,v_group);

  return v_group;
end;
$$;

grant execute on function public.pf_transfer(uuid,uuid,numeric,date,text) to authenticated;

-- Seed common categories once for every existing active profile.
insert into public.pf_categories(owner_id,kind,name,parent_name)
select p.id, v.kind, v.name, v.parent_name
from public.profiles p
cross join (values
  ('income','Salary',null),('income','Bonus',null),('income','Freelancing',null),('income','Business Income',null),('income','Other Income',null),
  ('expense','House Rent','Housing'),('expense','Grocery','Food'),('expense','Restaurant','Food'),('expense','Office Snacks','Food'),
  ('expense','Transport','Transport'),('expense','Electricity','Utilities'),('expense','Internet','Utilities'),('expense','Mobile Recharge','Utilities'),
  ('expense','Family','Family'),('expense','Education','Education'),('expense','AI & Technology','Technology'),('expense','Loan / EMI','Loan & EMI'),
  ('expense','Savings','Savings'),('expense','Investment','Investment'),('expense','Shopping','Shopping'),('expense','Medical','Medical'),
  ('expense','Donation','Religious'),('expense','Entertainment','Entertainment'),('expense','Office','Office'),('expense','Bank Charge','Bank Charges'),
  ('expense','Miscellaneous','Others')
) as v(kind,name,parent_name)
on conflict (owner_id,kind,name) do nothing;

commit;
