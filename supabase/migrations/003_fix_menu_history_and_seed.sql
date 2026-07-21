-- Fix menu item creation failure caused by the price-history trigger.
-- The original BEFORE INSERT trigger attempted to write a history row before
-- the parent menu_items row existed, which violated the foreign key.

begin;

-- Keep updated_at correct before an update is stored.
create or replace function public.set_menu_item_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Write price history only after the parent menu row exists.
create or replace function public.track_menu_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.selling_price is distinct from old.selling_price
     or new.unit_cost is distinct from old.unit_cost then
    insert into public.menu_price_history(
      menu_item_id,
      selling_price,
      unit_cost,
      changed_by
    ) values (
      new.id,
      new.selling_price,
      new.unit_cost,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists menu_item_updated_at_trigger on public.menu_items;
create trigger menu_item_updated_at_trigger
before update on public.menu_items
for each row
execute function public.set_menu_item_updated_at();

drop trigger if exists menu_price_history_trigger on public.menu_items;
create trigger menu_price_history_trigger
after insert or update of selling_price, unit_cost on public.menu_items
for each row
execute function public.track_menu_price();

-- Initial SnackFlow food menu.
-- Unknown production costs are intentionally set to 0 and should be updated
-- later with the actual kitchen cost for accurate margin reporting.
insert into public.menu_items (
  name,
  category,
  sku,
  selling_price,
  unit_cost,
  active
)
values
  ('Paratha', 'Breakfast', 'BRK-001', 10, 8, true),
  ('Dal', 'Side Dish', 'SID-001', 20, 0, true),
  ('Dal Bhaji', 'Side Dish', 'SID-002', 20, 0, true),
  ('Egg Poach', 'Breakfast', 'BRK-002', 25, 0, true),
  ('Egg Fry', 'Breakfast', 'BRK-003', 25, 0, true),
  ('Full Khichuri with Egg Fry', 'Main Meal', 'MEAL-001', 80, 0, true),
  ('Half Khichuri with Egg', 'Main Meal', 'MEAL-002', 70, 0, true),
  ('Sandwich', 'Snacks', 'SNK-001', 80, 0, true)
on conflict (sku) do update
set
  name = excluded.name,
  category = excluded.category,
  selling_price = excluded.selling_price,
  unit_cost = excluded.unit_cost,
  active = excluded.active;

commit;
