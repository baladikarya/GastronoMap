/* ================= RATING BINTANG ================= */
const RATING_CRITERIA = [
  {key:'harga', label:'Harga'},
  {key:'porsi', label:'Porsi'},
  {key:'rasa', label:'Rasa'},
  {key:'suasana', label:'Suasana'},
  {key:'kebersihan', label:'Kebersihan'},
  {key:'pelayanan', label:'Pelayanan'}
];

function computeRatingSummary(ratings){
  ratings = ratings || [];
  if(ratings.length === 0) return {overall:0, overallCount:0, byCriteria:{}};
  const byCriteria = {};
  RATING_CRITERIA.forEach(c=>{
    const vals = ratings.map(r=>r[c.key]).filter(v=>typeof v === 'number');
    byCriteria[c.key] = {avg: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0, count: vals.length};
  });
  // Overall rating berdiri sendiri, TIDAK dihitung dari rata-rata 5 kriteria detail,
  // supaya satu kriteria rendah (mis. harga) tidak menjatuhkan kesan keseluruhan resto.
  // Fallback: entri rating lama (sebelum fitur ini) yang belum punya field 'overall'
  // dihitung dari rata-rata kriteria yang tersedia saat itu, supaya data lama tidak hilang.
  const overallVals = ratings.map(r=>{
    if(typeof r.overall === 'number') return r.overall;
    const legacyVals = RATING_CRITERIA.map(c=>r[c.key]).filter(v=>typeof v === 'number');
    return legacyVals.length ? legacyVals.reduce((a,b)=>a+b,0)/legacyVals.length : null;
  }).filter(v=>typeof v === 'number');
  const overall = overallVals.length ? overallVals.reduce((a,b)=>a+b,0)/overallVals.length : 0;
  return {overall, overallCount: overallVals.length, byCriteria};
}

/* Susun breakdown rating per kriteria jadi dua kolom (kiri diisi duluan dari atas
   ke bawah, baru lanjut kolom kanan), dengan label|bintang|angka masing-masing
   kolom sejajar rapi via CSS grid -- sesuai contoh tampilan yang diminta. */
function buildRatingBreakdownRowsHtml(summary){
  const half = Math.ceil(RATING_CRITERIA.length / 2);
  const renderCrit = (c, isRight)=>{
    if(!c) return '';
    const cd = summary.byCriteria[c.key];
    const nameClass = 'crit-name' + (isRight ? ' rb-right' : '');
    if(cd && cd.count > 0){
      return `<span class="${nameClass}">${c.label}</span><span class="stars-display">${renderStars(cd.avg)}</span><span class="rating-count">${cd.avg.toFixed(1)}</span>`;
    }
    return `<span class="${nameClass}" style="opacity:0.5;">${c.label}</span><span class="crit-empty" style="grid-column:span 2;">belum dinilai</span>`;
  };
  let rowsHtml = '';
  for(let i = 0; i < half; i++){
    rowsHtml += `<div class="rb-row">${renderCrit(RATING_CRITERIA[i], false)}${renderCrit(RATING_CRITERIA[i + half], true)}</div>`;
  }
  return rowsHtml;
}

function renderStars(value){
  // Mengikuti nilai desimal secara presisi (mis. 2.5 -> 2 bintang penuh + setengah + 2 kosong),
  // dengan cara menumpuk teks bintang kosong (background) & bintang penuh (foreground, dipotong
  // sesuai persentase) di atasnya -- bukan sekadar dibulatkan ke bintang terdekat.
  const v = Math.max(0, Math.min(5, (typeof value === 'number' && !isNaN(value)) ? value : 0));
  const pct = (v / 5 * 100).toFixed(1);
  return `<span class="star-rating-wrap"><span class="star-rating-bg">☆☆☆☆☆</span><span class="star-rating-fg" style="width:${pct}%">★★★★★</span></span>`;
}

/* ================= INIT MAP ================= */
function initMap(){
  map = L.map('map', {zoomControl:false}).setView([-6.2088, 106.8456], 13); // Jakarta default
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  L.control.zoom({position:'bottomleft'}).addTo(map);
  markersLayer = L.markerClusterGroup({
    maxClusterRadius: 55,          // pin dalam radius ini (piksel) digabung jadi 1 cluster
    spiderfyOnMaxZoom: true,       // di zoom maksimal, pin yang masih numpuk dipisah otomatis (efek "spider")
    showCoverageOnHover: false,    // tidak perlu highlight area cakupan saat hover, biar ringan
    disableClusteringAtZoom: 18,   // di zoom sangat dekat, tampilkan semua pin satu-satu
    iconCreateFunction: function(cluster){
      const count = cluster.getChildCount();
      const size = count < 10 ? 36 : count < 50 ? 42 : 48;
      return L.divIcon({
        html: `<div class="cluster-badge" style="width:${size}px;height:${size}px;">${count}</div>`,
        className: '', iconSize: [size, size]
      });
    }
  }).addTo(map);

  map.on('click', (e) => {
    if(pickingLocationMode){
      placeDraggableMarker(e.latlng.lat, e.latlng.lng, 'tap peta', 'manual');
    } else if(quickPinMarker){
      // Tap di tempat lain (bukan pin-nya sendiri) saat belum ada form terbuka -> batalkan pin sementara.
      map.removeLayer(quickPinMarker);
      quickPinMarker = null;
    } else {
      closePreviewCard(); // tap area kosong peta -> tutup preview card yang sedang tampil (kalau ada)
    }
  });

  // Tap-tahan di peta (seperti Google Maps) untuk menjatuhkan pin lokasi resto baru,
  // TANPA perlu buka form dulu. Leaflet menerjemahkan long-press di HP maupun klik-kanan
  // di desktop sebagai event 'contextmenu'. Pin ini baru sekadar preview -- begitu pin
  // ditekan, baru form Tambah Resto dibuka dengan lokasi ini sudah terisi.
  map.on('contextmenu', (e) => {
    if(pickingLocationMode) return; // form sedang aktif, biarkan alur tap-di-form yang menangani
    dropQuickPin(e.latlng.lat, e.latlng.lng);
  });

  navigator.geolocation && navigator.geolocation.getCurrentPosition(pos=>{
    map.setView([pos.coords.latitude, pos.coords.longitude], 14);
  }, ()=>{}, {timeout:4000});
}

/* ================= AUTOCOMPLETE LOKASI =================
   Fitur ini HANYA berfungsi di versi PWA yang sudah di-hosting (bukan di dalam Claude.ai),
   karena butuh memanggil server pencarian lokasi secara langsung.

   ARSITEKTUR PROVIDER-AGNOSTIC — baca ini sebelum ganti ke Google Places UI Kit:
   `searchLocation()` di bawah cuma mengurus UI (render sugesti, klik, dsb). Sumber datanya
   dipisah ke fungsi provider terpisah (lihat LOCATION_SEARCH_PROVIDER). Supaya nanti tinggal
   tambah fungsi provider baru (mis. fetchCandidates_GooglePlacesUIKit) dan ganti nilai
   LOCATION_SEARCH_PROVIDER — TIDAK perlu ubah kode UI, auto-pin, atau drag-pin di bawahnya.

   PENTING soal ToS kalau nanti pakai Google Places UI Kit:
   - Hasil pencarian (lat/lng, alamat) dari provider HANYA boleh dipakai untuk pan peta +
     prefill field alamat (yang tetap editable) — TIDAK pernah dikirim langsung ke Supabase.
   - Koordinat yang benar-benar tersimpan HARUS selalu dibaca dari posisi pin di peta
     (tempMarker.getLatLng()) via placeDraggableMarker(), bukan dari field provider.
     Pola ini SUDAH diterapkan di alur saat ini — jangan diubah saat swap provider. */
const LOCATION_SEARCH_PROVIDER = 'google_places_ui_kit'; // sebelumnya 'osm' -- lihat fetchCandidates_GooglePlacesUIKit di bawah

let locSearchDebounce = null;
/* Dipakai baik oleh field Nama Resto maupun Alamat -- keduanya cari ke provider yang sama.
   `box` adalah kotak sugesti milik field yang sedang diketik user (nameSuggestions/locSuggestions),
   supaya sugesti selalu muncul tepat di bawah field yang aktif, bukan menempel di field lain. */
async function searchLocation(query, box){
  if(!query || query.length < 3){ box.classList.add('hidden'); return; }
  // Prioritaskan lokasi GPS asli user (kalau ada) supaya sugesti condong ke sekitar
  // posisi dia sekarang, baru fallback ke pusat tampilan peta kalau GPS tidak tersedia --
  // ini juga yang membuat hasil terurut dari yang PALING DEKAT dengan posisi user.
  const bias = myGpsLatLng || map.getCenter();

  box.innerHTML = '<div class="loc-sugg-item" style="color:var(--muted);">Mencari…</div>';
  box.classList.remove('hidden');

  let feats = [];
  if(LOCATION_SEARCH_PROVIDER === 'google_places_ui_kit'){
    // Provider aktif: Google Places UI Kit lewat Edge Function proxy (lihat fetchCandidates_GooglePlacesUIKit).
    // Bentuk hasilnya {name, sub, lat, lng, placeId} -- lat/lng bisa null di sini, baru diisi
    // lewat resolveGooglePlaceDetails() saat user benar-benar klik salah satu sugesti.
    feats = await fetchCandidates_GooglePlacesUIKit(query, bias);
  } else {
    feats = await fetchCandidates_OSM(query, bias);
  }

  if(feats.length === 0){
    box.innerHTML = '<div class="loc-sugg-item" style="color:var(--muted);">Tidak ditemukan, coba kata lain atau pilih manual di peta</div>';
    box.classList.remove('hidden');
    return;
  }
  box.innerHTML = feats.map((f, idx)=>
    `<div class="loc-sugg-item" data-idx="${idx}"><b>${escapeHtml(f.name)}</b><span class="loc-sugg-sub">${escapeHtml(f.sub)}</span></div>`
  ).join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.loc-sugg-item').forEach(el=>{
    el.onclick = async ()=>{
      const idx = Number(el.dataset.idx);
      if(isNaN(idx)) return;
      let f = feats[idx];
      box.classList.add('hidden');

      // Beberapa provider (mis. Google Autocomplete) tidak balikin lat/lng langsung di hasil
      // pencarian -- perlu 1x panggilan Details tambahan HANYA untuk item yang benar-benar
      // diklik user (bukan semua hasil sekaligus, biar hemat kuota).
      if(f.lat == null || f.lng == null){
        showToast('Memuat lokasi…');
        const details = await resolveGooglePlaceDetails(f.placeId);
        if(details.lat == null){ showToast('Gagal memuat lokasi, coba lagi'); return; }
        f = {
          ...f, lat: details.lat, lng: details.lng,
          sub: details.formattedAddress ? details.formattedAddress.split(',').slice(0,4).join(', ') : f.sub
        };
      }

      map.setView([f.lat, f.lng], 17);
      // Pin ditaruh otomatis di titik sugesti, tapi TETAP draggable & TETAP butuh submit form
      // untuk benar-benar tersimpan -- lihat catatan ToS di atas fungsi ini.
      placeDraggableMarker(f.lat, f.lng, 'sugesti alamat', 'auto', { skipReverseGeocode: true });
      enterPinPeek();
      // Nama resto & alamat diisi dari dua komponen sugesti yang sama -- baik dicari dari
      // field Nama Resto maupun field Alamat, hasilnya konsisten mengisi keduanya.
      document.getElementById('f_name').value = f.name;
      document.getElementById('f_address').value = f.sub || f.name;
    };
  });
}

