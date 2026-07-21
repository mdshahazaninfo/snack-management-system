-- Final role and low-balance configuration.
-- Database role `cashier` is presented in the UI as `User`.
-- User permissions: create orders, deposit wallet funds, and read/export expenses/reports.

begin;

-- Use one global low-balance limit of BDT 150 for all members.
alter table public.members
  alter column low_balance_threshold set default 150;

update public.members
set low_balance_threshold = 150
where low_balance_threshold is distinct from 150;

-- Store the recipient email used by the optional low-balance email webhook.
insert into public.app_settings(key, value)
values ('low_balance_email', '{"email":""}'::jsonb)
on conflict (key) do nothing;

-- Populate the recipient email whenever the order function creates a notification.
create or replace function public.set_low_balance_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.email is null or btrim(new.email) = '' then
    select nullif(btrim(value->>'email'), '')
      into v_email
      from public.app_settings
     where key = 'low_balance_email';

    new.email := v_email;
  end if;

  return new;
end;
$$;

drop trigger if exists low_balance_notification_email_trigger on public.notifications;
create trigger low_balance_notification_email_trigger
before insert on public.notifications
for each row
execute function public.set_low_balance_notification_email();

-- Keep exact permissions required for Admin and User.
-- Admin retains all existing management policies.
-- `cashier` (shown as User) can post deposits and orders through protected RPCs.
-- Active users can read expenses, orders, wallet balances and reports.

-- Remove legacy manager access from sensitive financial RPCs by redefining role checks.
create or replace function public.deposit_wallet(p_member_id uuid,p_amount numeric,p_note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.role_in(array['admin','cashier']::public.user_role[]) then raise exception 'Permission denied'; end if;
  if p_amount<=0 then raise exception 'Deposit must be positive'; end if;
  if public.is_closed(current_date) then raise exception 'This accounting month is closed'; end if;
  insert into public.wallet_transactions(member_id,type,amount,note,created_by)
  values(p_member_id,'deposit',p_amount,p_note,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.adjust_wallet(p_member_id uuid,p_amount numeric,p_note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if public.current_role()<>'admin' then raise exception 'Permission denied'; end if;
  if p_amount=0 then raise exception 'Adjustment cannot be zero'; end if;
  if public.is_closed(current_date) then raise exception 'This accounting month is closed'; end if;
  insert into public.wallet_transactions(member_id,type,amount,note,created_by)
  values(p_member_id,'adjustment',p_amount,p_note,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.void_order(p_order_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype;
begin
  if public.current_role()<>'admin' then raise exception 'Permission denied'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status='void' then raise exception 'Order not found or already void'; end if;
  if public.is_closed(o.created_at::date) then raise exception 'This accounting month is closed'; end if;
  update public.orders set status='void',void_reason=p_reason,voided_at=now(),voided_by=auth.uid() where id=p_order_id;
  insert into public.wallet_transactions(member_id,type,amount,order_id,note,created_by)
  values(o.member_id,'refund',o.total,o.id,'Refund for '||o.invoice_no,auth.uid());
end $$;

create or replace function public.close_month(p_month date) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_month date:=date_trunc('month',p_month)::date;
begin
  if public.current_role()<>'admin' then raise exception 'Permission denied'; end if;
  if v_month>=date_trunc('month',current_date)::date then raise exception 'Only completed months may be closed'; end if;
  insert into public.month_closings(month_start,closed_by)
  values(v_month,auth.uid()) returning id into v_id;
  return v_id;
end $$;

commit;
