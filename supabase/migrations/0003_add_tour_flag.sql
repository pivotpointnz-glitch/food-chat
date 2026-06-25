-- Tracks whether a user has completed (or skipped) the onboarding tour,
-- so it only shows automatically once, with a manual replay option later.
alter table public.profiles add column has_seen_tour boolean not null default false;