/* ---- Provider: OSM (Photon, fallback Nominatim) -- gratis, tanpa API key ---- */
async function fetchCandidates_OSM(query, bias){
  let feats = [];
  try{
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=id&limit=6&lat=${bias.lat}&lon=${bias.lng}&location_bias_scale=0.9&zoom=15`;
    const res = await fetch(url);
    const geo = await res.json();
    feats = (geo.features || []).map(f=>({
      name: f.properties.name || f.properties.street || 'Lokasi',
      sub: [f.properties.street, f.properties.city, f.properties.state].filter(Boolean).filter(v=>v!==(f.properties.name||f.properties.street)).join(', '),
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      addr: [f.properties.street, f.properties.housenumber, f.properties.city, f.properties.state].filter(Boolean).join(', ')
    }));
  }catch(e){ /* lanjut coba Nominatim */ }

  if(feats.length === 0){
    try{
      // viewbox sebagai preferensi lunak (bukan batas keras) di sekitar ±0.35 derajat (~35km)
      const vb = `${bias.lng-0.35},${bias.lat+0.35},${bias.lng+0.35},${bias.lat-0.35}`;
      const url2 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=6&addressdetails=1&viewbox=${vb}`;
      const res2 = await fetch(url2);
      const arr = await res2.json();
      feats = (arr || []).map(item=>({
        name: item.display_name.split(',')[0],
        sub: item.display_name.split(',').slice(1,4).join(',').trim(),
        lat: parseFloat(item.lat), lng: parseFloat(item.lon),
        addr: item.display_name
      }));
    }catch(e){ /* biarkan feats tetap kosong, tangani di pemanggil */ }
  }

  // Urutkan eksplisit dari yang PALING DEKAT ke posisi bias -- jangan cuma andalkan
  // ranking bawaan provider, supaya hasilnya konsisten "terdekat dulu" apa pun sumbernya.
  feats.forEach(f=>{ f._distDeg = Math.hypot(f.lat - bias.lat, f.lng - bias.lng); });
  feats.sort((a,b)=> a._distDeg - b._distDeg);

  return feats;
}

/* ---- Provider: Google Places UI Kit (via Supabase Edge Function proxy) ----
   Ingat: Places UI Kit boleh digabung basemap non-Google (Leaflet/OSM) sesuai Service
   Specific Terms pasal 15.1. Panggilan SELALU lewat Edge Function proxy (bukan langsung ke
   Google dari browser) supaya API key tidak pernah terekspos di static hosting GitHub Pages. */
const PLACES_PROXY_URL = `${SUPABASE_URL}/functions/v1/places-search`;

// Session token per sesi pencarian -- WAJIB supaya Google menagih per SESI (dari ketik
// pertama sampai pilih hasil), bukan per keystroke. Token baru dibuat begitu user mulai
// mengetik dari kosong, lalu "dipakai habis" pas resolveGooglePlaceDetails() dipanggil.
let currentSessionToken = null;
function getOrCreateSessionToken(){
  if(!currentSessionToken) currentSessionToken = crypto.randomUUID();
  return currentSessionToken;
}
function resetSessionToken(){
  currentSessionToken = null;
}

async function fetchCandidates_GooglePlacesUIKit(query, bias){
  try{
    const res = await fetch(PLACES_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'autocomplete',
        query, lat: bias.lat, lng: bias.lng,
        sessionToken: getOrCreateSessionToken(),
      }),
    });
    if(!res.ok) throw new Error(`proxy status ${res.status}`);
    const data = await res.json();
    const suggestions = data.suggestions || [];
    // Autocomplete (New) sengaja TIDAK balikin lat/lng di sini -- baru diambil lewat
    // resolveGooglePlaceDetails() saat user benar-benar klik salah satu (hemat kuota,
    // lihat penyesuaian di onclick handler searchLocation()).
    const feats = suggestions.map(s => ({
      name: s.placePrediction?.structuredFormat?.mainText?.text || s.placePrediction?.text?.text || 'Lokasi',
      sub: s.placePrediction?.structuredFormat?.secondaryText?.text || '',
      placeId: s.placePrediction?.placeId,
      distanceMeters: s.placePrediction?.distanceMeters ?? Infinity,
      lat: null, lng: null,
    })).filter(f => f.placeId);
    // Urutkan terdekat dulu -- distanceMeters cuma ada kalau Edge Function mengirim
    // parameter `origin` ke Google (lihat places-search-edge-function.ts).
    feats.sort((a,b)=> a.distanceMeters - b.distanceMeters);
    return feats;
  }catch(e){
    console.error('Google Places autocomplete gagal:', e);
    showToast('Pencarian Google gagal, coba lagi');
    return [];
  }
}

/* Dipanggil dari onclick sugesti di searchLocation() saat provider Google -- 1x panggilan
   Place Details untuk dapat koordinat + alamat lengkap dari kandidat yang dipilih user. */
async function resolveGooglePlaceDetails(placeId){
  try{
    const res = await fetch(PLACES_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'details', placeId, sessionToken: getOrCreateSessionToken() }),
    });
    const data = await res.json();
    resetSessionToken(); // sesi selesai -- token berikutnya dibuat baru utk pencarian berikutnya
    return {
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      formattedAddress: data.formattedAddress || null,
    };
  }catch(e){
    console.error('Google Place Details gagal:', e);
    return { lat: null, lng: null, formattedAddress: null };
  }
}

/* ================= REVERSE GEOCODE (alamat dari posisi pin) =================
   Dipakai setiap kali pin ditaruh/digeser secara manual (tap peta, GPS, atau drag),
   supaya field Alamat SELALU mengikuti posisi pin yang terakhir -- bukan malah pin yang
   mengikuti alamat lama. Sama seperti pencarian alamat, ini cuma SARAN yang mengisi field
   editable; belum tersimpan ke Supabase sampai form di-submit. Provider-agnostic seperti
   fetchCandidates_* di atas -- swap ke Google tinggal ganti LOCATION_SEARCH_PROVIDER. */
async function reverseGeocodeAddress(lat, lng){
  if(LOCATION_SEARCH_PROVIDER === 'google_places_ui_kit'){
    return await reverseGeocode_GooglePlacesUIKit(lat, lng);
  }
  return await reverseGeocode_OSM(lat, lng);
}

async function reverseGeocode_OSM(lat, lng){
  try{
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
    const res = await fetch(url);
    const data = await res.json();
    if(data && data.display_name){
      // Potong jadi ~4 komponen pertama (kira-kira setara level kecamatan) biar tidak
      // sepanjang alamat lengkap Nominatim yang suka sampai kode pos & negara.
      return data.display_name.split(',').map(s=>s.trim()).slice(0,4).join(', ');
    }
  }catch(e){ /* gagal senyap -- field alamat dibiarkan seperti sebelumnya */ }
  return null;
}

/* Reverse geocode lewat Edge Function proxy (action:'reverse', pakai Geocoding API di sisi
   server -- lihat places-search-edge-function.ts). Ini SARAN saja utk field editable, jadi
   batas caching 30 hari dari ToS Google tidak relevan di sini -- tidak ada yang disimpan mentah. */
async function reverseGeocode_GooglePlacesUIKit(lat, lng){
  try{
    const res = await fetch(PLACES_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reverse', lat, lng }),
    });
    const data = await res.json();
    return data.formattedAddress || null;
  }catch(e){
    console.error('Google reverse geocode gagal:', e);
    return null;
  }
}

/* ================= BANTUAN ALAMAT (buka OSM di tab baru, tanpa fetch) ================= */
/* state: 'auto' (baru dipilih dari sugesti/GPS/koordinat, belum disentuh) atau

   'manual' (sudah digeser tangan sendiri oleh user) -- dua kondisi ini sengaja dibedakan
   secara visual, supaya selalu jelas mana koordinat yang murni hasil aksi user vs yang
   masih titik awal sugesti (relevan untuk kepatuhan ToS provider pencarian yang dipakai). */
function setPinStatus(text, state){
  const el = document.getElementById('pinStatusCaption');
  if(!el) return;
  if(!state){
    // Idle/hint default -- box ini sengaja disembunyikan total, bukan cuma diganti teks.
    el.classList.add('hidden');
    el.innerHTML = '';
    el.classList.remove('has-location', 'pin-manual');
    document.getElementById('adjustPinLinkBtn').classList.toggle('hidden', !state);
    return;
  }
  const icon = state === 'manual' ? '✋' : '📍';
  el.innerHTML = `<span class="pin-status-icon">${icon}</span><span>${escapeHtml(text)}</span>`;
  el.classList.remove('has-location', 'pin-manual', 'hidden');
  if(state === 'manual') el.classList.add('has-location', 'pin-manual');
  else if(state === 'auto') el.classList.add('has-location');
  document.getElementById('adjustPinLinkBtn').classList.toggle('hidden', !state);
}

/* ================= MODE "PASTIKAN PIN" =================
   Form modal biasanya menutupi sebagian besar peta, jadi kalau pin baru ditaruh (dari
   sugesti alamat, GPS, atau paste koordinat) user tidak selalu bisa lihat/geser pin-nya.
   Untuk itu, form disembunyikan SEMENTARA (bukan ditutup -- semua isian tetap tersimpan di
   form) supaya peta terlihat penuh, lalu user tegas menekan "Lanjutkan" untuk kembali ke form. */
function enterPinPeek(){
  setHomeView('map');
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('pinPeekBar').classList.remove('hidden');
  setTimeout(()=> map.invalidateSize(), 50);
}
function exitPinPeek(){
  document.getElementById('pinPeekBar').classList.add('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
}

/* Pin sementara dari tap-tahan di peta utama, sebelum form Tambah Resto dibuka sama sekali.
   Beda dari tempMarker (yang aktif selama form terbuka) -- ini cuma "preview" lokasi;
   user harus tap pin-nya untuk benar-benar lanjut ke form Tambah Resto. */
function dropQuickPin(lat, lng){
  if(!requireLogin()) return;
  if(quickPinMarker) map.removeLayer(quickPinMarker);
  quickPinMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: '', html: '<div class="quick-pin-icon">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] })
  }).addTo(map);
  quickPinMarker.bindTooltip('Tap pin untuk tambah resto di sini', { direction: 'top', offset: [0, -28] }).openTooltip();
  quickPinMarker.on('click', (ev)=>{
    L.DomEvent.stopPropagation(ev); // supaya tidak kena handler map.on('click') yang membatalkan pin
    pendingNewRestoLatLng = { lat, lng };
    map.removeLayer(quickPinMarker);
    quickPinMarker = null;
    openForm(null);
  });
}

