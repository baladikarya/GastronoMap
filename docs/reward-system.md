# Sistem Poin & Leaderboard GastronoMap (v135)

## Sumber data
- **contribution_points** adalah satu-satunya ledger reward aktif. `leaderboard_points` merupakan view legacy, telah ditutup dari akses API langsung dan dipertahankan untuk kompatibilitas/audit.
- Kolom `source_kind`, `source_id` menghubungkan reward dengan kontribusi asal. Pasangan tersebut unik untuk mencegah pemberian poin dua kali atas konten yang sama.
- `reversed_at` menandai reward yang dibatalkan ketika konten asal dihapus/dinyatakan tidak valid. Data historis tetap tersimpan.
- Catatan poin lama tanpa `user_id` dipertahankan; tidak otomatis diatribusikan kepada pengguna lain.

## Kebijakan reward

| Kontribusi | Poin |
|---|---:|
| Restoran disetujui/terverifikasi | 5 |
| Foto kunjungan | 4 |
| Foto menu | 3 |
| Link referensi pertama | 3 |
| Link penjualan online setelah disetujui | 2 |
| Ulasan restoran | 2 |
| Rating restoran | 1 |
| Rekomendasi menu | 2 |
| Posting Community berisi teks atau foto | 3 |

Akun **Admin** tetap memiliki statistik aktivitas, tetapi mendapatkan **0 poin** dan **tidak ikut Leaderboard**. Mengedit konten tidak menghasilkan poin baru; menghapus atau mengosongkan konten yang sebelumnya mendapat reward akan membatalkan reward sumber tersebut. Postingan berisi foto tanpa caption juga memperoleh poin. Pencatatan poin baru dan backfill rekomendasi menu dilakukan melalui migrasi SQL.

## Profile Statistics Card
Setiap item menjadi tombol navigasi:
- Kontribusi → My Contributions
- Poin → Riwayat Poin (termasuk status reward dibatalkan)
- Dikunjungi → Visited
- Postingan → My Posts

Statistik berasal dari `gm_my_profile_stats()`. Menu Riwayat Poin membaca catatan milik akun saat ini sesuai RLS; totalnya dihitung di server tanpa batas 500 item. Halaman riwayat menampilkan maksimal 500 transaksi terbaru.

## Leaderboard domisili
- Memakai `gm_leaderboard(p_period)` dengan periode `month`, `year`, atau `all`. Batas periode dihitung menurut zona waktu Asia/Jakarta.
- Pengelompokan **kota berasal dari `profiles.city` pengguna**, bukan kota restoran.
- Kosong → “Domisili belum diisi”; pengguna dapat mengisi lewat Edit Profile.
- Nama muncul hanya jika user terverifikasi (3 restoran terverifikasi **atau** 5 review lengkap), role bukan Admin, dan skor memenuhi periode.
- Perubahan domisili di Profile langsung mengubah kelompok Leaderboard saat data dimuat kembali.

## Keamanan
- `contribution_points`: RLS untuk baca milik sendiri, tanpa hak INSERT/UPDATE/DELETE dari browser.
- `leaderboard_points`: view legacy tanpa grant langsung kepada `anon` dan `authenticated`.
- Fungsi reward dan pembatalan hanya dapat dipanggil dari trigger/function database tepercaya.
- Fungsi Admin ditutup dari pemanggil anonim dan tetap mengecek `auth.uid()`.
- RLS penambahan restoran mencegah pengguna biasa memalsukan pembuat atau status verifikasi.
- RPC statistik milik sendiri membutuhkan login; RPC Leaderboard hanya mengeluarkan nama, domisili dan skor kontributor terverifikasi.

## Migrasi
1. `20261011174000_reward_ledger_and_domicile_leaderboard.sql`
2. `20261011174500_community_post_short_text_reward.sql`
3. `20261011175000_restrict_admin_rpcs_and_role_search_path.sql`

Jalankan migrasi sesuai urutan. Setiap migrasi tidak menghapus data histori. Audit otomatis dilakukan memakai transaksi yang diakhiri `ROLLBACK`. Peringatan keamanan lain di luar ledger reward perlu ditangani melalui pekerjaan terpisah.
