-- Complete the closed-month expense protection for DELETE operations.

begin;

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

  if tg_op = 'DELETE' then
    if public.is_closed(old.expense_date) then
      raise exception 'This accounting month is closed';
    end if;
    return old;
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
before insert or update or delete on public.expenses
for each row execute function public.guard_expense_write();

commit;
