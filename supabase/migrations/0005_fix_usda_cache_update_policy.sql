-- Bug fix: the original "Users can update their own foods" policy used
-- `owner_id = auth.uid()`, which can never be true for USDA-cache foods
-- (owner_id is null for those), since SQL null comparisons are never true.
-- This silently blocked ALL updates to cached USDA foods for ANY user,
-- including legitimate refreshes of nutrient data — explaining why the
-- fiber backfill reported "success" but updated zero actual rows
-- (Postgres doesn't error when an UPDATE's WHERE/RLS clause matches no
-- rows, it just affects 0 rows).
--
-- Fix: allow updates to USDA-cache rows (owner_id is null) by any
-- authenticated user, in addition to a user updating their own custom
-- foods. This is reasonable since USDA-cache rows are shared global data,
-- not personal data — refreshing their nutrient values benefits everyone.

drop policy if exists "Users can update their own foods" on public.foods;

create policy "Users can update their own foods or refresh USDA cache"
  on public.foods for update
  using (owner_id = auth.uid() or owner_id is null);
