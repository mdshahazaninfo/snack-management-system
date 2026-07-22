-- Full project audit fixes: accounting consistency, privacy, business dates,
-- duplicate-safe order snapshots, expense closing and concurrent PF transfers.

begin;

-- Bangladesh is the business timezone even though the database stores UTC.
create or replace function public.business_date()
returns date
language sql
stable
set search_path = public
as $$
  select (clock_timestamp() at time zone 'Asia/Dhaka')::date
$$;

-- Active users may read only their own profile; Admin may read all users.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read
on public.profiles for select
using (id = auth.uid() or public.current_role() = 'admin');

-- Keep an immutable post-order balance snapshot for bills and QR summaries.
alter table public.orders
  add column if not exists balance_after numeric(12,2);

-- Rebuild order creation so every submitted item is validated, business dates
-- are used, low balance means strictly below the threshold, and balance_after
-- is stored atomically with the order.
drop function if exists public.create_order(uuid,jsonb,uuid);
create function public.create_order(
  p_member_id uuid,
  p_items jsonb,
  p_idempotency_key uuid
) returns table(
  id uuid,
  invoice_no text,
  total numeric,
  status public.order_status,
  created_at timestamptz,
  balance_after numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_total numeric(12,2);
  v_cost numeric(12,2);
  v_balance numeric(12,2);
  v_after numeric(12,2);
  v_threshold numeric(12,2);
  v_invoice text;
  v_requested_count integer;
  v_valid_count integer;
begin
  if not public.role_in(array['admin','cashier']::public.user_role[]) then
    raise exception 'Permission denied';
  end if;

  if public.is_closed(public.business_date()) then
    raise exception 'This accounting month is closed';
  end if;

  select o.id,o.invoice_no,o.total,o.status,o.created_at,o.balance_after
    into id,invoice_no,total,status,created_at,balance_after
  from public.orders o
  where o.idempotency_key = p_idempotency_key;
  if found then return next; return; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one order item';
  end if;

  perform 1 from public.members
   where members.id = p_member_id and members.status = 'active'
   for update;
  if not found then raise exception 'Member is not active'; end if;

  v_requested_count := jsonb_array_length(p_items);

  with requested as (
    select (x->>'menu_item_id')::uuid item_id,
           (x->>'quantity')::numeric qty
    from jsonb_array_elements(p_items) x
  ), valid as (
    select r.item_id,r.qty,m.selling_price,m.unit_cost
    from requested r
    join public.menu_items m on m.id = r.item_id and m.active
    where r.qty > 0
  )
  select count(*),round(sum(qty*selling_price),2),round(sum(qty*unit_cost),2)
    into v_valid_count,v_total,v_cost
  from valid;

  if v_valid_count <> v_requested_count or v_total is null then
    raise exception 'One or more order items are invalid, inactive or have an invalid quantity';
  end if;

  select mb.balance,mb.low_balance_threshold
    into v_balance,v_threshold
  from public.member_balances mb
  where mb.id = p_member_id;

  if coalesce(v_balance,0) < v_total then
    raise exception 'Insufficient wallet balance';
  end if;

  v_after := round(v_balance-v_total,2);
  v_invoice := 'SF-' || to_char(clock_timestamp() at time zone 'Asia/Dhaka','YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text,6,'0');

  insert into public.orders(invoice_no,member_id,total,estimated_cost,idempotency_key,created_by,balance_after)
  values(v_invoice,p_member_id,v_total,v_cost,p_idempotency_key,auth.uid(),v_after)
  returning orders.id into v_order;

  insert into public.order_items(order_id,menu_item_id,item_name,sku,quantity,unit_price,unit_cost)
  select v_order,m.id,m.name,m.sku,(x->>'quantity')::numeric,m.selling_price,m.unit_cost
  from jsonb_array_elements(p_items) x
  join public.menu_items m on m.id=(x->>'menu_item_id')::uuid and m.active
  where (x->>'quantity')::numeric > 0;

  insert into public.wallet_transactions(member_id,type,amount,order_id,note,created_by)
  values(p_member_id,'order',-v_total,v_order,'Order '||v_invoice,auth.uid());

  if v_after < coalesce(v_threshold,150) then
    insert into public.notifications(member_id,title,body)
    values(p_member_id,'Low wallet balance',format('%s balance is now %s',v_invoice,v_after));
  end if;

  return query
  select o.id,o.invoice_no,o.total,o.status,o.created_at,o.balance_after
  from public.orders o where o.id = v_order;
end;
$$;

grant execute on function public.create_order(uuid,jsonb,uuid) to authenticated;
revoke execute on function public.create_order(uuid,jsonb,uuid) from anon;

-- Receipt view uses the immutable snapshot. For older rows, it reconstructs
-- balance at the order wallet transaction timestamp as a backward fallback.
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
  coalesce(
    o.balance_after,
    (
      select sum(w2.amount)
      from public.wallet_transactions w2
      where w2.member_id = o.member_id
        and w2.created_at <= (
          select max(ow.created_at)
          from public.wallet_transactions ow
          where ow.order_id = o.id and ow.type = 'order'
        )
    ),
    0
  )::numeric(12,2) as remaining_balance
from public.orders o
join public.members m on m.id = o.member_id;

grant select on public.order_receipt_data to authenticated;
revoke all on public.order_receipt_data from anon;

-- Operating expenses must be positive and cannot be posted or moved into a
-- closed month. Direct table inserts now receive the same accounting controls.
alter table public.expenses drop constraint if exists expenses_amount_check;
alter table public.expenses add constraint expenses_amount_check check (amount > 0);

create or replace function public.guard_expense_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then
    raise exception 'Permission denied';
  end if;
  if new.amount <= 0 then raise exception 'Expense must be positive'; end if;
  if public.is_closed(new.expense_date) then raise exception 'This accounting month is closed'; end if;
  if tg_op = 'UPDATE' and public.is_closed(old.expense_date) then
    raise exception 'This accounting month is closed';
  end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists guard_expense_write_trigger on public.expenses;
create trigger guard_expense_write_trigger
before insert or update on public.expenses
for each row execute function public.guard_expense_write();

-- Serialize every transaction touching a PF account. This prevents two
-- simultaneous transfers from both passing the same pre-transfer balance.
create or replace function public.lock_pf_account_transaction()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text,0));
  return new;
