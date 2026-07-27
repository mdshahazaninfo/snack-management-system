-- Admin full-access controls with accounting-safe deletion rules.
-- Historical records are archived instead of hard-deleted when financial links exist.

begin;

-- Admin can edit a member's master data and status.
create or replace function public.admin_update_member(
  p_id uuid,
  p_employee_id text,
  p_full_name text,
  p_department text,
  p_mobile text,
  p_email text,
  p_email_receipt_enabled boolean,
  p_low_balance_threshold numeric,
  p_status public.member_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then raise exception 'Permission denied'; end if;
  update public.members
     set employee_id = btrim(p_employee_id),
         full_name = btrim(p_full_name),
         department = nullif(btrim(coalesce(p_department,'')),''),
         mobile = nullif(btrim(coalesce(p_mobile,'')),''),
         email = nullif(lower(btrim(coalesce(p_email,''))),''),
         email_receipt_enabled = coalesce(p_email_receipt_enabled,true),
         low_balance_threshold = greatest(coalesce(p_low_balance_threshold,150),0),
         status = p_status
   where id = p_id;
  if not found then raise exception 'Member not found'; end if;
end;
$$;

grant execute on function public.admin_update_member(uuid,text,text,text,text,text,boolean,numeric,public.member_status) to authenticated;
revoke execute on function public.admin_update_member(uuid,text,text,text,text,text,boolean,numeric,public.member_status) from anon;

-- Delete unused members; archive members with accounting history.
create or replace function public.admin_remove_member(p_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_has_history boolean;
begin
  if public.current_role() <> 'admin' then raise exception 'Permission denied'; end if;
  select exists(select 1 from public.orders where member_id=p_id)
      or exists(select 1 from public.wallet_transactions where member_id=p_id)
    into v_has_history;
  if v_has_history then
    update public.members set status='inactive' where id=p_id;
    if not found then raise exception 'Member not found'; end if;
    return 'archived';
  end if;
  delete from public.members where id=p_id;
  if not found then raise exception 'Member not found'; end if;
  return 'deleted';
end;
$$;

grant execute on function public.admin_remove_member(uuid) to authenticated;
revoke execute on function public.admin_remove_member(uuid) from anon;

-- Admin menu maintenance.
create or replace function public.admin_update_menu_item(
  p_id uuid,
  p_name text,
  p_category text,
  p_sku text,
  p_selling_price numeric,
  p_unit_cost numeric,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then raise exception 'Permission denied'; end if;
  if p_selling_price < 0 or p_unit_cost < 0 then raise exception 'Price and cost cannot be negative'; end if;
  update public.menu_items
     set name=btrim(p_name), category=btrim(p_category), sku=btrim(p_sku),
         selling_price=p_selling_price, unit_cost=p_unit_cost, active=p_active
   where id=p_id;
  if not found then raise exception 'Menu item not found'; end if;
end;
$$;

grant execute on function public.admin_update_menu_item(uuid,text,text,text,numeric,numeric,boolean) to authenticated;
revoke execute on function public.admin_update_menu_item(uuid,text,text,text,numeric,numeric,boolean) from anon;

create or replace function public.admin_remove_menu_item(p_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_used boolean;
begin
  if public.current_role() <> 'admin' then raise exception 'Permission denied'; end if;
  select exists(select 1 from public.order_items where menu_item_id=p_id) into v_used;
  if v_used then
    update public.menu_items set active=false where id=p_id;
    if not found then raise exception 'Menu item not found'; end if;
    return 'archived';
  end if;
  delete from public.menu_items where id=p_id;
  if not found then raise exception 'Menu item not found'; end if;
  return 'deleted';
end;
$$;

grant execute on function public.admin_remove_menu_item(uuid) to authenticated;
revoke execute on function public.admin_remove_menu_item(uuid) from anon;

-- Personal Finance account maintenance. Records remain owner-private; Admin has
-- full CRUD over the Admin's own finance records through the UI.
create or replace function public.pf_update_account(
  p_id uuid,
  p_name text,
  p_account_type text,
  p_low_balance_threshold numeric,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if p_account_type not in ('cash','bank','mobile_wallet','credit','investment','other') then raise exception 'Invalid account type'; end if;
  update public.pf_accounts
     set name=btrim(p_name), account_type=p_account_type,
         low_balance_threshold=greatest(coalesce(p_low_balance_threshold,0),0),
         active=coalesce(p_active,true)
   where id=p_id and owner_id=auth.uid();
  if not found then raise exception 'Account not found'; end if;
end;
$$;

grant execute on function public.pf_update_account(uuid,text,text,numeric,boolean) to authenticated;
revoke execute on function public.pf_update_account(uuid,text,text,numeric,boolean) from anon;

create or replace function public.pf_remove_account(p_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_used boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select exists(select 1 from public.pf_transactions where account_id=p_id)
      or exists(select 1 from public.pf_recurring where account_id=p_id)
    into v_used;
  if v_used then
    update public.pf_accounts set active=false where id=p_id and owner_id=auth.uid();
    if not found then raise exception 'Account not found'; end if;
    return 'archived';
  end if;
  delete from public.pf_accounts where id=p_id and owner_id=auth.uid();
  if not found then raise exception 'Account not found'; end if;
  return 'deleted';
end;
$$;

grant execute on function public.pf_remove_account(uuid) to authenticated;
revoke execute on function public.pf_remove_account(uuid) from anon;

-- Personal Finance delete helpers. Transfer rows are deleted as one linked pair.
create or replace function public.pf_remove_transaction(p_id uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_group uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select transfer_group into v_group from public.pf_transactions where id=p_id and owner_id=auth.uid();
  if not found then raise exception 'Transaction not found'; end if;
  if v_group is null then
    delete from public.pf_transactions where id=p_id and owner_id=auth.uid();
  else
    delete from public.pf_transactions where transfer_group=v_group and owner_id=auth.uid();
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.pf_remove_transaction(uuid) to authenticated;
revoke execute on function public.pf_remove_transaction(uuid) from anon;

commit;