/* Menaruh pin SEMENTARA yang bisa digeser (draggable) di peta -- dipakai oleh
   semua cara pilih lokasi (tap peta, sugesti alamat, koordinat, GPS) supaya
   user selalu bisa lihat dulu & koreksi posisinya sebelum lanjut isi data.
   Pin ini TIDAK langsung tersimpan -- baru jadi data resmi saat form di-submit.
   opts.skipReverseGeocode: pakai saat alamat sudah pasti akurat dari sumbernya sendiri
   (mis. hasil klik sugesti pencarian) sehingga tidak perlu reverse-geocode ulang. */
async function placeDraggableMarker(lat, lng, sourceLabel, initialState, opts){
  opts = opts || {};
  pickedLatLng = L.latLng(lat, lng);
  if(tempMarker) map.removeLayer(tempMarker);
  tempMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
  tempMarker.on('dragend', async ()=>{
    const pos = tempMarker.getLatLng();
    pickedLatLng = pos;
    setPinStatus(`Posisi disesuaikan manual: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`, 'manual');
    // Pin yang menentukan, alamat yang mengikuti -- bukan sebaliknya.
    const suggested = await reverseGeocodeAddress(pos.lat, pos.lng);
    if(suggested) document.getElementById('f_address').value = suggested;
  });
  tempMarker.on('click', ()=>{
    showToast('📍 Lokasi ini yang akan dipakai. Geser pin kalau kurang pas, lalu lanjutkan isi data resto.');
  });
  const state = initialState || 'auto';
  const label = state === 'manual' ? 'Lokasi dipilih' : 'Pin otomatis ditempatkan';
  setPinStatus(`${label}${sourceLabel ? ' (' + sourceLabel + ')' : ''}: ${lat.toFixed(5)}, ${lng.toFixed(5)}. Geser kalau kurang pas.`, state);
  if(!opts.skipReverseGeocode){
    const suggested = await reverseGeocodeAddress(lat, lng);
    if(suggested) document.getElementById('f_address').value = suggested;
  }
  return tempMarker;
}

/* Ambil lokasi HP user SEKARANG dengan akurasi tinggi, langsung taruh pin di situ
   (beda dari tombol kompas di peta yang cuma menggeser tampilan peta). */
function useMyLocationNow(){
  if(!navigator.geolocation){ showToast('HP/browser ini tidak mendukung deteksi lokasi'); return; }
  const btn = document.getElementById('useMyLocationBtn');
  const originalText = btn.textContent;
  btn.textContent = '📍 Mencari lokasi presisi...';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      map.setView([lat, lng], 18);
      placeDraggableMarker(lat, lng, `GPS HP, akurasi ±${Math.round(accuracy)}m`);
      enterPinPeek();
      showToast(accuracy > 50 ? 'Lokasi ditaruh, tapi akurasi GPS agak rendah -- cek & geser pin kalau perlu' : 'Pin ditaruh di lokasi Anda -- geser kalau kurang pas, lalu lanjut isi data');
      btn.textContent = originalText;
      btn.disabled = false;
    },
    (err)=>{
      showToast('Gagal mengambil lokasi: ' + (err.message || 'izin lokasi ditolak'));
      btn.textContent = originalText;
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

/* ================= IKON PLATFORM (dari file, fallback ke emoji kalau file belum ada) =================
   Taruh file logo di folder icons/platforms/ dengan nama PERSIS seperti berikut (PNG, latar transparan,
   disarankan persegi ~64x64px): gofood.png, grabfood.png, shopeefood.png, youtube.png, instagram.png,
   tiktok.png, facebook.png, other.png
   Kalau file belum diupload, otomatis tampil emoji sebagai pengganti sementara -- tidak akan error. */
function platformIconHtml(fileKey, fallbackEmoji, size){
  size = size || 20;
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;vertical-align:middle;">`
    + `<img src="icons/platforms/${fileKey}.png" alt="" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:4px;" `
    + `onerror="this.outerHTML='<span style=&quot;font-size:${Math.round(size*0.85)}px;line-height:1;&quot;>${fallbackEmoji}</span>';">`
    + `</span>`;
}

/* ================= FILTER CHIPS ================= */
const PLATFORM_FILTER_META = {
  GrabFood:   {emoji:'🥡', color:'#00B14F', file:'grabfood'},
  GoFood:     {emoji:'🛵', color:'#00AA13', file:'gofood'},
  ShopeeFood: {emoji:'🛍️', color:'#EE4D2D', file:'shopeefood'}
};
const PRICE_RANGES = ['< Rp 25rb', 'Rp 25rb - 50rb', 'Rp 50rb - 100rb', 'Rp 100rb - 250rb', '> Rp 250rb'];

let activePlatformFilters = new Set();
let activePriceFilters = new Set();
let homeView = 'map'; // 'map' | 'list'
let openNowFilter = false;
let currentPreviewRestoId = null;
const DEFAULT_NEARBY_RADIUS_KM = 5;
let nearbyRadiusKm = DEFAULT_NEARBY_RADIUS_KM;

function renderFilterChips(){
  const wrap = document.getElementById('filters');
  wrap.innerHTML = '';

  const listBtn = document.createElement('button');
  listBtn.type = 'button';
  listBtn.id = 'openListBtn';
  listBtn.innerHTML = '☰ <span>List</span>';
  listBtn.onclick = toggleNearbyList;
  wrap.appendChild(listBtn);

  const filterBtn = document.getElementById('searchFilterBtn');
  if(filterBtn) filterBtn.onclick = openFilterPanel;

  renderTypeCheckList();
  renderPlatformCheckList();
  renderPriceCheckList();
  updateFilterBtnLabel();
  updateHomeViewControls();
}

function updateHomeViewControls(){
  const listBtn = document.getElementById('openListBtn');
  if(listBtn){
    const active = homeView === 'list';
    listBtn.classList.toggle('active', active);
    listBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function setHomeView(view){
  if(view !== 'map' && view !== 'list') return;
  const openingList = view === 'list' && homeView !== 'list';
  if(openingList) nearbyRadiusKm = DEFAULT_NEARBY_RADIUS_KM;
  homeView = view;
  const listEl = document.getElementById('listView');
  listEl.classList.toggle('hidden', view !== 'list');
  if(view === 'list'){
    closePreviewCard();
    renderNearbyList(getFilteredRestos());
  }
  updateHomeViewControls();
  if(map) requestAnimationFrame(()=> map.invalidateSize());
}

function toggleNearbyList(){
  if(homeView === 'list'){
    setHomeView('map');
    return;
  }
  setHomeView('list');
  refreshNearbyListLocation();
}

function refreshNearbyListLocation(){
  if(!navigator.geolocation){
    renderNearbyLocationState('Perangkat ini tidak mendukung deteksi lokasi.');
    return;
  }
  if(!myGpsLatLng) renderNearbyLocationState('Mencari posisi Anda…', true);
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      myGpsLatLng = {lat:pos.coords.latitude, lng:pos.coords.longitude};
      if(homeView === 'list') renderNearbyList(getFilteredRestos());
    },
    ()=>{
      if(homeView === 'list' && !myGpsLatLng){
        renderNearbyLocationState(`Aktifkan izin lokasi untuk melihat resto dalam radius ${nearbyRadiusKm} km dari posisi Anda.`);
      }
    },
    {enableHighAccuracy:true, timeout:12000, maximumAge:60000}
  );
}

function buildNearbyPanelHeader(){
  return `<div class="home-list-head"><div><div class="home-list-title">Resto terdekat</div><div class="home-list-sub">Diurutkan dari posisi Anda</div></div><button type="button" class="home-list-close" aria-label="Tutup list">✕</button></div>
    <div class="home-radius-control">
      <div class="home-radius-row"><span>Radius pencarian</span><strong id="nearbyRadiusValue">${nearbyRadiusKm} km</strong></div>
      <input id="nearbyRadiusRange" class="home-radius-range" type="range" min="1" max="10" step="1" value="${nearbyRadiusKm}" aria-label="Radius resto terdekat dalam kilometer">
      <div class="home-radius-scale"><span>1 km</span><span>10 km</span></div>
    </div>`;
}

function bindNearbyPanelControls(){
  const list = document.getElementById('listView');
  const closeBtn = list.querySelector('.home-list-close');
  if(closeBtn) closeBtn.onclick = ()=> setHomeView('map');

  const range = list.querySelector('#nearbyRadiusRange');
  if(range){
    range.oninput = ()=>{
      nearbyRadiusKm = Math.max(1, Math.min(10, Number(range.value) || DEFAULT_NEARBY_RADIUS_KM));
      const valueEl = document.getElementById('nearbyRadiusValue');
      if(valueEl) valueEl.textContent = `${nearbyRadiusKm} km`;
      renderNearbyListResults(getFilteredRestos());
    };
  }
}

function renderNearbyLocationState(message, loading=false){
  const list = document.getElementById('listView');
  list.innerHTML = buildNearbyPanelHeader() + `<div id="nearbyListResults"><div class="home-empty"><b>${escapeHtml(message)}</b>${loading ? '' : '<br><button type="button" class="home-location-btn">Gunakan Lokasi Saya</button>'}</div></div>`;
  bindNearbyPanelControls();
  const locationBtn = list.querySelector('.home-location-btn');
  if(locationBtn) locationBtn.onclick = refreshNearbyListLocation;
}

function setFilterAccordionSection(sectionName){
  document.querySelectorAll('#filterPanel .filter-section').forEach(section=>{
    const shouldOpen = section.dataset.filterSection === sectionName;
    section.classList.toggle('expanded', shouldOpen);
    const head = section.querySelector('.filter-section-head');
    if(head) head.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  });
}

function initFilterPanelInteractions(){
  const panel = document.getElementById('filterPanel');
  if(!panel || panel.dataset.interactionsReady === '1') return;
  panel.dataset.interactionsReady = '1';

  panel.querySelectorAll('.filter-section-head').forEach(head=>{
    head.onclick = ()=>{
      const section = head.closest('.filter-section');
      const isOpen = section.classList.contains('expanded');
      if(isOpen){
        section.classList.remove('expanded');
        head.setAttribute('aria-expanded','false');
      }else{
        setFilterAccordionSection(section.dataset.filterSection);
      }
    };
  });

  panel.querySelectorAll('[data-hours-mode]').forEach(btn=>{
    btn.onclick = ()=> setFilterHoursMode(btn.dataset.hoursMode);
  });

  document.getElementById('tf_day').onchange = updateFilterDraftUI;
  document.getElementById('tf_time').oninput = updateFilterDraftUI;

  panel.querySelectorAll('[data-visit-value]').forEach(btn=>{
    btn.onclick = ()=>{
      document.getElementById('visitFilterSelect').value = btn.dataset.visitValue;
      updateFilterDraftUI();
    };
  });

  document.getElementById('wishlistFilterChip').onclick = ()=>{
    const select = document.getElementById('wishlistFilterSelect');
    select.value = select.value === 'wishlist' ? '' : 'wishlist';
    updateFilterDraftUI();
  };

  panel.querySelectorAll('[data-clear-filter]').forEach(btn=>{
    btn.onclick = ()=>{
      const kind = btn.dataset.clearFilter;
      const selector = kind === 'type' ? '#typeCheckList input'
        : kind === 'online' ? '#platformCheckList input'
        : '#priceCheckList input';
      document.querySelectorAll(selector).forEach(input=>{
        input.checked = false;
        input.closest('.filter-check-chip')?.classList.remove('checked');
      });
      updateFilterDraftUI();
    };
  });
}

function setFilterHoursMode(mode){
  const openNowInput = document.getElementById('openNowFilterInput');
  const customInput = document.getElementById('tf_enable');
  openNowInput.checked = mode === 'now';
  customInput.checked = mode === 'custom';
  document.getElementById('customTimeFields').classList.toggle('hidden', mode !== 'custom');
  updateFilterDraftUI();
}

function getFilterHoursMode(){
  if(document.getElementById('openNowFilterInput').checked) return 'now';
  if(document.getElementById('tf_enable').checked) return 'custom';
  return 'any';
}

function summarizeChecked(containerId){
  const checked = Array.from(document.querySelectorAll(`#${containerId} input:checked`));
  if(checked.length === 0) return 'Semua';
  if(checked.length === 1) return checked[0].value;
  return `${checked.length} dipilih`;
}

function countFilterDraft(){
  const typeCount = document.querySelectorAll('#typeCheckList input:checked').length;
  const platformCount = document.querySelectorAll('#platformCheckList input:checked').length;
  const priceCount = document.querySelectorAll('#priceCheckList input:checked').length;
  const hoursCount = getFilterHoursMode() === 'any' ? 0 : 1;
  const visitCount = document.getElementById('visitFilterSelect').value ? 1 : 0;
  const wishlistCount = document.getElementById('wishlistFilterSelect').value ? 1 : 0;
  return typeCount + platformCount + priceCount + hoursCount + visitCount + wishlistCount;
}

function updateFilterDraftUI(){
  const hoursMode = getFilterHoursMode();
  document.querySelectorAll('[data-hours-mode]').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.hoursMode === hoursMode);
  });
  document.getElementById('customTimeFields').classList.toggle('hidden', hoursMode !== 'custom');

  const hoursSummary = hoursMode === 'now'
    ? 'Buka sekarang'
    : hoursMode === 'custom'
      ? `${document.getElementById('tf_day').value} ${document.getElementById('tf_time').value || currentTimeStr()}`
      : 'Kapan saja';
  document.getElementById('filterHoursSummary').textContent = hoursSummary;
  document.getElementById('filterTypeSummary').textContent = summarizeChecked('typeCheckList');
  document.getElementById('filterOnlineSummary').textContent = summarizeChecked('platformCheckList');
  document.getElementById('filterPriceSummary').textContent = summarizeChecked('priceCheckList');

  const visitValue = document.getElementById('visitFilterSelect').value;
  const wishlistValue = document.getElementById('wishlistFilterSelect').value;
  document.querySelectorAll('[data-visit-value]').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.visitValue === visitValue);
  });
  const wishlistBtn = document.getElementById('wishlistFilterChip');
  wishlistBtn.classList.toggle('active', wishlistValue === 'wishlist');
  wishlistBtn.textContent = wishlistValue === 'wishlist' ? '♥ Wishlist' : '♡ Wishlist';

  const statusParts = [];
  if(visitValue === 'visited') statusParts.push('Sudah dikunjungi');
  if(visitValue === 'unvisited') statusParts.push('Belum dikunjungi');
  if(wishlistValue === 'wishlist') statusParts.push('Wishlist');
  document.getElementById('filterStatusSummary').textContent = statusParts.length ? statusParts.join(' + ') : 'Semua';

  ['typeCheckList','platformCheckList','priceCheckList'].forEach(id=>{
    document.querySelectorAll(`#${id} .filter-check-chip`).forEach(chip=>{
      const input = chip.querySelector('input');
      chip.classList.toggle('checked', !!input?.checked);
    });
  });

  const count = countFilterDraft();
  document.getElementById('filterApplyAllBtn').textContent = count > 0 ? `Terapkan Filter (${count})` : 'Terapkan Filter';
}

