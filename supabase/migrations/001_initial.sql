create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','manager','cashier','viewer');
create type public.user_status as enum ('active','pending','disabled');
create type public.member_status as enum ('active','inactive');
create type public.order_status as enum ('posted','void');
create type public.wallet_tx_type as enum ('deposit','adjustment','order','refund');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.user_role not null default 'viewer',
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.user_invites (
  email text primary key,
  full_name text,
  role public.user_role not null default 'viewer',
  status text not null default 'approved',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  full_name text not null,
  department text,
  mobile text,
  status public.member_status not null default 'active',
  low_balance_threshold numeric(12,2) not null default 200,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  sku text not null unique,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_price_history (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id),
  selling_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create sequence public.invoice_seq;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  member_id uuid not null references public.members(id),
  total numeric(12,2) not null,
  estimated_cost numeric(12,2) not null default 0,
  status public.order_status not null default 'posted',
  idempotency_key uuid not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references auth.users(id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  menu_item_id uuid references public.menu_items(id),
  item_name text not null,
  sku text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  type public.wallet_tx_type not null,
  amount numeric(12,2) not null check (amount <> 0),
  order_id uuid references public.orders(id),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'posted',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.month_closings (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  closed_by uuid not null references auth.users(id),
  closed_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id),
  title text not null,
  body text not null,
  email text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace view public.member_balances as
select m.*, coalesce(sum(w.amount),0)::numeric(12,2) as balance
from public.members m left join public.wallet_transactions w on w.member_id=m.id
group by m.id;

create or replace view public.order_report as
select o.invoice_no,o.created_at,o.created_at::date as order_date,m.full_name as member,o.total,o.estimated_cost,(o.total-o.estimated_cost)::numeric(12,2) as margin,o.status
from public.orders o join public.members m on m.id=o.member_id;

create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() and status='active' $$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;

create or replace function public.role_in(roles public.user_role[]) returns boolean
language sql stable security definer set search_path=public as $$ select coalesce(public.current_role()=any(roles),false) $$;

create or replace function public.is_closed(d date) returns boolean
language sql stable security definer set search_path=public as $$ select exists(select 1 from public.month_closings where month_start=date_trunc('month',d)::date) $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_invite public.user_invites%rowtype; v_count int;
begin
  select count(*) into v_count from public.profiles;
  select * into v_invite from public.user_invites where lower(email)=lower(new.email) and status='approved';
  if v_count=0 then
    insert into public.profiles(id,email,full_name,role,status) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','Admin'),'admin','active');
  elsif found then
    insert into public.profiles(id,email,full_name,role,status) values(new.id,new.email,coalesce(v_invite.full_name,new.raw_user_meta_data->>'full_name'),v_invite.role,'active');
  else
    insert into public.profiles(id,email,full_name,role,status) values(new.id,new.email,new.raw_user_meta_data->>'full_name','viewer','pending');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.track_menu_price() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.selling_price<>old.selling_price or new.unit_cost<>old.unit_cost then
    insert into public.menu_price_history(menu_item_id,selling_price,unit_cost,changed_by) values(new.id,new.selling_price,new.unit_cost,auth.uid());
  end if;
  new.updated_at=now(); return new;
end $$;
create trigger menu_price_history_trigger before insert or update on public.menu_items for each row execute function public.track_menu_price();

create or replace function public.deposit_wallet(p_member_id uuid,p_amount numeric,p_note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.role_in(array['admin','manager','cashier']::public.user_role[]) then raise exception 'Permission denied'; end if;
  if p_amount<=0 then raise exception 'Deposit must be positive'; end if;
  if public.is_closed(current_date) then raise exception 'This accounting month is closed'; end if;
  insert into public.wallet_transactions(member_id,type,amount,note,created_by) values(p_member_id,'deposit',p_amount,p_note,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.adjust_wallet(p_member_id uuid,p_amount numeric,p_note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.role_in(array['admin','manager']::public.user_role[]) then raise exception 'Permission denied'; end if;
  if p_amount=0 then raise exception 'Adjustment cannot be zero'; end if;
  if public.is_closed(current_date) then raise exception 'This accounting month is closed'; end if;
  insert into public.wallet_transactions(member_id,type,amount,note,created_by) values(p_member_id,'adjustment',p_amount,p_note,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_order(p_member_id uuid,p_items jsonb,p_idempotency_key uuid)
returns table(id uuid,invoice_no text,total numeric,status public.order_status,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_order uuid; v_total numeric(12,2); v_cost numeric(12,2); v_balance numeric(12,2); v_threshold numeric(12,2); v_invoice text;
begin
  if not public.role_in(array['admin','manager','cashier']::public.user_role[]) then raise exception 'Permission denied'; end if;
  if public.is_closed(current_date) then raise exception 'This accounting month is closed'; end if;
  select o.id,o.invoice_no,o.total,o.status,o.created_at into id,invoice_no,total,status,created_at from public.orders o where o.idempotency_key=p_idempotency_key;
  if found then return next; return; end if;
  perform 1 from public.members where members.id=p_member_id and members.status='active' for update;
  if not found then raise exception 'Member is not active'; end if;
  with requested as (select (x->>'menu_item_id')::uuid item_id,(x->>'quantity')::numeric qty from jsonb_array_elements(p_items) x)
  select round(sum(r.qty*m.selling_price),2),round(sum(r.qty*m.unit_cost),2) into v_total,v_cost from requested r join public.menu_items m on m.id=r.item_id and m.active where r.qty>0;
  if v_total is null then raise exception 'No valid active items'; end if;
  select balance,low_balance_threshold into v_balance,v_threshold from public.member_balances where member_balances.id=p_member_id;
  if coalesce(v_balance,0)<v_total then raise exception 'Insufficient wallet balance'; end if;
  v_invoice:='SF-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||lpad(nextval('public.invoice_seq')::text,6,'0');
  insert into public.orders(invoice_no,member_id,total,estimated_cost,idempotency_key,created_by) values(v_invoice,p_member_id,v_total,v_cost,p_idempotency_key,auth.uid()) returning orders.id into v_order;
  insert into public.order_items(order_id,menu_item_id,item_name,sku,quantity,unit_price,unit_cost)
  select v_order,m.id,m.name,m.sku,(x->>'quantity')::numeric,m.selling_price,m.unit_cost from jsonb_array_elements(p_items) x join public.menu_items m on m.id=(x->>'menu_item_id')::uuid and m.active where (x->>'quantity')::numeric>0;
  insert into public.wallet_transactions(member_id,type,amount,order_id,note,created_by) values(p_member_id,'order',-v_total,v_order,'Order '||v_invoice,auth.uid());
  if v_balance-v_total<=v_threshold then insert into public.notifications(member_id,title,body) values(p_member_id,'Low wallet balance',format('%s balance is now %s',v_invoice,v_balance-v_total)); end if;
  return query select o.id,o.invoice_no,o.total,o.status,o.created_at from public.orders o where o.id=v_order;
end $$;

create or replace function public.void_order(p_order_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype;
begin
  if not public.role_in(array['admin','manager']::public.user_role[]) then raise exception 'Permission denied'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status='void' then raise exception 'Order not found or already void'; end if;
  if public.is_closed(o.created_at::date) then raise exception 'This accounting month is closed'; end if;
  update public.orders set status='void',void_reason=p_reason,voided_at=now(),voided_by=auth.uid() where id=p_order_id;
  insert into public.wallet_transactions(member_id,type,amount,order_id,note,created_by) values(o.member_id,'refund',o.total,o.id,'Refund for '||o.invoice_no,auth.uid());
end $$;

create or replace function public.close_month(p_month date) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_month date:=date_trunc('month',p_month)::date;
begin
  if not public.role_in(array['admin','manager']::public.user_role[]) then raise exception 'Permission denied'; end if;
  if v_month>=date_trunc('month',current_date)::date then raise exception 'Only completed months may be closed'; end if;
  insert into public.month_closings(month_start,closed_by) values(v_month,auth.uid()) returning id into v_id; return v_id;
end $$;

alter table public.profiles enable row level security;
alter table public.user_invites enable row level security;
alter table public.members enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_price_history enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.expenses enable row level security;
alter table public.month_closings enable row level security;
alter table public.notifications enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles for select using(id=auth.uid() or public.is_active_user());
create policy profiles_admin_update on public.profiles for update using(public.current_role()='admin') with check(public.current_role()='admin');
create policy invites_admin on public.user_invites for all using(public.current_role()='admin') with check(public.current_role()='admin');
create policy members_read on public.members for select using(public.is_active_user());
create policy members_write on public.members for all using(public.role_in(array['admin','manager']::public.user_role[])) with check(public.role_in(array['admin','manager']::public.user_role[]));
create policy menu_read on public.menu_items for select using(public.is_active_user());
create policy menu_write on public.menu_items for all using(public.role_in(array['admin','manager']::public.user_role[])) with check(public.role_in(array['admin','manager']::public.user_role[]));
create policy history_read on public.menu_price_history for select using(public.is_active_user());
create policy orders_read on public.orders for select using(public.is_active_user());
create policy order_items_read on public.order_items for select using(public.is_active_user());
create policy wallet_read on public.wallet_transactions for select using(public.is_active_user());
create policy expense_read on public.expenses for select using(public.is_active_user());
create policy expense_write on public.expenses for all using(public.role_in(array['admin','manager']::public.user_role[])) with check(public.role_in(array['admin','manager']::public.user_role[]));
create policy closing_read on public.month_closings for select using(public.is_active_user());
create policy notification_read on public.notifications for select using(public.is_active_user());
create policy notification_update on public.notifications for update using(public.is_active_user()) with check(public.is_active_user());
create policy settings_read on public.app_settings for select using(public.is_active_user());
create policy settings_admin on public.app_settings for all using(public.current_role()='admin') with check(public.current_role()='admin');
create policy audit_read on public.audit_logs for select using(public.role_in(array['admin','manager']::public.user_role[]));

grant select on public.member_balances,public.order_report to authenticated;
grant execute on function public.deposit_wallet(uuid,numeric,text) to authenticated;
grant execute on function public.adjust_wallet(uuid,numeric,text) to authenticated;
grant execute on function public.create_order(uuid,jsonb,uuid) to authenticated;
grant execute on function public.void_order(uuid,text) to authenticated;
grant execute on function public.close_month(date) to authenticated;
