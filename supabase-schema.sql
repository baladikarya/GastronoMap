-- ============================================================
-- SKEMA DATABASE GASTRONOMAP (Supabase / PostgreSQL) — VERSI FINAL
-- Cara pakai: buka project Supabase -> SQL Editor -> New query
-- -> tempel SELURUH isi file ini -> klik Run.
-- Aman dijalankan meski project sudah pernah ada sisa tabel lama
-- (bagian RESET di paling atas akan membersihkannya dulu).
-- ============================================================

-- ============================================================
-- RESET — bersihkan sisa tabel/trigger/policy lama (kalau ada)
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists visit_photos cascade;
drop table if exists visited cascade;
drop table if exists references_link cascade;
drop table if exists favorite_menu cascade;
drop table if exists testimonials cascade;
drop table if exists ratings cascade;
drop table if exists restos cascade;
drop table if exists profiles cascade;
drop policy if exists "visit-photos bucket: publik bisa lihat" on storage.objects;
drop policy if exists "visit-photos bucket: user login bisa upload" on storage.objects;
drop policy if exists "visit-photos bucket: hapus milik sendiri/admin" on storage.objects;

-- ============================================================
-- PROFIL USER + ROLE (admin/user)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

-- PENTING: fungsi ini pakai "set search_path = public" dan "public.profiles"
-- secara eksplisit. Tanpa ini, trigger akan GAGAL dengan error
-- 'relation "profiles" does not exist' walau tabelnya ada — ini bug umum
-- Supabase karena proses internal Auth punya jalur pencarian tabel berbeda.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- RESTO (data inti) ----------
create table restos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  type text not null,
  price_range text,
  hours_by_day jsonb,               -- {"Senin":{"closed":false,"open":"08:00","close":"22:00"}, ...}
  menu_images jsonb default '[]',    -- ["https://...jpg", ...]
  online_platforms jsonb default '[]', -- ["gofood","grabfood","shopeefood"]
  lat double precision not null,
  lng double precision not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- RATING (1 per user per resto, bisa diedit -> upsert) ----------
create table ratings (
  resto_id uuid references restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  overall int not null check (overall between 1 and 5),
  harga int check (harga between 1 and 5),
  porsi int check (porsi between 1 and 5),
  rasa int check (rasa between 1 and 5),
  suasana int check (suasana between 1 and 5),
  pelayanan int check (pelayanan between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (resto_id, user_id)   -- <- inilah yang menegakkan "1 rating per user"
);

-- ---------- TESTIMONI (1 per user per resto, bisa diedit -> upsert) ----------
create table testimonials (
  resto_id uuid references restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (resto_id, user_id)
);

-- ---------- MENU FAVORIT (boleh berkali-kali per user) ----------
create table favorite_menu (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  menu_name text not null,
  created_at timestamptz not null default now()
);

-- ---------- REFERENSI (link reels/video, boleh berkali-kali) ----------
create table references_link (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  url text not null,
  platform text not null default 'other',
  created_at timestamptz not null default now()
);

-- ---------- KUNJUNGAN (personal, tidak terlihat user lain) ----------
create table visited (
  resto_id uuid references restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resto_id, user_id)
);

-- ---------- FOTO KUNJUNGAN (dari kamera/galeri user) ----------
create table visit_photos (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,   -- path di storage bucket; URL publik dihitung otomatis dari path ini
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (aturan siapa boleh apa, ditegakkan di server)
-- ============================================================
alter table profiles enable row level security;
alter table restos enable row level security;
alter table ratings enable row level security;
alter table testimonials enable row level security;
alter table favorite_menu enable row level security;
alter table references_link enable row level security;
alter table visited enable row level security;
alter table visit_photos enable row level security;

-- Semua orang (termasuk yang belum login) boleh MELIHAT data resto & crowdsource-nya
create policy "restos: publik bisa lihat" on restos for select using (true);
create policy "ratings: publik bisa lihat" on ratings for select using (true);
create policy "testimonials: publik bisa lihat" on testimonials for select using (true);
create policy "favorite_menu: publik bisa lihat" on favorite_menu for select using (true);
create policy "references: publik bisa lihat" on references_link for select using (true);
create policy "profiles: publik bisa lihat role" on profiles for select using (true);
create policy "visit_photos: publik bisa lihat" on visit_photos for select using (true);

-- Tambah resto baru: siapa saja yang sudah login
create policy "restos: user login bisa tambah" on restos for insert
  with check (auth.uid() is not null);

-- Edit/hapus resto: KHUSUS ADMIN
create policy "restos: admin bisa edit" on restos for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "restos: admin bisa hapus" on restos for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Rating & testimoni: hanya boleh isi/ubah baris MILIK SENDIRI (userId = auth.uid())
create policy "ratings: isi/ubah milik sendiri" on ratings for insert with check (auth.uid() = user_id);
create policy "ratings: update milik sendiri" on ratings for update using (auth.uid() = user_id);
create policy "testimonials: isi/ubah milik sendiri" on testimonials for insert with check (auth.uid() = user_id);
create policy "testimonials: update milik sendiri" on testimonials for update using (auth.uid() = user_id);

-- Menu favorit & referensi: boleh tambah (login), hapus hanya milik sendiri atau admin
create policy "favorite_menu: user login bisa tambah" on favorite_menu for insert with check (auth.uid() = user_id);
create policy "favorite_menu: hapus milik sendiri/admin" on favorite_menu for delete
  using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "references: user login bisa tambah" on references_link for insert with check (auth.uid() = user_id);
create policy "references: hapus milik sendiri/admin" on references_link for delete
  using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Kunjungan: PRIVATE, hanya pemiliknya sendiri yang boleh lihat/ubah
create policy "visited: hanya milik sendiri" on visited for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Foto kunjungan: publik boleh lihat, user login boleh tambah, hapus hanya milik sendiri/admin
create policy "visit_photos: user login bisa tambah" on visit_photos for insert with check (auth.uid() = user_id);
create policy "visit_photos: hapus milik sendiri/admin" on visit_photos for delete
  using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- STORAGE BUCKET UNTUK FOTO
-- PENTING: sebelum menjalankan 3 policy di bawah ini, buat dulu bucket-nya lewat
-- Dashboard -> Storage -> New bucket -> nama: "visit-photos" -> Public bucket: ON
-- (nama bucket HARUS persis "visit-photos", sesuai yang dipakai di kode aplikasi)
-- Kalau bucket belum dibuat, 3 baris policy ini akan GAGAL — buat bucket dulu,
-- baru jalankan bagian ini secara terpisah (blok saja 3 baris ini, klik Run).
-- ============================================================
create policy "visit-photos bucket: publik bisa lihat" on storage.objects for select
  using (bucket_id = 'visit-photos');
create policy "visit-photos bucket: user login bisa upload" on storage.objects for insert
  with check (bucket_id = 'visit-photos' and auth.uid() is not null);
create policy "visit-photos bucket: hapus milik sendiri/admin" on storage.objects for delete
  using (bucket_id = 'visit-photos' and (owner = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin')));

-- ============================================================
-- CARA MENJADIKAN AKUN ANDA SEBAGAI ADMIN (jalankan setelah Anda login sekali di app):
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'email_anda@gmail.com');
-- ============================================================