function openFilterPanel(){
  renderTypeCheckList();
  renderPlatformCheckList();
  renderPriceCheckList();
  initFilterPanelInteractions();

  document.getElementById('openNowFilterInput').checked = !!openNowFilter;
  document.getElementById('tf_enable').checked = !!timeFilter && !openNowFilter;
  document.getElementById('tf_day').value = timeFilter ? timeFilter.day : currentDayName();
  document.getElementById('tf_time').value = timeFilter ? timeFilter.time : currentTimeStr();
  document.getElementById('visitFilterSelect').value = visitFilter || '';
  document.getElementById('wishlistFilterSelect').value = wishlistFilter || '';

  setFilterAccordionSection('hours');
  updateFilterDraftUI();
  document.getElementById('filterOverlay').classList.remove('hidden');
}

function makeCheckChip(container, value, label, checkedSet){
  const chip = document.createElement('label');
  chip.className = 'filter-check-chip' + (checkedSet.has(value) ? ' checked' : '');
  chip.innerHTML = `<input type="checkbox" value="${escapeAttr(value)}" ${checkedSet.has(value) ? 'checked' : ''}> <span>${label}</span>`;
  chip.querySelector('input').onchange = (e)=>{
    chip.classList.toggle('checked', e.target.checked);
    updateFilterDraftUI();
  };
  container.appendChild(chip);
}

function renderTypeCheckList(){
  const list = document.getElementById('typeCheckList');
  list.innerHTML = '';
  Object.keys(TYPES).forEach(t=> makeCheckChip(list, t, `${TYPES[t].emoji} ${t}`, activeTypeFilters));
}

function renderPlatformCheckList(){
  const list = document.getElementById('platformCheckList');
  list.innerHTML = '';
  Object.keys(PLATFORM_FILTER_META).forEach(p=> makeCheckChip(list, p, `${platformIconHtml(PLATFORM_FILTER_META[p].file, PLATFORM_FILTER_META[p].emoji, 16)} ${p}`, activePlatformFilters));
}

function renderPriceCheckList(){
  const list = document.getElementById('priceCheckList');
  list.innerHTML = '';
  PRICE_RANGES.forEach(p=> makeCheckChip(list, p, p, activePriceFilters));
}

function updateFilterBtnLabel(){
  const btn = document.getElementById('searchFilterBtn');
  const badge = document.getElementById('searchFilterCount');
  if(!btn || !badge) return;
  const count = activeTypeFilters.size + activePlatformFilters.size + activePriceFilters.size + (openNowFilter ? 1 : 0) + (timeFilter ? 1 : 0) + (visitFilter ? 1 : 0) + (wishlistFilter ? 1 : 0);
  btn.classList.toggle('active', count > 0);
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
  btn.setAttribute('aria-label', count > 0 ? `Buka filter, ${count} aktif` : 'Buka filter');
}

function populateTypeSelect(){
  const sel = document.getElementById('f_type');
  sel.innerHTML = '';
  Object.keys(TYPES).forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = `${TYPES[t].emoji} ${t}`;
    sel.appendChild(opt);
  });
}

function initPlatformPicker(){
  const fieldWrap = document.getElementById('platformPickerField');
  // Ketersediaan Online sekarang wajib disertai link saat dipilih (tidak boleh toggle
  // tanpa link lagi), dan link cuma boleh diisi admin di form ini. User biasa
  // mengusulkan link lewat halaman detail resto (lihat openLinkSubmitPopup), jadi
  // field ini disembunyikan total untuk mereka di form Tambah/Edit Resto.
  fieldWrap.classList.toggle('hidden', !isAdmin);
  if(isAdmin){
    const wrap = document.getElementById('platformPicker');
    wrap.innerHTML = Object.keys(PLATFORM_FILTER_META).map(p=>{
      const meta = PLATFORM_FILTER_META[p];
      return `<div class="platform-url-row" data-platform="${p}">
        <div class="platform-toggle" data-platform="${p}" style="--pcolor:${meta.color}">${platformIconHtml(meta.file, meta.emoji, 16)} ${p}</div>
        <input type="url" class="platform-url-input" data-platform="${p}" placeholder="Wajib isi link langsung ke resto di ${p}">
      </div>`;
    }).join('');
    wrap.querySelectorAll('.platform-toggle').forEach(el=>{
      el.onclick = ()=>{
        el.classList.toggle('active');
        const input = wrap.querySelector(`.platform-url-input[data-platform="${el.dataset.platform}"]`);
        input.classList.toggle('hidden', !el.classList.contains('active'));
        if(!el.classList.contains('active')) input.value = '';
      };
    });
    wrap.querySelectorAll('.platform-url-input').forEach(el=> el.classList.add('hidden')); // sembunyi sampai toggle diaktifkan
  }
  document.querySelectorAll('#paymentPicker .platform-toggle').forEach(el=>{
    el.onclick = ()=> el.classList.toggle('active');
  });
}

/* ================= JAM PER HARI (form) ================= */
function renderDayHoursRows(hoursByDay){
  const wrap = document.getElementById('dayHoursList');
  wrap.innerHTML = '';
  DAYS.forEach(day=>{
    const d = hoursByDay[day];
    const row = document.createElement('div');
    row.className = 'day-row';
    row.dataset.day = day;
    row.innerHTML = `
      <span class="day-label">${day}</span>
      <input type="time" class="open-time" value="${d.open}" ${d.closed ? 'disabled' : ''}>
      <span class="sep">–</span>
      <input type="time" class="close-time" value="${d.close}" ${d.closed ? 'disabled' : ''}>
      <label class="closed-toggle"><input type="checkbox" class="closed-check" ${d.closed ? 'checked' : ''}> Tutup</label>
    `;
    const checkbox = row.querySelector('.closed-check');
    const openInp = row.querySelector('.open-time');
    const closeInp = row.querySelector('.close-time');
    checkbox.onchange = ()=>{
      openInp.disabled = checkbox.checked;
      closeInp.disabled = checkbox.checked;
    };
    wrap.appendChild(row);
  });
}

