-- Add dietary fiber as a tracked macro, alongside calories/protein/carbs/fat.
-- USDA nutrient number 291 ("Fiber, total dietary") is already present in
-- the same API responses we fetch for the other macros, so no new data
-- source is needed — we were just discarding it until now.

alter table public.foods add column fiber_g_per_100 numeric not null default 0;
alter table public.logs add column fiber_g numeric not null default 0;
alter table public.profiles add column target_fiber_g numeric;
