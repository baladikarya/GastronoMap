# P3 / Tahap 15 — Community Lanjutan

## Keputusan implementasi

Snapshot database pada 13 Oktober 2026: **2 postingan, 0 like, 4 komentar**, dan 2 nilai lokasi postingan berbeda. Jumlah konten belum cukup untuk menyimpulkan tren. Oleh sebab itu, Stage 15 menyiapkan discovery terukur tanpa mengklaim sudah ada tren kuliner yang representatif.

| Fitur | Implementasi | Catatan |
|---|---|---|
| Terbaru / Following | Tetap kompatibel dengan feed dan pagination lama; tetap server-paginated | Existing navigation dan detail card tidak berubah |
| Populer | Ranking global di database selama 30 hari terakhir; bobot like 2, komentar 3 | Hasil dapat belum representatif ketika jumlah post kecil; UI menjelaskannya |
| Di Sekitar | Query restoran bertanda hingga radius 25 km (berdasarkan GPS yang diizinkan), urut terdekat | Post tanpa resto bertanda dan koordinat tidak dapat dihitung jaraknya; GPS tidak disimpan |
| Kota/area | Pencarian server-side pada `posts.location_name` **atau** alamat restoran yang ditandai | Pencocokan teks, bukan geocoding atau wilayah administratif |
| Topik | 6 topik terkurasi: Ulasan, Rekomendasi, Hidden Gem, Street Food, Tips Kuliner, Tanya Jawab | Post lama tetap valid dengan `topic = NULL` |
| Sharing | Native Share membawa ringkasan caption dan URL post; fallback copy link | Post dan komentar tetap terpisah dari Detail Resto |
| Mention / Collections | Ditunda | P3 menyatakan **pertimbangkan setelah evaluasi penggunaan**; dengan 2 post belum ada dasar produk untuk penyimpanan dan notifikasi baru |

## Migrasi & deployment

1. Terapkan `supabase/migrations/20261013103000_p3_stage15_community_discovery.sql` pada proyek Supabase GastronoMap menggunakan migration pipeline. Migrasi bersifat additive, tidak mengubah post lama, menjaga RLS dengan `SECURITY INVOKER`.
2. Deploy `development` untuk mengaktifkan UI. Filter Populer, Nearby, area dan topik memerlukan fungsi RPC `gm_community_discover`; jika migrasi belum diterapkan, feed Terbaru dan Following tetap dapat menggunakan query lama dan pengguna mendapat error yang jelas pada filter baru.
3. Service worker memakai versi cache baru sehingga UI tidak tercampur dengan script lama.
4. Jalankan `node --test tests/*.test.cjs` (termasuk `tests/p3-stage15.test.cjs`).

## Uji manual

1. Dengan dua post yang ada, cek Populer mengurutkan berdasarkan jumlah like dan komentar lintas halaman; UI harus menjelaskan data masih sedikit.
2. Buat postingan dengan topik Hidden Gem, lokasi `Bandung`, dan restoran tertandai. Filter topic dan area secara terpisah maupun bersama, lalu reset.
3. Verifikasi filter area mencari di `location_name` serta `restos.address` tanpa perlu menunggu post tersebut muncul di feed Terbaru.
4. Berikan izin GPS dan cek Di Sekitar mengembalikan hanya post dengan restoran bertanda berjarak maksimal 25 km, urut terdekat. Tolak izin GPS; pastikan tidak ada perubahan filter dan tetap dapat menggunakan fitur lain.
5. Scroll melewati 12 hasil pada tiap filter, lalu ganti filter dengan cepat; pastikan pagination tidak menggandakan post dan respons filter lama tidak menimpa hasil baru.
6. Periksa post lama tanpa topik, link deep-link `?post=<uuid>`, Follow, profile publik, moderasi, native share dan fallback clipboard.
7. Test di mobile dan desktop, serta update versi PWA melalui banner pembaruan.

## Batasan

- Trending adalah *engagement ranking* dari post yang dibuat dalam 30 hari terakhir, bukan analisis lokasi populer atau engagement waktu nyata.
- Filter kota/area berbasis teks; butuh geocoding dan data kota terstruktur bila ingin area geospasial akurat.
- Post dengan lokasi teks saja tidak dapat dihitung radius GPS. Ini sengaja menghindari perkiraan koordinat palsu.
- Refresh halaman setelah mendapat update service worker saat deployment.