function readDayHoursFromForm(){
  const h = {};
  document.querySelectorAll('#dayHoursList .day-row').forEach(row=>{
    const day = row.dataset.day;
    h[day] = {
      closed: row.querySelector('.closed-check').checked,
      open: row.querySelector('.open-time').value || '08:00',
      close: row.querySelector('.close-time').value || '22:00'
    };
  });
  return h;
}

/* ================= MENU FAVORIT: normalisasi & ranking ================= */
// Kamus kecil untuk menyatukan varian ejaan umum di Indonesia
const MENU_WORD_MAP = {
  'mi':'mie', 'special':'spesial', 'spesial':'spesial',
  'goreng':'goreng', 'bakar':'bakar', 'rebus':'rebus'
};
function normalizeMenuName(s){
  let n = s.toLowerCase().trim().replace(/[^\w\s]/g,'').replace(/\s+/g,' ');
  n = n.split(' ').map(w => MENU_WORD_MAP[w] || w).join(' ');
  return n;
}
function levenshtein(a, b){
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i)=> [i, ...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j] = j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
function titleCase(s){ return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1)); }

/* Kelompokkan nama menu yang mirip (typo/varian ejaan) jadi satu, hitung suara, ranking top 5 */
function groupAndRankFavorites(list){
  const groups = []; // {normKey, canonical, count}
  (list||[]).filter(Boolean).forEach(raw=>{
    const norm = normalizeMenuName(raw);
    if(!norm) return;
    let group = groups.find(g => g.normKey === norm);
    if(!group){
      // cek kemiripan (typo kecil) dengan grup yang sudah ada
      group = groups.find(g => levenshtein(g.normKey, norm) <= Math.min(2, Math.floor(Math.min(g.normKey.length, norm.length) * 0.3)));
    }
    if(group){
      group.count++;
    }else{
      groups.push({normKey: norm, canonical: titleCase(raw.trim()), count: 1});
    }
  });
  return groups.sort((a,b)=> b.count - a.count).slice(0, 5);
}
function addFavRow(value=''){
  const row = document.createElement('div');
  row.className = 'fav-row';
  row.innerHTML = `<input type="text" placeholder="mis. Nasi Goreng Spesial" value="${escapeAttr(value)}"><button type="button">✕</button>`;
  row.querySelector('button').onclick = ()=> row.remove();
  document.getElementById('favList').appendChild(row);
}

/* ================= STORAGE (Supabase) ================= */
async function refreshAllData(){
  const logo = document.getElementById('logo');
  logo.classList.add('spinning');
  await loadAllRestos();
  await loadVisited();
  logo.classList.remove('spinning');
  showToast('Data diperbarui');
}

async function loadAllRestos(){
  try{
    const [{data: restos}, {data: ratingsRows}, {data: testiRows}, {data: favRows}, {data: refRows}, {data: photoRows}, {data: menuPhotoRows}, {data: profileRows}] = await Promise.all([
      sb.from('restos').select('*'),
      sb.from('ratings').select('*'),
      sb.from('testimonials').select('*'),
      sb.from('favorite_menu').select('*'),
      sb.from('references_link').select('*'),
      sb.from('visit_photos').select('*'),
      sb.from('menu_photos').select('*'),
      sb.from('public_contributor_profiles').select('id, username')
    ]);
    profilesMap = {};
    (profileRows||[]).forEach(p=>{ if(p.username) profilesMap[p.id] = p.username; });
    allRestos = {};
    (restos||[]).forEach(row=>{
      allRestos[row.id] = {
        id: row.id, name: row.name, address: row.address, phone: row.phone, type: row.type,
        priceRange: row.price_range, hoursByDay: row.hours_by_day,
        menuImages: row.menu_images || [], onlinePlatforms: row.online_platforms || [],
        paymentMethods: row.payment_methods || [],
        noOnlineSales: !!row.no_online_sales,
        lat: row.lat, lng: row.lng, createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
        isVerified: !!row.is_verified,
        ratings: [], testimonials: [], favoriteMenu: [], references: [], photos: [], menuPhotos: []
      };
    });
    (ratingsRows||[]).forEach(row=>{
      const r = allRestos[row.resto_id]; if(!r) return;
      const entry = {userId: row.user_id, overall: row.overall, at: new Date(row.created_at).getTime()};
      RATING_CRITERIA.forEach(c=>{ entry[c.key] = row[c.key]; });
      r.ratings.push(entry);
    });
    (testiRows||[]).forEach(row=>{
      const r = allRestos[row.resto_id]; if(!r) return;
      r.testimonials.push({userId: row.user_id, text: row.text, at: new Date(row.updated_at || row.created_at).getTime()});
    });
    (favRows||[]).forEach(row=>{
      const r = allRestos[row.resto_id]; if(!r) return;
      r.favoriteMenu.push(row.menu_name);
    });
    (refRows||[]).forEach(row=>{
      const r = allRestos[row.resto_id]; if(!r) return;
      r.references.push({id: row.id, url: row.url, platform: row.platform, userId: row.user_id, at: new Date(row.created_at).getTime()});
    });
    (photoRows||[]).forEach(row=>{
      const r = allRestos[row.resto_id]; if(!r) return;
      r.photos.push({id: row.id, storagePath: row.storage_path, userId: row.user_id, at: new Date(row.created_at).getTime()});
    });
    (menuPhotoRows||[]).forEach(row=>{
      const r = allRestos[row.resto_id]; if(!r) return;
      r.menuPhotos.push({id: row.id, storagePath: row.storage_path, userId: row.user_id, at: new Date(row.created_at).getTime()});
    });
  }catch(e){
    console.error('Gagal memuat data', e);
    showToast('Gagal memuat data dari server, cek koneksi internet');
  }
  renderMarkers();
}

/* Simpan hanya field INTI resto (dipakai form admin/tambah). Return ID resto. */
async function upsertRestoCore(data){
  const row = {
    name: data.name, address: data.address, phone: data.phone, type: data.type,
    price_range: data.priceRange, hours_by_day: data.hoursByDay,
    menu_images: data.menuImages, online_platforms: data.onlinePlatforms,
    payment_methods: data.paymentMethods,
    lat: data.lat, lng: data.lng, updated_at: new Date().toISOString()
  };
  // Kalau admin mengedit resto yang sudah ada dan menambahkan platform online lewat form ini
  // (mis. resto yang tadinya ditandai "tidak menjual online" ternyata sekarang mulai jualan
  // online, dilaporkan lewat fitur Laporan), sinkronkan status & kolom kunci supaya tetap
  // konsisten dengan sistem poin/leaderboard -- bukan cuma menimpa online_platforms mentah.
  if(data.id && Array.isArray(data.onlinePlatforms) && data.onlinePlatforms.length){
    row.no_online_sales = false;
    const LOCK_COL = { GoFood: 'gofood_locked_by', GrabFood: 'grabfood_locked_by', ShopeeFood: 'shopeefood_locked_by' };
    const { data: existingLocks } = await sb.from('restos')
      .select('gofood_locked_by, grabfood_locked_by, shopeefood_locked_by')
      .eq('id', data.id).maybeSingle();
    data.onlinePlatforms.forEach(p=>{
      const col = LOCK_COL[p.platform];
      // Cuma isi kolom kunci kalau memang masih kosong -- jangan timpa kepemilikan
      // poin user yang sudah lebih dulu mengusulkan link ini lewat alur approval.
      if(col && existingLocks && !existingLocks[col]) row[col] = myUserId;
    });
  }
  if(data.id){
    const { error } = await sb.from('restos').update(row).eq('id', data.id);
    if(error) throw error;
    return data.id;
  }else{
    row.created_by = myUserId;
    // Resto yang ditambahkan langsung oleh admin otomatis dianggap terverifikasi.
    // Resto dari user biasa mulai sebagai belum diverifikasi (default kolom di DB juga false).
    row.is_verified = isAdmin;
    const { data: inserted, error } = await sb.from('restos').insert(row).select('id').single();
    if(error) throw error;
    return inserted.id;
  }
}

/* Toggle status verifikasi resto (khusus admin, enforced juga oleh RLS). */
async function toggleVerified(id, verified){
  const { error } = await sb.from('restos').update({ is_verified: verified, updated_at: new Date().toISOString() }).eq('id', id);
  if(error){ showToast('Gagal mengubah status verifikasi: ' + error.message); return; }
  showToast(verified ? 'Resto ditandai Verified' : 'Resto ditandai Unverified');
}

async function deleteResto(id){
  const { error } = await sb.from('restos').delete().eq('id', id);
  if(error){ showToast('Gagal menghapus: ' + error.message); return; }
  delete allRestos[id];
  renderMarkers();
}

/* ================= PREVIEW CARD + HOME EXPLORATION ================= */
function getHomeRestoPhoto(r){
  const menuImage = (r.menuImages||[]).find(Boolean);
  if(menuImage) return menuImage;
  const menuPhoto = (r.menuPhotos||[])[0];
  if(menuPhoto && menuPhoto.storagePath) return photoPublicUrl(menuPhoto.storagePath);
  const visitPhoto = (r.photos||[])[0];
  if(visitPhoto && visitPhoto.storagePath) return photoPublicUrl(visitPhoto.storagePath);
  return 'icons/icon-192.png';
}

function getHomeOpenStatus(r){
  const day = currentDayName();
  const d = r.hoursByDay && r.hoursByDay[day];
  if(!d) return {label:'Jam belum tersedia', cls:'unknown'};
  if(d.closed) return {label:'Tutup', cls:'closed'};
  const isOpen = isOpenAt(r.hoursByDay, day, currentTimeStr());
  if(isOpen) return {label:d.close ? `Buka · sampai ${d.close}` : 'Buka sekarang', cls:'open'};
  return {label:(d.open && d.close) ? `Tutup · ${d.open}–${d.close}` : 'Tutup', cls:'closed'};
}

