/* ================= CONFIG: TIPE RESTO ================= */
const TYPES = {
  "Indonesian": {emoji:"🍛", color:"#E8A33D"},
  "Asian":      {emoji:"🥢", color:"#C1443B"},
  "Western":    {emoji:"🍔", color:"#6B4C93"},
  "Bakery":     {emoji:"🥐", color:"#C4801F"},
  "Cafe":       {emoji:"☕", color:"#6F4E37"},
  "Sweet":      {emoji:"🍰", color:"#E85D9E"},
  "Snack":      {emoji:"🍿", color:"#3D8B8B"},
  "Seafood":    {emoji:"🦐", color:"#2E86AB"},
  "Traditional":{emoji:"🍲", color:"#8B5A2B"},
  "AYCE":       {emoji:"♾️", color:"#C99700"}
};
const DEFAULT_TYPE_META = {emoji:"📍", color:"#555555"}; // fallback untuk tipe lama/tidak dikenal (data sebelum perubahan ini)

const DAYS = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];

let map, markersLayer, allRestos = {}, activeTypeFilters = new Set(), pickedLatLng = null, editingId = null, tempMarker = null;
let pickingLocationMode = false; // true selama alur tambah/edit resto aktif (form terbuka ATAU sedang di mode "pastikan pin")
let quickPinMarker = null; // pin sementara dari tap-tahan di peta utama (sebelum form Tambah Resto dibuka)
let pendingNewRestoLatLng = null; // lokasi dari quickPinMarker yang dibawa masuk ke openForm() saat pin-nya ditekan
let formMenuImages = []; // foto menu yang sudah diunggah untuk resto yang sedang diisi di form
let formVisitPhotos = []; // {blob, previewUrl} foto kunjungan yg SUDAH diproses (kompres + keputusan blur wajah) saat dipilih; diunggah saat Simpan (baru butuh resto_id)
let formRatingDraft = {}; // draft rating (per kriteria) yang diisi di form tambah resto
let myGpsLatLng = null; // lokasi HP user saat ini, dipakai supaya sugesti alamat prioritas ke sekitar sini

function refreshMyGpsLocation(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos)=>{ myGpsLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
    ()=>{ /* izin ditolak/gagal, biarkan fallback ke pusat peta saat pencarian */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
  );
}
let timeFilter = null; // {day:"Senin", time:"18:00"} or null = tidak difilter
let myUserId = null, myEmail = null, isAdmin = false;
let myUsername = null, myGender = null, myAge = null, myAvatarUrl = null;
let profilesMap = {}; // { userId: username } -- dipakai untuk menampilkan nama penulis testimoni
let visitedIds = new Set(); // ID resto yang sudah ditandai dikunjungi OLEH USER INI (personal, tidak memengaruhi orang lain)
let wishlistIds = new Set(); // ID resto yang di-wishlist OLEH USER INI (personal, tidak memengaruhi orang lain)
let seenRestoIds = new Set(); // ID resto baru yang sudah DILIHAT oleh user ini (untuk badge notifikasi resto baru)
let visitFilter = null; // null | 'visited' | 'unvisited'
let wishlistFilter = null; // null | 'wishlist'
let currentDetailPhotos = []; // foto kunjungan resto yang sedang dibuka, terurut terbaru duluan (dipakai carousel + lightbox)

/* ================= SUPABASE CLIENT ================= */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
