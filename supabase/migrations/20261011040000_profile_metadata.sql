-- P1 Tahap 8: richer editable user profile metadata.
-- Additive and safe for existing profiles; role and contributor flags stay protected.
alter table public.profiles
  add column if not exists bio text,
  add column if not exists city text,
  add column if not exists website_url text,
  add column if not exists instagram text,
  add column if not exists tiktok text;

-- Legacy deployments could still have table-wide UPDATE grants, including
-- role and verification fields. Remove them before restoring safe columns.
revoke update on public.profiles from public, anon, authenticated;
grant update (display_name, username, gender, age, avatar_url,
              bio, city, website_url, instagram, tiktok)
  on public.profiles to authenticated;