function openPreviewCard(id){
  const r = allRestos[id];
  if(!r) return;
  currentPreviewRestoId = id;
  document.getElementById('detailPanel').classList.add('hidden');
  const t = TYPES[r.type] || DEFAULT_TYPE_META;
  const summary = computeRatingSummary(r.ratings);
  const status = getHomeOpenStatus(r);

  const thumb = document.getElementById('pcThumb');
  thumb.src = getHomeRestoPhoto(r);
  thumb.alt = `Foto ${r.name}`;
  thumb.onerror = ()=>{ thumb.src='icons/icon-192.png'; thumb.onerror=null; };

  document.getElementById('pcName').innerHTML = `${escapeHtml(r.name)}${r.isVerified ? '<span class="pc-verified" title="Verified">●</span>' : ''}`;
  document.getElementById('pcRating').innerHTML = summary.overallCount > 0
    ? `⭐ <b>${summary.overall.toFixed(1)}</b> · ${summary.overallCount} ulasan`
    : `${t.emoji} Belum ada rating`;

  const metaParts = [status.label, r.type, r.priceRange].filter(Boolean);
  if(myGpsLatLng){
    const distM = distanceMetersBetween(myGpsLatLng.lat, myGpsLatLng.lng, r.lat, r.lng);
    metaParts.push(distM < 1000 ? `${Math.round(distM)} m` : `${(distM/1000).toFixed(1)} km`);
  }
  if(r.address) metaParts.push(r.address);
  document.getElementById('pcMeta').textContent = metaParts.join(' • ');

  const testi = (r.testimonials||[]).find(x=> x.text);
  const quoteEl = document.getElementById('pcQuote');
  quoteEl.textContent = testi ? `"${testi.text}"` : '';
  quoteEl.style.display = testi ? '' : 'none';

  const heartBtn = document.getElementById('pcHeart');
  heartBtn.textContent = wishlistIds.has(id) ? '❤️' : '🤍';
  heartBtn.onclick = async (e)=>{
    e.stopPropagation();
    await toggleWishlist(id);
    heartBtn.textContent = wishlistIds.has(id) ? '❤️' : '🤍';
  };

  const card = document.getElementById('previewCard');
  card.onclick = ()=>{ closePreviewCard(); openDetail(id); };
  card.classList.remove('hidden');
}
function closePreviewCard(){
  currentPreviewRestoId = null;
  document.getElementById('previewCard').classList.add('hidden');
}

/* ================= MARKERS ================= */
function makeIcon(type, visited, isNew, isVerified){
  const t = TYPES[type] || DEFAULT_TYPE_META;
  const unverifiedClass = isVerified ? '' : ' pin-unverified';
  return L.divIcon({
    className:'',
    html:`<div class="pin-wrap${isNew ? ' pin-new' : ''}${unverifiedClass}"><div class="resto-pin" style="background:${t.color}"><span>${t.emoji}</span></div>${visited ? '<div class="visited-badge">✓</div>' : ''}${isNew ? '<div class="new-badge">!</div>' : ''}</div>`,
    iconSize:[34,34], iconAnchor:[17,34], popupAnchor:[0,-30]
  });
}

function matchesSearch(r, q){
  if(!q) return true;
  const testiText = (r.testimonials||[]).map(t=>t.text||'').join(' ');
  const menuText = (r.favoriteMenu||[]).join(' ');
  const haystack = [r.name, r.address, r.type, r.priceRange, menuText, testiText].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(token=> haystack.includes(token));
}

function getFilteredRestos(){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const nowDay = currentDayName();
  const nowTime = currentTimeStr();
  return Object.values(allRestos).filter(r=>{
    if(activeTypeFilters.size > 0 && !activeTypeFilters.has(r.type)) return false;
    if(activePlatformFilters.size > 0 && !(r.onlinePlatforms||[]).some(p=>activePlatformFilters.has(typeof p === 'string' ? p : p.platform))) return false;
    if(activePriceFilters.size > 0 && !activePriceFilters.has(r.priceRange)) return false;
    if(!matchesSearch(r, q)) return false;
    if(openNowFilter && !isOpenAt(r.hoursByDay, nowDay, nowTime)) return false;
    if(timeFilter && !isOpenAt(r.hoursByDay, timeFilter.day, timeFilter.time)) return false;
    const isVisited = visitedIds.has(r.id);
    if(visitFilter === 'visited' && !isVisited) return false;
    if(visitFilter === 'unvisited' && isVisited) return false;
    if(wishlistFilter === 'wishlist' && !wishlistIds.has(r.id)) return false;
    return true;
  });
}

