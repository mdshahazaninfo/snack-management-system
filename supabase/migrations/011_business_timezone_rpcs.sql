-- Apply the Bangladesh business date consistently to wallet/order controls.

begin;

create or replace function public.deposit_wallet(p_member_id uuid,p_amount numeric,p_note text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if not public.role_in(array['admin','cashier']::public.user_role[]) then raise exception 'Permission denied'; end if;
  if p_amount<=0 then raise exception 'Deposit must be positive'; end if;
  if public.is_closed(public.business_date()) then raise exception 'This accounting month is closed'; end if;
  if not exists(select 1 from public.members where id=p_member_id and status='active') then raise exception 'Member is not active'; end if;
  insert into public.wallet_transactions(member_id,type,amount,note,created_by)
  values(p_member_id,'deposit',p_amount,p_note,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.adjust_wallet(p_member_id uuid,p_amount numeric,p_note text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if public.current_role()<>'admin' then raise exception 'Permission denied'; end if;
  if p_amount=0 then raise exception 'Adjustment cannot be zero'; end if;
  if public.is_closed(public.business_date()) then raise exception 'This accounting month is closed'; end if;
  if not exists(select 1 from public.members where id=p_member_id) then raise exception 'Member not found'; end if;
  insert into public.wallet_transactions(member_id,type,amount,note,created_by)
  values(p_member_id,'adjustment',p_amount,p_note,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.void_order(p_order_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare o public.orders%rowtype;
begin
  if public.current_role()<>'admin' then raise exception 'Permission denied'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status='void' then raise exception 'Order not found or already void'; end if;
  if public.is_closed((o.created_at at time zone 'Asia/Dhaka')::date) then raise exception 'This accounting month is closed'; end if;
  update public.orders
     set status='void',void_reason=nullif(btrim(p_reason),''),voided_at=now(),voided_by=auth.uid()
   where id=p_order_id;
  insert into public.wallet_transactions(member_id,type,amount,order_id,note,created_by)
  values(o.member_id,'refund',o.total,o.id,'Refund for '||o.invoice_no,auth.uid());
end;
$$;

create or replace function public.close_month(p_month date)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_month date:=date_trunc('month',p_month)::date;
begin
  if public.current_role()<>'admin' then raise exception 'Permission denied'; end if;
  if v_month>=date_trunc('month',public.business_date())::date then raise exception 'Only completed months may be closed'; end if;
  insert into public.month_closings(month_start,closed_by)
  values(v_month,auth.uid()) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'This month is already closed';
end;
$$;

grant execute on function public.deposit_wallet(uuid,numeric,text) to authenticated;
grant execute on function public.adjust_wallet(uuid,numeric,text) to authenticated;
grant execute on function public.void_order(uuid,text) to authenticated;
grant execute on function public.close_month(date) to authenticated;

commit;
