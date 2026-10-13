# P3 / Tahap 16 — Personalization

## Audit awal
Branch: `development` pada commit `3192098d28e23850f1d619540d1f82b2523fd70f` (13 Oktober 2026).
Sudah tersedia: katalog `restos` dengan kategori/harga/lokasi, `ratings` (beserta `user_id`), `visited`, `wishlist`, GPS browser, filter Home, dan list card. Tidak memerlukan migrasi SQL baru.

## Implementasi
- Home → **List** mempunyai mode **Terdekat** (existing) dan **Untuk Anda**; detail resto/Community/navigasi tidak diganti.
- **Untuk Anda** bekerja untuk guest tanpa GPS, juga untuk akun dengan wishlist/visited/rating. Tetap menghormati filter/search aktif.
- Ranking deterministik memakai rating komunitas yang dismoothing, jumlah rating terbatas, kesamaan kategori/rentang harga dengan wishlist dan rating positif pengguna, visited sebagai sinyal lemah, detail dibuka selama sesi, lokasi jika diizinkan, dan status verified.
- Prioritas tempat yang belum pernah disimpan/dikunjungi, dengan fallback ke kandidat yang ada agar tidak kosong.
- Alasan rekomendasi ditampilkan dari data yang relevan: kategori sesuai, rating komunitas, jarak dekat, atau label netral.

## Privasi, batasan, dan validasi
- Aktivitas eksplorasi hanya dalam memori JS maksimal 30 resto; tanpa cookies, localStorage, Supabase, atau endpoint baru. Direset ketika identitas akun berganti.
- Visited tidak disamakan dengan menyukai; rating rendah bukan sinyal positif.
- Lokasi tidak disimpan oleh fitur ini. Bila GPS ditolak, skor jarak tidak digunakan.
- Belum ada AI, model kolaboratif, preferensi lintas sesi/alat, atau bukti bahwa rekomendasi efektif dalam penggunaan nyata.
- Jalankan `node --test tests/*.test.cjs`; uji guest, akun baru, akun dengan wishlist/rating, penolakan GPS, filter, pagination, logout/login, serta pembaruan PWA.