function formatNearbyDistance(distanceM){
  return distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM/1000).toFixed(1)} km`;
}

function buildHomeRestoCardHtml(r, distanceM){
  const summary = computeRatingSummary(r.ratings||[]);
  const rating = summary.overallCount > 0 ? `${summary.overall.toFixed(1)} ★` : 'Belum ada rating';
  const status = getHomeOpenStatus(r);
  const photo = getHomeRestoPhoto(r);
  const platforms = (r.onlinePlatforms||[]).map(p=> typeof p === 'string' ? p : p.platform).filter(Boolean);
  const tags = [r.type, r.priceRange, platforms.length ? `${platforms.length} layanan online` : null].filter(Boolean);
  const distanceHtml = Number.isFinite(distanceM) ? `<span class="home-resto-distance">${formatNearbyDistance(distanceM)}</span><span class="home-resto-dot">•</span>` : '';
  return `<button type="button" class="home-resto-card" data-resto-id="${escapeAttr(r.id)}" aria-label="Buka detail ${escapeAttr(r.name)}">
    <span class="home-resto-photo"><img src="${escapeAttr(photo)}" loading="lazy" alt="Foto ${escapeAttr(r.name)}" onerror="this.src='icons/icon-192.png';this.onerror=null;"></span>
    <span class="home-resto-body">
      <span class="home-resto-name-row"><span class="home-resto-name">${escapeHtml(r.name)}</span>${r.isVerified ? '<span class="home-resto-verified" title="Verified">●</span>' : ''}</span>
      <span class="home-resto-address">${escapeHtml(r.address || 'Alamat belum tersedia')}</span>
      <span class="home-resto-meta"><span class="home-resto-rating">${rating}</span><span class="home-resto-dot">•</span>${distanceHtml}<span class="home-resto-status ${status.cls}">${escapeHtml(status.label)}</span></span>
      <span class="home-resto-tags">${tags.map(tag=>`<span class="home-resto-tag">${escapeHtml(tag)}</span>`).join('')}</span>
    </span>
  </button>`;
}

function renderNearbyListResults(restos){
  if(homeView !== 'list' || !myGpsLatLng) return;
  const radiusMeters = nearbyRadiusKm * 1000;
  const nearby = restos
    .filter(r=> Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
    .map(r=>({
      resto:r,
      distanceM:distanceMetersBetween(myGpsLatLng.lat, myGpsLatLng.lng, Number(r.lat), Number(r.lng))
    }))
    .filter(item=> item.distanceM <= radiusMeters)
    .sort((a,b)=> a.distanceM - b.distanceM);

  const results = document.getElementById('nearbyListResults');
  if(!results) return;
  if(nearby.length === 0){
    results.innerHTML = `<div class="home-empty"><b>Tidak ada resto yang cocok dalam radius ${nearbyRadiusKm} km.</b><br>Coba tambah radius, kurangi filter, atau ubah pencarian.</div>`;
  }else{
    results.innerHTML = `<div class="home-resto-list">${nearby.map(item=>buildHomeRestoCardHtml(item.resto,item.distanceM)).join('')}</div>`;
  }
  results.querySelectorAll('.home-resto-card').forEach(card=>{
    card.onclick = ()=> openDetail(card.dataset.restoId);
  });
}

function renderNearbyList(restos){
  if(homeView !== 'list') return;
  if(!myGpsLatLng){
    renderNearbyLocationState(`Aktifkan lokasi untuk melihat resto terdekat dalam radius ${nearbyRadiusKm} km.`);
    return;
  }
  const list = document.getElementById('listView');
  list.innerHTML = buildNearbyPanelHeader() + '<div id="nearbyListResults"></div>';
  bindNearbyPanelControls();
  renderNearbyListResults(restos);
}

function renderMarkers(){
  markersLayer.clearLayers();
  const filtered = getFilteredRestos();
  const markersToAdd = [];
  filtered.forEach(r=>{
    if(!Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng))) return;
    const isVisited = visitedIds.has(r.id);
    const m = L.marker([r.lat, r.lng], {icon: makeIcon(r.type, isVisited, isNewForMe(r), r.isVerified)});
    m.on('click', ()=> openPreviewCard(r.id));
    markersToAdd.push(m);
  });
  markersLayer.addLayers(markersToAdd);
  if(homeView === 'list') renderNearbyList(filtered);
  if(currentPreviewRestoId && !filtered.some(r=>r.id === currentPreviewRestoId)) closePreviewCard();
}

/* ================= SUGGESTION PENCARIAN ================= */
function renderSearchSuggestions(){
  const box = document.getElementById('searchSuggestions');
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if(!q){ box.classList.add('hidden'); box.innerHTML=''; return; }
  const matches = Object.values(allRestos)
    .filter(r => matchesSearch(r, q))
    .slice(0, 6);
  if(matches.length === 0){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.innerHTML = matches.map(r=>{
    const t = TYPES[r.type] || DEFAULT_TYPE_META;
    return `<div class="suggest-item" data-id="${r.id}">${t.emoji} ${escapeHtml(r.name)} <span class="stype">${escapeHtml(r.type)}</span></div>`;
  }).join('');
  box.querySelectorAll('.suggest-item').forEach(el=>{
    el.onclick = ()=>{
      const r = allRestos[el.dataset.id];
      document.getElementById('searchInput').value = r.name;
      box.classList.add('hidden');
      renderMarkers();
      setHomeView('map');
      map.setView([r.lat, r.lng], 17);
      openPreviewCard(r.id);
    };
  });
  box.classList.remove('hidden');
}

/* ================= REFERENSI (Reels/Video) ================= */
const REF_PLATFORM_META = {
  youtube:  {label:'YouTube',   color:'#FF0000', bg:'#FF0000', icon:'▶️', file:'youtube'},
  instagram:{label:'Instagram', color:'#C13584', bg:'linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)', icon:'📷', file:'instagram'},
  tiktok:   {label:'TikTok',    color:'#111111', bg:'#111111', icon:'🎵', file:'tiktok'},
  facebook: {label:'Facebook',  color:'#1877F2', bg:'#1877F2', icon:'👍', file:'facebook'},
  other:    {label:'Link',      color:'#555555', bg:'#555555', icon:'🔗', file:'other'}
};
function detectPlatform(url){
  try{
    const host = new URL(url).hostname.replace('www.','');
    if(host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if(host.includes('instagram.com')) return 'instagram';
    if(host.includes('tiktok.com')) return 'tiktok';
    if(host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook';
  }catch(e){}
  return 'other';
}
function getYoutubeId(url){
  const patterns = [/youtu\.be\/([^?&]+)/, /youtube\.com\/watch\?v=([^&]+)/, /youtube\.com\/shorts\/([^?&]+)/, /youtube\.com\/embed\/([^?&]+)/];
  for(const p of patterns){ const m = url.match(p); if(m) return m[1]; }
  return null;
}
function buildRefCardHtml(ref){
  const plat = REF_PLATFORM_META[ref.platform] || REF_PLATFORM_META.other;
  const canDelete = isAdmin || (ref.userId && ref.userId === myUserId);
  return `<div class="ref-card-wrap">
    <a class="ref-card" href="${escapeAttr(ref.url)}" target="_blank" rel="noopener" title="${plat.label}">${platformIconHtml(plat.file, plat.icon, 52)}</a>
    ${canDelete ? `<button type="button" class="ref-del-btn" data-id="${escapeAttr(ref.id)}" title="Hapus referensi">✕</button>` : ''}
  </div>`;
}

/* ================= FOTO KUNJUNGAN ================= */
function photoPublicUrl(path){
  return sb.storage.from('visit-photos').getPublicUrl(path).data.publicUrl;
}
function buildPhotoCard(photo, idx){
  const url = photoPublicUrl(photo.storagePath);
  const canDelete = photo.userId === myUserId || isAdmin;
  return `<div class="photo-card" data-idx="${idx}">
    <img src="${url}" loading="lazy" alt="Foto kunjungan">
    ${canDelete ? `<button class="photo-del-btn" data-path="${escapeAttr(photo.storagePath)}" data-id="${photo.id}" title="Hapus foto">✕</button>` : ''}
  </div>`;
}

function visitPhotoCategory(photo){
  const path = String((photo && photo.storagePath) || '').toLowerCase();
  if(path.startsWith('food/')) return 'food';
  if(path.startsWith('ambience/')) return 'ambience';
  return 'legacy';
}

function buildReferencePhotoCarouselHtml(photos, gridId, emptyText){
  const list = (photos || []).slice().sort((a,b)=> (b.at||0) - (a.at||0));
  if(list.length === 0){
    return `<div id="${gridId}" class="reference-empty-state">${escapeHtml(emptyText)}</div>`;
  }
  return `<div class="photo-carousel reference-photo-carousel" id="${gridId}">${list.map((p, idx)=>buildPhotoCard(p, idx)).join('')}</div>`;
}

/* Satu carousel tunggal berisi semua foto kunjungan (terbaru duluan), tanpa
   label nama/jumlah foto -- tetap dipertahankan untuk kompatibilitas komponen lama. */
function buildPhotosCarouselHtml(photos){
  currentDetailPhotos = (photos || []).slice().sort((a,b)=> (b.at||0) - (a.at||0));
  if(currentDetailPhotos.length === 0){
    return '<span id="photoGrid" style="color:var(--muted);font-size:12.5px;">Belum ada foto. Unggah foto hasil kunjungan Anda!</span>';
  }
  return `<div class="photo-carousel" id="photoGrid">${currentDetailPhotos.map((p, idx)=>buildPhotoCard(p, idx)).join('')}</div>`;
}

/* ---- Lightbox (mode ukuran penuh) foto -- dipakai bersama untuk Foto Kunjungan & Foto Menu ---- */
function photoLightboxKeyHandler(e){
  const track = document.getElementById('photoLightboxTrack');
  if(!track) return;
  if(e.key === 'Escape') closePhotoLightbox();
  else if(e.key === 'ArrowRight') track.scrollBy({left: track.clientWidth, behavior:'smooth'});
  else if(e.key === 'ArrowLeft') track.scrollBy({left: -track.clientWidth, behavior:'smooth'});
}
function closePhotoLightbox(){
  const overlay = document.getElementById('photoLightboxOverlay');
  if(overlay) overlay.remove();
  document.removeEventListener('keydown', photoLightboxKeyHandler);
}
/* urls: array URL gambar yang ditampilkan sebagai carousel penuh, bisa digeser kanan-kiri.
   captionFn(idx) opsional -- kalau diisi, keterangan di bawah foto mengikuti foto yang aktif. */
function openPhotoLightbox(urls, startIdx, captionFn){
  if(!urls || !urls.length) return;
  closePhotoLightbox();
  const overlay = document.createElement('div');
  overlay.id = 'photoLightboxOverlay';
  overlay.className = 'photo-lightbox-overlay';
  overlay.innerHTML = `
    <button type="button" class="photo-lightbox-close" title="Tutup">✕</button>
    <div class="photo-lightbox-track" id="photoLightboxTrack">
      ${urls.map(u=>`<div class="photo-lightbox-slide"><img src="${escapeAttr(u)}" alt="Foto"></div>`).join('')}
    </div>
    ${captionFn ? '<div class="photo-lightbox-caption" id="photoLightboxCaption"></div>' : ''}
  `;
  document.body.appendChild(overlay);
  const track = overlay.querySelector('#photoLightboxTrack');
  overlay.querySelector('.photo-lightbox-close').onclick = closePhotoLightbox;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closePhotoLightbox(); });

  const updateCaption = ()=>{
    if(!captionFn) return;
    const i = Math.max(0, Math.min(urls.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
    const capEl = document.getElementById('photoLightboxCaption');
    if(capEl) capEl.innerHTML = captionFn(i);
  };
  let scrollTimer = null;
  track.addEventListener('scroll', ()=>{
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(updateCaption, 60);
  });
  requestAnimationFrame(()=>{
    track.scrollLeft = startIdx * track.clientWidth;
    updateCaption();
  });
  document.addEventListener('keydown', photoLightboxKeyHandler);
}
/* Keterangan nama pengunggah + tanggal untuk lightbox Foto Kunjungan */
function visitPhotoCaptionFromList(photos, idx){
  const p = (photos || [])[idx];
  if(!p) return '';
  const isMine = p.userId === myUserId;
  const name = isMine ? 'Anda' : (profilesMap[p.userId] || 'Pengguna');
  const dateStr = p.at ? new Date(p.at).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}) : '';
  return `<b>${escapeHtml(name)}</b>${dateStr ? ' · ' + dateStr : ''}`;
}
function visitPhotoCaption(idx){
  return visitPhotoCaptionFromList(currentDetailPhotos, idx);
}

/* Foto Menu di halaman detail: tampilan carousel sama seperti Foto Kunjungan
   (bisa dibuka/di-zoom mode penuh & digeser), ukuran foto sama, tanpa keterangan. */
let currentDetailMenuItems = []; // {url, kind:'legacy'|'crowd', id?, storagePath?} -- gabungan foto menu lama (admin, via form) + foto menu tambahan (siapa saja, dari halaman detail)
function buildMenuPhotosCarouselHtml(legacyImgs, crowdPhotos){
  const legacy = (legacyImgs || []).filter(Boolean).map(u => ({ url: u, kind: 'legacy' }));
  const crowd = (crowdPhotos || []).slice().sort((a,b)=> (b.at||0) - (a.at||0))
    .map(p => ({ url: photoPublicUrl(p.storagePath), kind: 'crowd', id: p.id, storagePath: p.storagePath }));
  currentDetailMenuItems = [...legacy, ...crowd];
  if(currentDetailMenuItems.length === 0){
    return '<span id="menuPhotoDisplayGrid" style="color:var(--muted);font-size:12.5px;">Belum ada foto menu.</span>';
  }
  return `<div class="photo-carousel" id="menuPhotoDisplayGrid">${currentDetailMenuItems.map((item, idx)=>`
    <div class="photo-card" data-idx="${idx}">
      <img src="${escapeAttr(item.url)}" loading="lazy" alt="Foto menu" onerror="this.style.opacity=0.2">
      ${isAdmin ? `<button class="photo-del-btn menu-photo-del-btn" data-idx="${idx}" title="Hapus foto (khusus admin)">✕</button>` : ''}
    </div>`).join('')}</div>`;
}

/* Kompres foto di browser (maks 1600px, kualitas 75%) supaya hemat storage & upload cepat */
function compressImage(file, maxDim=1600, quality=0.75){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e)=>{
      const img = new Image();
      img.onerror = reject;
      img.onload = ()=>{
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          if(width >= height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else{ width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal memproses gambar')), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
/* ================= BLUR WAJAH OTOMATIS (PRIVASI FOTO KUNJUNGAN) =================
   Foto Kunjungan sering memotret pengunjung lain yang tak sengaja terekam di
   ruang publik. Sebelum diunggah, foto diperiksa di browser pengguna sendiri
   (tidak dikirim ke server pihak ketiga manapun untuk deteksi ini) memakai
   face-api.js (model TinyFaceDetector, ringan) dan setiap wajah yang terdeteksi
   langsung diburamkan (gaussian blur oval, tepi lembut, fokus pada wajah
   saja) sebelum blob diunggah ke Supabase Storage.
   Library & model dimuat on-demand saat foto kunjungan pertama diproses (bukan
   saat aplikasi dibuka) supaya tidak memperlambat waktu buka awal; setelah
   diunduh sekali, browser & service worker akan menyimpannya di cache HTTP.

   KETERBATASAN yang disengaja diterima demi keamanan privasi:
   - Kotak deteksi wajah diperbesar (padding) supaya bagian yang sering luput
     karena tertutup masker, kacamata, topi, atau kerudung (dahi, dagu, telinga,
     garis rambut) ikut tersamarkan, bukan cuma area wajah yang persis terlihat.
   - Deteksi berbasis pola visual umum tidak bisa 100% membedakan wajah manusia
     asli dari wajah pada lukisan/patung/poster -- kalau itu terjadi, wajah
     lukisan/patung ikut terblur. Ini konsekuensi yang lebih aman dipilih
     ketimbang risiko wajah pengunjung asli lolos tanpa blur.
   - Wajah yang tertutup sangat banyak sekaligus (mis. masker + kacamata gelap +
     topi + menyamping ekstrem) berpotensi tidak terdeteksi sama sekali; ini
     batas kemampuan model ringan client-side, bukan kegagalan sistem. */
const FACE_API_LIB_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector';
let faceApiReadyPromise = null;
function loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = ()=> reject(new Error('Gagal memuat pustaka deteksi wajah'));
    document.head.appendChild(s);
  });
}
function ensureFaceApiReady(){
  if(!faceApiReadyPromise){
    faceApiReadyPromise = (async ()=>{
      if(!window.faceapi) await loadScriptOnce(FACE_API_LIB_URL);
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
    })().catch(err=>{ faceApiReadyPromise = null; throw err; });
  }
  return faceApiReadyPromise;
}
/* Mem-gaussian-blur area wajah dengan bentuk OVAL & tepi lembut (feathered),
   bukan kotak keras -- supaya blur fokus mengikuti kontur wajah dan tidak
   "nyerempet" bahu/kerah/latar di sekitarnya. box = {x,y,w,h} area wajah
   (termasuk padding tipis) dalam koordinat srcCanvas. */
function gaussianBlurFaceRegion(ctx, srcCanvas, box){
  const blurRadius = Math.max(6, Math.round(Math.min(box.w, box.h) * 0.18));
  const margin = blurRadius * 2; // konteks ekstra di tepi crop supaya blur tidak artefak
  const cropX = Math.max(0, Math.round(box.x - margin));
  const cropY = Math.max(0, Math.round(box.y - margin));
  const cropW = Math.min(srcCanvas.width - cropX, Math.round(box.w + margin * 2));
  const cropH = Math.min(srcCanvas.height - cropY, Math.round(box.h + margin * 2));
  if(cropW <= 0 || cropH <= 0) return;

  // 1) crop area (+margin) lalu blur penuh di canvas sementara
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = cropW; blurCanvas.height = cropH;
  const bctx = blurCanvas.getContext('2d');
  bctx.filter = `blur(${blurRadius}px)`;
  bctx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  bctx.filter = 'none';

  // 2) buat mask oval dengan tepi gradasi lembut, pas di posisi wajah (bukan margin)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = cropW; maskCanvas.height = cropH;
  const mctx = maskCanvas.getContext('2d');
  const cx = (box.x - cropX) + box.w / 2;
  const cy = (box.y - cropY) + box.h / 2;
  const rx = Math.max(1, box.w / 2);
  const ry = Math.max(1, box.h / 2);
  mctx.save();
  mctx.translate(cx, cy);
  mctx.scale(rx, ry);
  const grad = mctx.createRadialGradient(0, 0, 0.45, 0, 0, 1.05);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  mctx.fillStyle = grad;
  mctx.fillRect(-3, -3, 6, 6); // area lebar dlm koordinat lokal (sudah di-scale rx,ry)
  mctx.restore();

  // 3) mask-kan blur supaya cuma oval wajahnya yang buram, tepi menyatu halus
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(maskCanvas, 0, 0);
  bctx.globalCompositeOperation = 'source-over';

  // 4) tempel kembali ke canvas asli
  ctx.drawImage(blurCanvas, cropX, cropY);
}
/* Mendeteksi semua wajah pada canvas & langsung meng-gaussian-blur areanya
   (oval, tepi lembut) di tempat. Return: jumlah wajah yang ter-blur
   (0 = tidak ada wajah, -1 = deteksi gagal dijalankan sama sekali, mis. gagal
   unduh model karena koneksi lemot). */
async function blurFacesOnCanvas(canvas){
  try{
    await ensureFaceApiReady();
    // scoreThreshold diturunkan (dari 0.3 ke 0.15) & inputSize dinaikkan (608 ke 800)
    // supaya wajah kecil/jauh dari kamera dan wajah yang sebagian tertutup
    // (tangan, masker, kacamata, sudut miring) lebih mungkin tertangkap.
    // Konsekuensinya: kemungkinan false positive (area bukan wajah ikut ke-blur,
    // mis. pola pada benda/lukisan) jadi lebih tinggi -- ini sengaja diterima
    // sesuai prinsip "lebih aman over-blur daripada wajah pengunjung lolos".
    const detections = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 800, scoreThreshold: 0.15 }));
    if(!detections.length) return 0;
    const ctx = canvas.getContext('2d');
    detections.forEach(d=>{
      const box = d.box;
      // Padding tipis saja (bukan kotak besar) -- cukup untuk tetap menutup
      // tepi kacamata/masker/garis kerudung, tanpa melebar ke bahu/kerah.
      const padX = box.width * 0.16;
      const padTop = box.height * 0.28;    // sedikit lebih ke atas: dahi/garis rambut/kerudung
      const padBottom = box.height * 0.18; // ke bawah: dagu/rahang (masker)
      const x = Math.max(0, box.x - padX);
      const y = Math.max(0, box.y - padTop);
      const w = Math.min(canvas.width - x, box.width + padX * 2);
      const h = Math.min(canvas.height - y, box.height + padTop + padBottom);
      if(w > 0 && h > 0) gaussianBlurFaceRegion(ctx, canvas, { x, y, w, h });
    });
    return detections.length;
  }catch(e){
    console.warn('Deteksi wajah gagal, foto diunggah tanpa blur otomatis:', e);
    return -1;
  }
}
function blobToCanvas(blob){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(img.src); reject(new Error('Gagal memuat gambar untuk deteksi wajah')); };
    img.src = URL.createObjectURL(blob);
  });
}
function cloneCanvas(src){
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
/* Menampilkan modal konfirmasi ke user saat wajah terdeteksi pada Foto
   Kunjungan -- supaya user yang memotret dirinya sendiri (selfie) bisa
   memilih TIDAK diblur, bukan otomatis diblur tanpa ditanya. User bisa
   membandingkan versi blur vs asli lewat tombol toggle sebelum memutuskan.
   Return: Promise<'blur'|'original'|'cancel'> */
function askUserBlurFaces(originalCanvas, blurredCanvas){
  return new Promise((resolve)=>{
    const overlay = document.getElementById('faceBlurConfirmOverlay');
    const img = document.getElementById('faceBlurPreviewImg');
    const toggleBtn = document.getElementById('faceBlurTogglePreviewBtn');
    let showingBlurred = true;
    const setPreview = ()=>{
      img.src = (showingBlurred ? blurredCanvas : originalCanvas).toDataURL('image/jpeg', 0.7);
      toggleBtn.textContent = showingBlurred ? '👁️ Lihat versi asli (tanpa blur)' : '👁️ Lihat versi buram';
    };
    setPreview();
    toggleBtn.onclick = ()=>{ showingBlurred = !showingBlurred; setPreview(); };
    overlay.classList.remove('hidden');
    const cleanup = (result)=>{ overlay.classList.add('hidden'); resolve(result); };
    document.getElementById('faceBlurConfirmYesBtn').onclick = ()=> cleanup('blur');
    document.getElementById('faceBlurConfirmNoBtn').onclick = ()=> cleanup('original');
    document.getElementById('faceBlurConfirmCancelBtn').onclick = ()=> cleanup('cancel');
  });
}
/* Titik masuk utama pemrosesan Foto Kunjungan: kompres file, deteksi wajah,
   dan kalau ada wajah terdeteksi -- TANYA dulu ke user mau diblur atau tidak
   (lihat askUserBlurFaces) alih-alih otomatis memburamkan tanpa konfirmasi.
   Return: Blob final siap unggah, atau null kalau user membatalkan foto ini.
   Kalau tidak ada wajah terdeteksi (atau deteksi gagal dijalankan sama
   sekali, mis. offline saat unduh model), foto lanjut dipakai apa adanya
   tanpa modal -- supaya kontribusi user tidak terhambat. */
async function prepareVisitPhotoBlob(file){
  const compressedBlob = await compressImage(file);
  let originalCanvas;
  try{
    originalCanvas = await blobToCanvas(compressedBlob);
  }catch(e){
    return compressedBlob; // gagal decode utk deteksi -- lanjut pakai versi belum diperiksa
  }
  const blurredCanvas = cloneCanvas(originalCanvas);
  const faceCount = await blurFacesOnCanvas(blurredCanvas); // hanya blurredCanvas yg diedit
  if(faceCount <= 0) return compressedBlob; // 0 wajah, atau deteksi gagal (-1)
  const choice = await askUserBlurFaces(originalCanvas, blurredCanvas);
  if(choice === 'cancel') return null;
  const finalCanvas = choice === 'blur' ? blurredCanvas : originalCanvas;
  return await new Promise(resolve=> finalCanvas.toBlob(b=> resolve(b || compressedBlob), 'image/jpeg', 0.85));
}
/* Mengunggah blob Foto Kunjungan yang SUDAH diproses (kompres + keputusan
   blur user sudah final lewat prepareVisitPhotoBlob) ke Supabase Storage &
   mencatatnya di tabel visit_photos. */
async function uploadVisitPhotoBlob(blob, restoId, category='general'){
  if(!requireLogin()) return false;
  showToast('Mengunggah foto...');
  try{
    // Kategori disimpan pada prefix storage path agar kompatibel dengan schema visit_photos
    // yang sudah aktif. Foto lama tanpa prefix khusus tetap diperlakukan sebagai legacy.
    const safeCategory = ['food','ambience'].includes(category) ? category : 'general';
    const path = `${safeCategory}/${restoId}/${myUserId}_${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage.from('visit-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if(upErr) throw upErr;
    const { error: insErr } = await sb.from('visit_photos').insert({ resto_id: restoId, user_id: myUserId, storage_path: path });
    if(insErr) throw insErr;
    showToast('Foto berhasil diunggah');
    return true;
  }catch(e){
    showToast('Gagal unggah: ' + e.message);
    return false;
  }
}
async function deleteVisitPhoto(photoId, storagePath){
  try{
    await sb.storage.from('visit-photos').remove([storagePath]);
    await sb.from('visit_photos').delete().eq('id', photoId);
    return true;
  }catch(e){
    showToast('Gagal menghapus foto: ' + e.message);
    return false;
  }
}

