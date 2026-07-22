-- Ensure every newly created profile receives the default personal-finance categories.

create or replace function public.seed_personal_finance_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pf_categories(owner_id,kind,name,parent_name)
  values
    (new.id,'income','Salary',null),(new.id,'income','Bonus',null),(new.id,'income','Freelancing',null),(new.id,'income','Business Income',null),(new.id,'income','Other Income',null),
    (new.id,'expense','House Rent','Housing'),(new.id,'expense','Grocery','Food'),(new.id,'expense','Restaurant','Food'),(new.id,'expense','Office Snacks','Food'),
    (new.id,'expense','Transport','Transport'),(new.id,'expense','Electricity','Utilities'),(new.id,'expense','Internet','Utilities'),(new.id,'expense','Mobile Recharge','Utilities'),
    (new.id,'expense','Family','Family'),(new.id,'expense','Education','Education'),(new.id,'expense','AI & Technology','Technology'),(new.id,'expense','Loan / EMI','Loan & EMI'),
    (new.id,'expense','Savings','Savings'),(new.id,'expense','Investment','Investment'),(new.id,'expense','Shopping','Shopping'),(new.id,'expense','Medical','Medical'),
    (new.id,'expense','Donation','Religious'),(new.id,'expense','Entertainment','Entertainment'),(new.id,'expense','Office','Office'),(new.id,'expense','Bank Charge','Bank Charges'),
    (new.id,'expense','Miscellaneous','Others')
  on conflict (owner_id,kind,name) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_personal_finance_categories_trigger on public.profiles;
create trigger seed_personal_finance_categories_trigger
after insert on public.profiles
for each row execute function public.seed_personal_finance_categories();
