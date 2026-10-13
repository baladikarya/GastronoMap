# P2 — Tahap 12: Moderation

Tanggal implementasi: 13 Oktober 2026  
Branch: `development`

## Ruang lingkup

Tahap 12 **memperluas** Reports dan alur admin yang sudah ada; tidak mengganti detail restoran maupun navigasi utama.

- Laporan: bantuan umum/restoran, postingan, komentar, akun, foto Community, foto kunjungan, dan foto menu.
- Alasan laporan Community: spam, pelecehan, privasi, konten tidak pantas, informasi menyesatkan, dan lainnya. Pesan laporan 10–2000 karakter.
- Community: tombol opsi pada post/komentar dan foto di tampilan detail; tetap mempertahankan Like/Comment/Share.
- Profil sosial: opsi laporkan akun.
- Detail restoran: tombol opsi pada foto kontribusi pengguna. Foto menu bawaan restoran tanpa baris `menu_photos` tidak diberi tombol pelaporan foto individual.
- Admin Reports: filter status dan jenis target, aksi hide/restore/delete dan suspend/unsuspend, shortcut pengajuan link, serta audit tindakan.
- Backend: `reports.target_type/target_id`, `moderation_state`, `profiles.suspended_*`, audit log, RLS, trigger validasi dan anti-spam, serta RPC admin-only `moderate_content`.

## Migrasi

Jalankan berurutan (sudah diaplikasikan ke proyek Supabase GastronoMap):

1. `supabase/migrations/20261013080000_p2_stage12_moderation.sql`
2. `supabase/migrations/20261013090000_p2_stage12_guard_contributions.sql`

Keduanya additive; tidak menjalankan reset schema. `moderation_actions` hanya bisa dibaca admin melalui RLS; insert tindakan dilakukan oleh fungsi yang memverifikasi admin melalui `auth.uid()`. Helper privileged berada di schema `gm_private` yang tidak diekspos lewat Data API.

## Hak akses

| Peran | Laporkan konten | Lihat laporan | Moderasi konten | Kontribusi saat suspend |
|---|---|---|---|---|
| Pengunjung | Perlu login | Tidak | Tidak | — |
| Pengguna | Ya, miliknya dan laporan yang dibuat | Laporan sendiri | Tidak; boleh menghapus konten sendiri sesuai RLS | Ditolak server |
| Admin | Ya | Semua | Hide, restore, delete, suspend, unsuspend | Tidak dibatasi |

Pemilik konten **tidak** memiliki izin `UPDATE moderation_state` melalui Data API. Hidden Community posts, comments, dan media tidak lagi terbaca melalui query publik biasa; admin tetap dapat mengaudit.

## Anti-spam di database

- Post: maksimal 6 per jam dengan jeda minimal 15 detik.
- Komentar: maksimal 40 per jam dengan jeda minimal 3 detik.
- Laporan: maksimal 12 per 24 jam dengan jeda minimal 20 detik.
- Jeda dihitung dari waktu server; client tidak dapat memalsukan timestamp.
- Moderasi admin tidak terkena pembatasan posting/komentar di atas.

## Pemeriksaan

- [x] Migration 1 dan 2 sukses diaplikasikan pada proyek terhubung.
- [x] RLS SELECT untuk `posts`, `comments`, dan `post_media` hanya memiliki policy baca yang dimoderasi.
- [x] RPC `moderate_content` tidak memiliki hak EXECUTE untuk `anon`; pemanggil terautentikasi juga wajib melewati pemeriksaan admin di fungsi.
- [x] Helper publik untuk cek moderator dan suspensi memakai SECURITY INVOKER; definer dipindahkan ke schema internal.
- [x] Sintaks JavaScript pada modul yang diubah diperiksa.
- [ ] E2E manual menggunakan dua akun pengguna + satu akun admin (login, report, notifikasi, suspend, restore, foto).
- [ ] Pemeriksaan UX visual perangkat fisik pada browser mobile.

## Batasan penting

1. **URL foto pada bucket Storage yang bersifat publik tidak otomatis menjadi privat setelah metadata di-hide.** Foto tersembunyi hilang dari query/gallery aplikasi, tetapi orang yang telah menyimpan URL lama bisa saja masih mengakses file. Pencabutan URL permanen memerlukan pemindahan ke bucket privat, penghancuran objek Storage via API terotorisasi, atau perubahan arsitektur penyajian gambar. Untuk laporan yang menyangkut privasi/keamanan serius, admin harus menghapus objek terkait di Storage juga.
2. Aksi `delete` pada baris foto hanya menghapus metadata; file Storage perlu dibersihkan terpisah melalui Storage API.
3. Suspend tidak menghapus seluruh kontribusi historis, tetapi postingan Community milik akun yang aktif tersuspend disembunyikan oleh RLS. Penghapusan/restorasi kontribusi lain merupakan keputusan admin.
4. `public_social_profiles` dan `public_contributor_profiles` merupakan view lama; peringatan security-definer view dari Supabase Advisors belum termasuk perubahan Tahap 12.
5. `moderate_content` sengaja diekspos ke `authenticated` untuk dipanggil oleh admin dari frontend, tetapi melakukan pemeriksaan peran secara eksplisit di server. Supabase Advisor tetap menampilkan peringatan generik untuk fungsi definer ini.

## Skenario uji manual (wajib sebelum rilis publik)

1. Login pengguna A, laporkan post/komentar/foto/akun pengguna B; laporan muncul di Reports dan admin pending.
2. Login admin, filter kategori; buka laporan, hide target. Verifikasi pengunjung dan pengguna B tidak lagi mendapatkan konten hidden pada feed/API.
3. Admin restore lalu delete; verifikasi audit log, status laporan resolved, UI, dan penyegaran feed.
4. Suspend akun B 24 jam: coba post, komentar, rating, resto baru, follow, pengajuan link; semua penambahan seharusnya ditolak server. Unsuspend memulihkan akses.
5. Kirim berulang post, komentar dan laporan; verifikasi pesan batas per waktu serta tidak ada duplikasi.
6. Uji modal di mobile (keyboard, tab focus, tutup Escape, scroll panjang, safe area).
7. Uji alur existing: tambah resto, upload foto, admin approve link, ulasan, wishlist, notification center.