/* Foto Daftar Menu tambahan yang diunggah user biasa dari halaman detail (bukan lewat
   form Tambah/Edit Resto). Disimpan di tabel menu_photos -- insert boleh siapa saja yang
   login, hapus dibatasi khusus admin lewat RLS (lihat tambahan-skema-menu-photos-dan-kebersihan.sql). */
async function uploadMenuPhotoCrowd(file, restoId){
  if(!requireLogin()) return false;
  showToast('Mengunggah foto menu...');
  try{
    const blob = await compressImage(file);
    const path = `menu/${restoId}/${myUserId}_${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage.from('visit-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if(upErr) throw upErr;
    const { error: insErr } = await sb.from('menu_photos').insert({ resto_id: restoId, user_id: myUserId, storage_path: path });
    if(insErr) throw insErr;
    showToast('Foto menu berhasil diunggah');
    return true;
  }catch(e){
    showToast('Gagal unggah: ' + e.message);
    return false;
  }
}
async function deleteMenuPhotoCrowd(photoId, storagePath){
  try{
    await sb.storage.from('visit-photos').remove([storagePath]);
    await sb.from('menu_photos').delete().eq('id', photoId);
    return true;
  }catch(e){
    showToast('Gagal menghapus foto menu: ' + e.message);
    return false;
  }
}
/* Hapus foto menu lama (dari restos.menu_images, hasil form Tambah/Edit Resto) langsung
   dari halaman detail -- hanya admin yang bisa, RLS restos:update sudah admin-only. */
async function deleteLegacyMenuImage(restoId, imgUrl){
  try{
    const r = allRestos[restoId];
    const updated = (r.menuImages||[]).filter(u => u !== imgUrl);
    const { error } = await sb.from('restos').update({ menu_images: updated }).eq('id', restoId);
    if(error) throw error;
    return true;
  }catch(e){
    showToast('Gagal menghapus foto menu: ' + e.message);
    return false;
  }
}

async function deleteReference(refId){
  try{
    await sb.from('references_link').delete().eq('id', refId);
    return true;
  }catch(e){
    showToast('Gagal menghapus referensi: ' + e.message);
    return false;
  }
}
