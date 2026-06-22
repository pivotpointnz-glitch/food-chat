-- ============================================================
-- Food Tracker — Initial Schema
-- ============================================================

-- Enable trigram search up front (needed for the foods name index below)
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- profiles
-- One row per authenticated user. Extends Supabase auth.users.
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  -- Daily macro targets. Null = no target set for that macro yet.
  target_calories numeric,
  target_protein_g numeric,
  target_carbs_g numeric,
  target_fat_g numeric,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- foods
-- A food the app knows about. Either:
--   - source = 'usda'   -> cached lookup from USDA FoodData Central
--   - source = 'custom' -> user-created (simple or composite)
-- Macros are always stored per 100 base units (per 100g or per 100ml)
-- so math is consistent no matter how a food is later logged.
-- ------------------------------------------------------------
create type public.food_source as enum ('usda', 'custom');
create type public.food_visibility as enum ('private', 'shared');
create type public.base_unit as enum ('g', 'ml');

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade, -- null = global USDA cache entry
  source public.food_source not null,
  visibility public.food_visibility not null default 'private',
  usda_fdc_id text,                 -- set when source = 'usda', used to avoid re-fetching
  is_composite boolean not null default false, -- true if this food is built from component foods
  name text not null,
  brand text,                       -- optional, useful for USDA branded foods
  base_unit public.base_unit not null default 'g',
  default_quantity numeric not null default 100, -- typical serving used as a shortcut in the UI
  default_unit text not null default 'g',        -- display unit for default_quantity (g, ml, each, tbsp, etc.)
  grams_per_default_unit numeric,   -- conversion factor when default_unit isn't grams/ml directly (e.g. 1 "each" = 50g)
  calories_per_100 numeric not null default 0,
  protein_g_per_100 numeric not null default 0,
  carbs_g_per_100 numeric not null default 0,
  fat_g_per_100 numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint usda_foods_have_no_owner
    check (source <> 'usda' or owner_id is null),
  constraint custom_foods_have_owner
    check (source <> 'custom' or owner_id is not null)
);

create index foods_owner_id_idx on public.foods (owner_id);
create index foods_usda_fdc_id_idx on public.foods (usda_fdc_id);
create index foods_name_trgm_idx on public.foods using gin (name gin_trgm_ops);

alter table public.foods enable row level security;

-- USDA cache rows (owner_id null) are visible to everyone.
-- Custom foods are visible to their owner, or to everyone if shared.
create policy "Foods are viewable based on ownership/visibility"
  on public.foods for select
  using (
    owner_id is null
    or owner_id = auth.uid()
    or visibility = 'shared'
  );

create policy "Users can insert their own custom foods"
  on public.foods for insert
  with check (
    (source = 'custom' and owner_id = auth.uid())
    or (source = 'usda') -- USDA cache rows are inserted via service role typically, but allow authenticated inserts too
  );

create policy "Users can update their own foods"
  on public.foods for update
  using (owner_id = auth.uid());

create policy "Users can delete their own foods"
  on public.foods for delete
  using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- composite_food_items
-- Links a composite food (e.g. "Josh's usual smoothie") to its
-- component foods and quantities, so macros can be derived.
-- ------------------------------------------------------------
create table public.composite_food_items (
  id uuid primary key default gen_random_uuid(),
  composite_food_id uuid not null references public.foods (id) on delete cascade,
  component_food_id uuid not null references public.foods (id) on delete restrict,
  quantity numeric not null,
  unit text not null, -- 'g', 'ml', 'tsp', 'tbsp', 'each', etc.
  grams_equivalent numeric not null, -- resolved weight in grams/ml used for macro calculation
  sort_order int not null default 0,

  constraint composite_item_not_self_referencing
    check (composite_food_id <> component_food_id)
);

create index composite_food_items_composite_id_idx on public.composite_food_items (composite_food_id);

alter table public.composite_food_items enable row level security;

create policy "Composite items are viewable if the parent food is viewable"
  on public.composite_food_items for select
  using (
    exists (
      select 1 from public.foods f
      where f.id = composite_food_id
        and (f.owner_id is null or f.owner_id = auth.uid() or f.visibility = 'shared')
    )
  );

create policy "Users can manage composite items for their own foods"
  on public.composite_food_items for all
  using (
    exists (
      select 1 from public.foods f
      where f.id = composite_food_id and f.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.foods f
      where f.id = composite_food_id and f.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- logs
-- Actual food log entries.
-- ------------------------------------------------------------
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.log_source as enum ('manual', 'voice');

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete restrict,
  quantity numeric not null,
  unit text not null,
  grams_equivalent numeric not null, -- resolved weight used for the macro snapshot below
  -- Macro snapshot at time of logging, so edits to a food later don't rewrite history.
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  meal_type public.meal_type not null default 'snack',
  source public.log_source not null default 'manual',
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index logs_user_id_logged_at_idx on public.logs (user_id, logged_at desc);

alter table public.logs enable row level security;

create policy "Users can view their own logs"
  on public.logs for select
  using (user_id = auth.uid());

create policy "Users can insert their own logs"
  on public.logs for insert
  with check (user_id = auth.uid());

create policy "Users can update their own logs"
  on public.logs for update
  using (user_id = auth.uid());

create policy "Users can delete their own logs"
  on public.logs for delete
  using (user_id = auth.uid());