end;
$$;

drop trigger if exists lock_pf_account_transaction_trigger on public.pf_transactions;
create trigger lock_pf_account_transaction_trigger
before insert or update of account_id,amount,kind on public.pf_transactions
for each row execute function public.lock_pf_account_transaction();

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

  -- Always acquire locks in deterministic order to avoid deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(least(p_from_account::text,p_to_account::text),0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(p_from_account::text,p_to_account::text),0));

  if not exists(select 1 from public.pf_accounts where id=p_from_account and owner_id=auth.uid() and active)
     or not exists(select 1 from public.pf_accounts where id=p_to_account and owner_id=auth.uid() and active) then
    raise exception 'Account not found';
  end if;

  select balance into v_balance from public.pf_account_balances where id=p_from_account;
  if coalesce(v_balance,0) < p_amount then raise exception 'Insufficient account balance'; end if;

  insert into public.pf_transactions(owner_id,transaction_date,kind,account_id,amount,description,transfer_group)
  values
    (auth.uid(),coalesce(p_date,public.business_date()),'transfer_out',p_from_account,p_amount,p_note,v_group),
    (auth.uid(),coalesce(p_date,public.business_date()),'transfer_in',p_to_account,p_amount,p_note,v_group);

  return v_group;
end;
$$;

grant execute on function public.pf_transfer(uuid,uuid,numeric,date,text) to authenticated;
revoke execute on function public.pf_transfer(uuid,uuid,numeric,date,text) from anon;

commit;
