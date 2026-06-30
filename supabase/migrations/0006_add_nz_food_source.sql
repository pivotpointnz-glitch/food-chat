-- Add 'nz' as a valid food source, alongside existing 'usda' and 'custom'.
alter type public.food_source add value 'nz';

-- Add a stable NZ food ID column for upsert deduplication during import
-- and future re-imports when FOODfiles is updated (every ~2 years).
-- Nullable since only NZ-sourced foods will have this set.
alter table public.foods add column nz_food_id text unique;

-- Index for fast lookup by NZ food ID (used during upsert and search).
create index if not exists foods_nz_food_id_idx on public.foods (nz_food_id)
  where nz_food_id is not null;
