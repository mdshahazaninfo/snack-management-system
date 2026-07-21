-- Resolve Supabase Security Advisor warnings for SECURITY DEFINER views.
-- With security_invoker enabled, access to the underlying tables is checked
-- using the querying user's privileges and Row Level Security policies.

alter view if exists public.member_balances
  set (security_invoker = true);

alter view if exists public.order_report
  set (security_invoker = true);

-- Keep access limited to signed-in application users.
revoke all on public.member_balances from anon;
revoke all on public.order_report from anon;

grant select on public.member_balances to authenticated;
grant select on public.order_report to authenticated;
