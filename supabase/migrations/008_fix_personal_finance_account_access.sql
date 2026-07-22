-- Make Personal Finance account creation reliable for authenticated users.

begin;

-- Explicit grants are required when tables are created through SQL migrations.
grant select, insert, update, delete on public.pf_accounts to authenticated;
grant select, insert, update, delete on public.pf_categories to authenticated;
grant select, insert, update, delete on public.pf_transactions to authenticated;
grant select, insert, update, delete on public.pf_budgets to authenticated;
grant select, insert, update, delete on public.pf_goals to authenticated;
grant select, insert, update, delete on public.pf_recurring to authenticated;
grant select on public.pf_account_balances to authenticated;

-- Dedicated account creator keeps owner_id tied to the signed-in user and
-- returns the new account id so the UI can reload immediately.
create or replace function public.pf_create_account(
  p_name text,
  p_account_type text,
  p_opening_balance numeric default 0,
  p_low_balance_threshold numeric default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if v_name = '' then
    raise exception 'Account name is required';
  end if;

  if p_account_type not in ('cash','bank','mobile_wallet','credit','investment','other') then
    raise exception 'Invalid account type';
  end if;

  insert into public.pf_accounts(
    owner_id,
    name,
    account_type,
    opening_balance,
    low_balance_threshold
  ) values (
    auth.uid(),
    v_name,
    p_account_type,
    coalesce(p_opening_balance, 0),
    greatest(coalesce(p_low_balance_threshold, 0), 0)
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'An account with this name already exists';
end;
$$;

grant execute on function public.pf_create_account(text,text,numeric,numeric) to authenticated;
revoke execute on function public.pf_create_account(text,text,numeric,numeric) from anon;

commit;
