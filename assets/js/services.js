/* ================= AUTENTIKASI (login sungguhan via email magic link) ================= */
async function initIdentity(){
  const { data: { session } } = await sb.auth.getSession();
  await applySession(session);

  sb.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
    updateUserBadge();
    await loadVisited();
    if(currentPrimaryView === 'profile') openAccountPanel();
    renderMarkers();
  });
}

async function applySession(session){
  if(session && session.user){
    myUserId = session.user.id;
    myEmail = session.user.email;
    const { data: profile } = await sb.from('profiles').select('role, username, gender, age, avatar_url, bio, city, website_url, instagram, tiktok').eq('id', myUserId).single();
    isAdmin = !!(profile && profile.role === 'admin');
    myUsername = profile ? (profile.username || null) : null;
    myGender = profile ? (profile.gender || null) : null;
    myAge = profile ? (profile.age || null) : null;
    myAvatarUrl = profile ? (profile.avatar_url || null) : null;
    myBio = profile?.bio || null;
    myCity = profile?.city || null;
    myWebsite = profile?.website_url || null;
    myInstagram = profile?.instagram || null;
    myTiktok = profile?.tiktok || null;
    if(!myUsername) setTimeout(openProfileCompletionModal, 400); // beri jeda dikit supaya tidak "nabrak" transisi login
  }else{
    myUserId = null; myEmail = null; isAdmin = false;
    myUsername = null; myGender = null; myAge = null; myAvatarUrl = null;
    myBio = null; myCity = null; myWebsite = null; myInstagram = null; myTiktok = null;
  }
  updateUserBadge();
  await loadVisited();
}

async function loadVisited(){
  if(!myUserId){ visitedIds = new Set(); wishlistIds = new Set(); seenRestoIds = new Set(); return; }
  const [{ data: visitedData }, { data: wishlistData }, { data: seenData }] = await Promise.all([
    sb.from('visited').select('resto_id').eq('user_id', myUserId),
    sb.from('wishlist').select('resto_id').eq('user_id', myUserId),
    sb.from('seen_restos').select('resto_id').eq('user_id', myUserId)
  ]);
  visitedIds = new Set((visitedData||[]).map(v=>v.resto_id));
  wishlistIds = new Set((wishlistData||[]).map(v=>v.resto_id));
  seenRestoIds = new Set((seenData||[]).map(v=>v.resto_id));
}

const NEW_RESTO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // resto dianggap "baru" selama 7 hari sejak ditambahkan

function isNewForMe(r){
  if(!myUserId) return false; // fitur ini butuh login (personal per user)
  if(seenRestoIds.has(r.id)) return false;
  if(!r.createdAt) return false;
  return (Date.now() - r.createdAt) < NEW_RESTO_WINDOW_MS;
}

function getNewRestosForMe(){
  return Object.values(allRestos).filter(isNewForMe);
}

async function markRestoSeen(restoId){
  if(!myUserId || seenRestoIds.has(restoId)) return;
  seenRestoIds.add(restoId);
  try{ await sb.from('seen_restos').upsert({resto_id: restoId, user_id: myUserId}); }catch(e){}
  renderMarkers();
}

function requireLogin(){
  if(myUserId) return true;
  document.getElementById('loginOverlay').classList.remove('hidden');
  return false;
}

async function toggleVisited(restoId){
  if(!requireLogin()) return;
  if(visitedIds.has(restoId)){
    visitedIds.delete(restoId);
    await sb.from('visited').delete().eq('resto_id', restoId).eq('user_id', myUserId);
  }else{
    visitedIds.add(restoId);
    await sb.from('visited').upsert({resto_id: restoId, user_id: myUserId});
  }
  renderMarkers();
}

async function toggleWishlist(restoId){
  if(!requireLogin()) return;
  if(wishlistIds.has(restoId)){
    wishlistIds.delete(restoId);
    await sb.from('wishlist').delete().eq('resto_id', restoId).eq('user_id', myUserId);
  }else{
    wishlistIds.add(restoId);
    await sb.from('wishlist').upsert({resto_id: restoId, user_id: myUserId});
  }
  updateWishlistMenuBadge();
  renderMarkers();
}

/* Bagikan resto lewat Web Share API (kalau didukung browser/HP), fallback salin link ke clipboard. */
async function shareResto(r){
  const shareUrl = `${window.location.origin}${window.location.pathname}?resto=${encodeURIComponent(r.id)}`;
  const shareData = { title: r.name, text: `Cek ${r.name} di GastronoMap!`, url: shareUrl };
  if(navigator.share){
    try{ await navigator.share(shareData); }catch(e){ /* user membatalkan share -- tidak perlu toast error */ }
  }else{
    try{
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link disalin ke clipboard!');
    }catch(e){
      showToast('Gagal membuat link berbagi');
    }
  }
}

function updateUserBadge(){
  const btn = document.getElementById('userBadge');
  if(!btn) return;
  const img = document.getElementById('userBadgeAvatar');
  const initial = document.getElementById('userBadgeInitial');
  if(myUserId){
    btn.title = myUsername || 'Lengkapi Profil';
    btn.classList.toggle('active', isAdmin);
    if(myAvatarUrl){
      img.src = myAvatarUrl; img.classList.remove('hidden'); initial.classList.add('hidden');
    }else{
      img.classList.add('hidden'); initial.classList.remove('hidden');
      initial.textContent = isAdmin ? '🔑' : '👤';
    }
  }else{
    btn.title = 'Login';
    btn.classList.remove('active');
    img.classList.add('hidden'); initial.classList.remove('hidden');
    initial.textContent = '👤';
  }
}

async function sendMagicLink(inputId, statusId){
  inputId = inputId || 'loginEmailInput';
  statusId = statusId || 'loginStatus';
  const email = document.getElementById(inputId).value.trim();
  const statusEl = document.getElementById(statusId);
  if(!email){ statusEl.textContent = 'Isi email dulu'; return; }
  statusEl.textContent = 'Mengirim link...';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  statusEl.textContent = error ? ('Gagal: ' + error.message) : 'Link terkirim! Cek email Anda (termasuk folder spam), lalu klik link-nya.';
}

async function signInWithGoogle(){
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  if(error) showToast('Gagal login Google: ' + error.message);
}

async function signOut(){
  if(confirm('Keluar dari akun ini?')){
    await sb.auth.signOut();
    showToast('Berhasil logout');
  }
}

function openProfileCompletionModal(forceEdit){
  if(!myUserId) return;
  if(myUsername && !forceEdit) return; // sudah punya username & bukan mode edit, tidak perlu dipaksa lagi
  document.getElementById('profileUsernameInput').value = myUsername || '';
  document.getElementById('profileGenderInput').value = myGender || '';
  document.getElementById('profileAgeInput').value = myAge || '';
  document.getElementById('profileBioInput').value = myBio || '';
  document.getElementById('profileCityInput').value = myCity || '';
  document.getElementById('profileWebsiteInput').value = myWebsite || '';
  document.getElementById('profileInstagramInput').value = myInstagram || '';
  document.getElementById('profileTiktokInput').value = myTiktok || '';
  document.getElementById('profileStatus').textContent = '';
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('profileOverlay').classList.remove('hidden');
}

async function saveProfile(){
  const username = document.getElementById('profileUsernameInput').value.trim();
  const gender = document.getElementById('profileGenderInput').value;
  const ageRaw = document.getElementById('profileAgeInput').value.trim();
  const bio = document.getElementById('profileBioInput').value.trim();
  const city = document.getElementById('profileCityInput').value.trim();
  const website = document.getElementById('profileWebsiteInput').value.trim();
  const instagram = document.getElementById('profileInstagramInput').value.trim();
  const tiktok = document.getElementById('profileTiktokInput').value.trim();
  const statusEl = document.getElementById('profileStatus');
  if(!username){ statusEl.textContent = 'Username wajib diisi'; return; }
  if(username.length < 3){ statusEl.textContent = 'Username minimal 3 karakter'; return; }
  const age = ageRaw ? parseInt(ageRaw, 10) : null;
  if(website && !/^https?:\/\/[^\s]+$/i.test(website)){statusEl.textContent='Website harus diawali http:// atau https://';return;}
  statusEl.textContent = 'Menyimpan...';
  const { error } = await sb.from('profiles').update({
    username, gender: gender || null, age: (age && age > 0 && age < 120) ? age : null,
    bio: bio || null, city: city || null, website_url: website || null,
    instagram: instagram || null, tiktok: tiktok || null
  }).eq('id', myUserId);
  if(error){ statusEl.textContent = 'Gagal: ' + error.message; return; }
  myUsername = username; myGender = gender || null; myAge = age || null;
  myBio = bio || null; myCity = city || null; myWebsite = website || null;
  myInstagram = instagram || null; myTiktok = tiktok || null;
  updateUserBadge();
  document.getElementById('profileOverlay').classList.add('hidden');
  if(currentPrimaryView === 'profile') openAccountPanel();
  showToast('Profil tersimpan, terima kasih!');
}

/* ================= PANEL AKUN (avatar, panduan, logout) ================= */
function openAccountPanel(){
  const guest = !myUserId;
  document.getElementById('profileGuest').classList.toggle('hidden', !guest);
  document.getElementById('profileAccountMenu').classList.toggle('hidden', guest);
  document.getElementById('accountHeader').classList.toggle('hidden', guest);
  document.getElementById('accountUsername').textContent = myUsername || '(belum ada username)';
  document.getElementById('accountEmail').textContent = myEmail || '';
  const img = document.getElementById('accountAvatarImg');
  const initial = document.getElementById('accountAvatarInitial');
  if(myAvatarUrl){
    img.src = myAvatarUrl; img.classList.remove('hidden'); initial.classList.add('hidden');
  }else{
    img.classList.add('hidden'); initial.classList.remove('hidden');
  }
  updateNewRestoMenuBadge();
  updateWishlistMenuBadge();
  document.getElementById('openWishlistBtn').classList.toggle('hidden', isAdmin);
  document.getElementById('reportMenuToggle').classList.toggle('hidden', isAdmin);
  document.getElementById('guideMenuToggle').classList.toggle('hidden', isAdmin);
  document.getElementById('openReportBtn').classList.toggle('hidden', isAdmin);
  document.getElementById('openAdminReportsBtn').classList.toggle('hidden', !isAdmin);
  document.getElementById('openAdminLinkSubmissionsBtn').classList.toggle('hidden', !isAdmin);
  if(isAdmin){ updatePendingReportsBadge(); updatePendingLinkSubmissionsBadge(); }
  document.getElementById('reportSubmenu').classList.add('hidden');
  document.getElementById('reportMenuArrow').classList.remove('open');
  document.getElementById('guideSubmenu').classList.add('hidden');
  document.getElementById('guideMenuArrow').classList.remove('open');
  document.getElementById('accountOverlay').classList.remove('hidden');
  if(typeof window.renderProfileDashboard === 'function') window.renderProfileDashboard();
}

/* Badge jumlah laporan berstatus pending pada tombol menu admin "Kelola Laporan" */
async function updatePendingReportsBadge(){
  const btn = document.getElementById('openAdminReportsBtn');
  if(!btn || !isAdmin) return;
  try{
    const { count } = await sb.from('reports').select('id', {count:'exact', head:true}).eq('status', 'pending');
    btn.textContent = count > 0 ? `🚩 Kelola Laporan (${count})` : '🚩 Kelola Laporan';
  }catch(e){ btn.textContent = '🚩 Kelola Laporan'; }
}

/* Badge jumlah resto baru (belum dilihat) di tombol menu "List Resto Baru" pada panel akun */
function updateNewRestoMenuBadge(){
  const btn = document.getElementById('openNewRestoListBtn');
  if(!btn) return;
  const count = myUserId ? getNewRestosForMe().length : 0;
  btn.textContent = count > 0 ? `🆕 List Resto Baru (${count})` : '🆕 List Resto Baru';
}

/* Badge jumlah resto di Wishlist pada tombol menu "Wishlist" di panel akun */
function updateWishlistMenuBadge(){
  const btn = document.getElementById('openWishlistBtn');
  if(!btn) return;
  const count = myUserId ? wishlistIds.size : 0;
  btn.textContent = count > 0 ? `❤️ Wishlist (${count})` : '❤️ Wishlist';
}

async function uploadAvatar(file){
  if(!requireLogin()) return;
  showToast('Mengunggah foto profil...');
  try{
    const blob = await compressImage(file, 400, 0.8); // avatar cukup kecil, hemat storage
    const path = `avatars/${myUserId}_${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage.from('visit-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if(upErr) throw upErr;
    const url = sb.storage.from('visit-photos').getPublicUrl(path).data.publicUrl;
    const { error: updErr } = await sb.from('profiles').update({ avatar_url: url }).eq('id', myUserId);
    if(updErr) throw updErr;
    myAvatarUrl = url;
    updateUserBadge();
    openAccountPanel(); // refresh tampilan avatar di panel
    showToast('Foto profil diperbarui');
  }catch(e){
    showToast('Gagal unggah foto: ' + e.message);
  }
}

const GUIDE_HTML = `
  <h3>🗺️ Cari & Lihat Resto</h3>
  <ul>
    <li>Ketik nama resto/alamat di kotak cari, atau langsung jelajahi peta.</li>
    <li>Tap pin untuk lihat detail: jam buka, harga, foto menu, rating, testimoni.</li>
    <li>Tombol 🔧 Filter untuk saring berdasarkan tipe, harga, jam buka, ketersediaan online, atau status kunjungan.</li>
  </ul>
  <h3>➕ Tambah Resto</h3>
  <ul>
    <li>Tekan tombol (+) di pojok kanan bawah.</li>
    <li>Isi lokasi lewat salah satu cara: ketik alamat & pilih sugesti, tekan "Saya Sedang di Sini", cari di Google Maps lalu tempel koordinatnya, atau tap langsung di peta.</li>
    <li>Pin bisa digeser kalau posisinya kurang pas sebelum disimpan.</li>
  </ul>
  <h3>⭐ Rating & Testimoni</h3>
  <ul>
    <li>Tiap orang hanya bisa memberi 1 rating & 1 testimoni per resto, tapi bisa diedit ulang kapan saja.</li>
    <li>Menu Favorit dan Referensi (link Reels/video) boleh ditambah berkali-kali.</li>
  </ul>
  <h3>✅ Tandai Kunjungan</h3>
  <ul>
    <li>Buka detail resto, tekan "Tandai Dikunjungi" -- ini personal, hanya Anda yang lihat statusnya.</li>
  </ul>
  <h3>🚩 Laporan & Bantuan</h3>
  <ul>
    <li>Tap "🚩 Laporkan resto ini" di halaman detail kalau ada data yang salah/tidak sesuai.</li>
    <li>Untuk saran, bug, atau masukan umum, gunakan menu "📝 Bantuan" di panel akun.</li>
    <li>Pantau status tindak lanjut laporan Anda lewat menu "📋 Laporan Saya" di panel akun.</li>
  </ul>
  <h3>🔑 Untuk Admin</h3>
  <ul>
    <li>Admin bisa Edit dan Hapus resto lewat panel detail (tombol khusus muncul otomatis kalau akun Anda berstatus admin).</li>
    <li>Semua laporan dari pengguna bisa dikelola lewat menu "🚩 Kelola Laporan" di panel akun.</li>
  </ul>
`;

const INSTALL_GUIDE_HTML = `
  <h3>🤖 Android (Chrome)</h3>
  <ul>
    <li>Buka GastronoMap lewat browser Chrome.</li>
    <li>Tap ikon titik tiga (⋮) di pojok kanan atas.</li>
    <li>Pilih "Tambahkan ke Layar Utama" atau "Install aplikasi".</li>
    <li>Tap "Install" / "Tambahkan" untuk konfirmasi.</li>
    <li>Ikon GastronoMap akan muncul di layar utama HP, bisa dibuka seperti aplikasi biasa.</li>
  </ul>
  <h3>🍎 iOS (Safari)</h3>
  <ul>
    <li>Wajib dibuka lewat browser Safari (bukan Chrome/lainnya).</li>
    <li>Tap ikon Share/Bagikan (kotak dengan panah ke atas) di bagian bawah layar.</li>
    <li>Scroll ke bawah, pilih "Tambah ke Layar Utama" (Add to Home Screen).</li>
    <li>Tap "Tambah" di pojok kanan atas untuk konfirmasi.</li>
    <li>Ikon GastronoMap akan muncul di layar utama HP, bisa dibuka seperti aplikasi biasa.</li>
  </ul>
`;

function openGuidePanel(section){
  const useInstall = section === 'install';
  document.getElementById('guidePanel').querySelector('h2').textContent =
    useInstall ? '📲 Cara Install Aplikasi' : '📖 Panduan Penggunaan GastronoMap';
  document.getElementById('guideContent').innerHTML = useInstall ? INSTALL_GUIDE_HTML : GUIDE_HTML;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('guideOverlay').classList.remove('hidden');
}

/* Popup notifikasi resto baru hanya perlu ditampilkan SEKALI per resto -- setelah
   ditampilkan, dicatat di localStorage supaya tidak muncul lagi tiap buka app,
   walau resto itu masih dalam status "baru" (badge di pin tetap ada sampai diklik). */
function getPoppedNewIds(){
  try{ return new Set(JSON.parse(localStorage.getItem('gm_popped_new_ids') || '[]')); }
  catch(e){ return new Set(); }
}
function addPoppedNewIds(ids){
  const cur = getPoppedNewIds();
  ids.forEach(id => cur.add(id));
  try{ localStorage.setItem('gm_popped_new_ids', JSON.stringify([...cur])); }catch(e){}
}

/* Render isi panel resto baru: judul, teks intro, daftar item, dan tombol "Sudah Lihat Semua"
   -- semua menyesuaikan otomatis apakah ada resto baru atau tidak. Dipakai baik oleh popup
   otomatis maupun oleh panel "List Resto Baru" yang dibuka manual dari menu profil. */
function renderNewRestoListItems(items){
  const titleEl = document.getElementById('newRestoTitle');
  const introEl = document.getElementById('newRestoIntro');
  const list = document.getElementById('newRestoList');
  const markAllBtn = document.getElementById('markAllSeenBtn');
  if(items.length === 0){
    titleEl.textContent = '😌 Belum Ada Resto Baru';
    introEl.classList.add('hidden');
    introEl.textContent = '';
    list.innerHTML = '';
    markAllBtn.classList.add('hidden');
    return;
  }
  titleEl.textContent = '✨ Ada Resto Baru!';
  introEl.classList.remove('hidden');
  introEl.textContent = `${items.length} resto baru ditambahkan. Tap untuk langsung lihat:`;
  markAllBtn.classList.remove('hidden');
  list.innerHTML = items.map(r=>{
    const t = TYPES[r.type] || DEFAULT_TYPE_META;
    return `<div class="new-resto-item" data-id="${escapeAttr(r.id)}">${t.emoji} <b>${escapeHtml(r.name)}</b><span class="new-resto-sub">${escapeHtml(r.address || r.type)}</span></div>`;
  }).join('');
  list.querySelectorAll('.new-resto-item').forEach(el=>{
    el.onclick = ()=>{
      const r = allRestos[el.dataset.id];
      document.getElementById('newRestoOverlay').classList.add('hidden');
      if(r){ map.setView([r.lat, r.lng], 17); openDetail(r.id); }
    };
  });
}

/* Tombol "Sudah Lihat Semua" -- menandai SEMUA resto baru saat ini sebagai sudah dilihat,
   sama seperti membuka detailnya satu-satu, supaya notifikasi (popup & badge) tidak
   muncul lagi untuk resto-resto tersebut. */
async function markAllNewRestosSeen(){
  const newOnes = getNewRestosForMe();
  if(newOnes.length === 0) return;
  const ids = newOnes.map(r=>r.id);
  ids.forEach(id => seenRestoIds.add(id));
  try{
    await sb.from('seen_restos').upsert(ids.map(id => ({ resto_id: id, user_id: myUserId })));
  }catch(e){}
  renderMarkers();
  updateNewRestoMenuBadge();
  renderNewRestoListItems([]); // refresh panel ke tampilan "Belum Ada Resto Baru"
  showToast('Semua resto baru ditandai sudah dilihat');
}

function showNewRestoPopupIfNeeded(){
  if(!myUserId) return; // fitur personal, hanya untuk yang login
  const newOnes = getNewRestosForMe();
  if(newOnes.length === 0) return;
  const popped = getPoppedNewIds();
  const toAnnounce = newOnes.filter(r => !popped.has(r.id));
  if(toAnnounce.length === 0) return; // semua sudah pernah diberitahukan sebelumnya, tidak perlu popup lagi
  renderNewRestoListItems(toAnnounce);
  document.getElementById('newRestoOverlay').classList.remove('hidden');
  addPoppedNewIds(toAnnounce.map(r=>r.id)); // tandai sudah diberitahukan, popup otomatis tidak akan muncul lagi untuk ini
  // Catatan: walau popup otomatis tidak muncul lagi, resto tsb tetap terlihat di menu
  // "List Resto Baru" pada panel profil selama masih dalam masa NEW_RESTO_WINDOW_MS
  // dan belum dibuka detailnya / ditandai lewat "Sudah Lihat Semua" (lihat getNewRestosForMe / isNewForMe).
}

/* Dipanggil dari menu "List Resto Baru" di panel profil -- menampilkan SEMUA resto yang
   masih berstatus "baru" untuk user ini, terlepas dari apakah popup otomatisnya sudah
   pernah tampil atau belum. Ini yang memastikan user yang mengabaikan popup tetap bisa
   melihat kembali daftarnya kapan saja. */
function openNewRestoListPanel(){
  if(!requireLogin()) return;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  renderNewRestoListItems(getNewRestosForMe());
  document.getElementById('newRestoOverlay').classList.remove('hidden');
}

/* Render isi panel Wishlist: judul, teks intro, dan daftar resto yang di-wishlist user ini,
   mengikuti pola yang sama seperti panel "List Resto Baru". */
function renderWishlistItems(items){
  const titleEl = document.getElementById('wishlistTitle');
  const introEl = document.getElementById('wishlistIntro');
  const list = document.getElementById('wishlistList');
  if(items.length === 0){
    titleEl.textContent = '💭 Wishlist Masih Kosong';
    introEl.classList.add('hidden');
    introEl.textContent = '';
    list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Tap ❤️ Wishlist saat melihat detail resto untuk menambahkannya ke sini.</div>';
    return;
  }
  titleEl.textContent = '❤️ Wishlist Saya';
  introEl.classList.remove('hidden');
  introEl.textContent = `${items.length} resto di wishlist Anda. Tap untuk langsung lihat:`;
  list.innerHTML = items.map(r=>{
    const t = TYPES[r.type] || DEFAULT_TYPE_META;
    return `<div class="new-resto-item" data-id="${escapeAttr(r.id)}">${t.emoji} <b>${escapeHtml(r.name)}</b><span class="new-resto-sub">${escapeHtml(r.address || r.type)}</span></div>`;
  }).join('');
  list.querySelectorAll('.new-resto-item').forEach(el=>{
    el.onclick = ()=>{
      const r = allRestos[el.dataset.id];
      document.getElementById('wishlistOverlay').classList.add('hidden');
      if(r){ map.setView([r.lat, r.lng], 17); openDetail(r.id); }
    };
  });
}

function getWishlistedRestosForMe(){
  return Array.from(wishlistIds).map(id => allRestos[id]).filter(Boolean);
}

function openWishlistPanel(){
  if(!requireLogin()) return;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  renderWishlistItems(getWishlistedRestosForMe());
  document.getElementById('wishlistOverlay').classList.remove('hidden');
}

/* ================= LAPORAN / FEEDBACK ================= */
let reportContextRestoId = null;

/* Buka form kirim laporan. Jika dipanggil dari halaman detail resto, restoId & restoName
   diisi supaya laporan otomatis terhubung ke resto tsb (jenis default: data_error).
   Jika dipanggil dari panel akun (masukan umum), restoId kosong (jenis default: suggestion). */
function openReportModal(restoId, restoName){
  if(!requireLogin()) return;
  reportContextRestoId = restoId || null;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  const ctxLabel = document.getElementById('reportContextLabel');
  const typeSelect = document.getElementById('reportTypeSelect');
  if(restoId){
    // Laporan dari halaman detail resto: khusus data resto salah/tidak sesuai
    typeSelect.innerHTML = `<option value="data_error">Data Resto Salah/Tidak Sesuai</option>`;
    typeSelect.value = 'data_error';
    typeSelect.disabled = true;
    ctxLabel.textContent = `Terkait resto: ${restoName || ''}`;
    ctxLabel.classList.remove('hidden');
  }else{
    // Bantuan umum lewat panel akun: tidak termasuk jenis "Data Resto Salah"
    typeSelect.innerHTML = `
      <option value="bug">Bug / Error Aplikasi</option>
      <option value="suggestion">Saran / Masukan Fitur</option>
      <option value="other">Lainnya</option>`;
    typeSelect.value = 'bug';
    typeSelect.disabled = false;
    ctxLabel.classList.add('hidden');
  }
  document.getElementById('reportMessageInput').value = '';
  document.getElementById('reportStatus').textContent = '';
  document.getElementById('reportOverlay').classList.remove('hidden');
}

async function submitReport(){
  const type = document.getElementById('reportTypeSelect').value;
  const message = document.getElementById('reportMessageInput').value.trim();
  const statusEl = document.getElementById('reportStatus');
  if(!message){ statusEl.textContent = 'Tulis detail laporan dulu'; return; }
  statusEl.textContent = 'Mengirim...';
  const { error } = await sb.from('reports').insert({
    user_id: myUserId,
    resto_id: reportContextRestoId,
    type,
    message
  });
  if(error){ statusEl.textContent = 'Gagal: ' + error.message; return; }
  document.getElementById('reportOverlay').classList.add('hidden');
  showToast('Laporan terkirim, terima kasih! 🙏');
}

const REPORT_TYPE_LABELS = {
  data_error: '📍 Data Salah', bug: '🐞 Bug', suggestion: '💡 Saran', other: '📌 Lainnya'
};
const REPORT_STATUS_LABELS = { pending: 'Pending', reviewed: 'Ditinjau', resolved: 'Selesai' };
let currentReportFilter = 'pending';

async function openAdminReportsPanel(){
  if(!isAdmin) return;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('adminReportsOverlay').classList.remove('hidden');
  currentReportFilter = 'pending';
  document.querySelectorAll('.report-filter-tab').forEach(t=> t.classList.toggle('active', t.dataset.status === 'pending'));
  await loadAndRenderAdminReports();
}

/* ================= TITIK LOKASI LIVE (dipakai di peta utama & tampilan rute) ================= */
function createUserLocationLayer(mapInstance){
  const dotIcon = L.divIcon({
    className: '', html: '<div class="ull-pulse"></div><div class="ull-core"></div>',
    iconSize: [16,16], iconAnchor: [8,8]
  });
  const marker = L.marker([0,0], { icon: dotIcon, zIndexOffset: 1000, interactive: false }).addTo(mapInstance);
  const accuracyCircle = L.circle([0,0], {
    radius: 30, color: '#155C51', weight: 1,
    fillColor: '#155C51', fillOpacity: 0.10, opacity: 0.25, interactive: false
  }).addTo(mapInstance);
  return {
    marker, accuracyCircle,
    update(lat, lng, accuracy){
      marker.setLatLng([lat, lng]);
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(Math.max(accuracy || 30, 15));
    },
    remove(){
      try{ mapInstance.removeLayer(marker); }catch(e){}
      try{ mapInstance.removeLayer(accuracyCircle); }catch(e){}
    }
  };
}

/* ================= RUTE: pilihan Di Aplikasi (OSM+OSRM) vs Google Maps ================= */
let directionTarget = null;
let routeMap = null;
let routeControl = null;
let routeWatchId = null;
let routeUserLayer = null;
let routeDestMarker = null;
let routeFullCoords = null;
let routeTotalDistance = 0;
let routeTotalTime = 0;
let routeLastUserLatLng = null;

function openDirectionChoice(lat, lng, name){
  directionTarget = { lat, lng, name: name || 'Resto' };
  document.getElementById('directionChoiceOverlay').classList.remove('hidden');
}
function closeDirectionChoice(){
  document.getElementById('directionChoiceOverlay').classList.add('hidden');
}
function openGoogleMapsDirections(target){
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`, '_blank');
}

function closeRouteView(){
  document.getElementById('routeViewOverlay').classList.add('hidden');
  if(routeWatchId !== null){ navigator.geolocation.clearWatch(routeWatchId); routeWatchId = null; }
  if(routeUserLayer){ routeUserLayer.remove(); routeUserLayer = null; }
  routeDestMarker = null;
  routeFullCoords = null; routeTotalDistance = 0; routeTotalTime = 0; routeLastUserLatLng = null;
  if(routeControl && routeMap){ try{ routeMap.removeControl(routeControl); }catch(e){} routeControl = null; }
  if(routeMap){ try{ routeMap.remove(); }catch(e){} routeMap = null; }
}

// Hitung sisa jarak & waktu berdasarkan titik terdekat di jalur rute ke posisi user saat ini,
// tanpa panggil ulang OSRM (hemat kuota server demo & baterai).
function updateRouteProgress(userLatLng){
  if(!routeFullCoords || !routeFullCoords.length) return;
  const infoEl = document.getElementById('routeViewInfo');
  let nearestIdx = 0, nearestDist = Infinity;
  for(let i=0;i<routeFullCoords.length;i++){
    const d = userLatLng.distanceTo(routeFullCoords[i]);
    if(d < nearestDist){ nearestDist = d; nearestIdx = i; }
  }
  let remaining = nearestDist;
  for(let i=nearestIdx; i<routeFullCoords.length-1; i++){
    remaining += routeFullCoords[i].distanceTo(routeFullCoords[i+1]);
  }
  const avgSpeed = routeTotalTime > 0 ? (routeTotalDistance / routeTotalTime) : 0; // meter/detik
  const remainingTime = avgSpeed > 0 ? remaining / avgSpeed : 0;
  infoEl.classList.remove('rv-error');
  if(remaining < 40){
    infoEl.textContent = '🎉 Anda sudah sampai!';
  }else{
    const km = (remaining/1000).toFixed(1);
    const mins = Math.max(1, Math.round(remainingTime/60));
    infoEl.textContent = `🧭 ${km} km · ⏱️ sekitar ${mins} menit berkendara`;
  }
}

function openRouteView(target){
  document.getElementById('routeViewTitle').textContent = `Rute ke ${target.name}`;
  const infoEl = document.getElementById('routeViewInfo');
  infoEl.classList.remove('rv-error');
  infoEl.textContent = 'Mencari lokasi Anda...';
  document.getElementById('routeViewOverlay').classList.remove('hidden');

  if(!navigator.geolocation){
    infoEl.classList.add('rv-error');
    infoEl.textContent = 'Perangkat tidak mendukung deteksi lokasi. Coba Google Maps saja.';
    return;
  }
  // watchPosition dipakai (bukan sekali ambil) supaya posisi user ikut bergerak live selama menuju resto
  routeWatchId = navigator.geolocation.watchPosition(
    (pos)=>{
      const from = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if(!routeMap){
        initRouteMap(from, target);
      }else if(routeUserLayer){
        routeLastUserLatLng = L.latLng(from.lat, from.lng);
        routeUserLayer.update(from.lat, from.lng, pos.coords.accuracy);
        // TIDAK auto-pan/zoom ke posisi user di sini, biar user bebas geser/zoom peta sendiri.
        // Untuk kembali ke posisi user, tekan tombol kompas di peta rute.
        updateRouteProgress(routeLastUserLatLng);
      }
    },
    (err)=>{
      infoEl.classList.add('rv-error');
      infoEl.textContent = 'Tidak bisa akses lokasi Anda (izin ditolak/nonaktif). Coba Google Maps saja.';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
  );
}

function initRouteMap(from, target){
  const infoEl = document.getElementById('routeViewInfo');
  infoEl.textContent = 'Menghitung rute jalan...';

  routeMap = L.map('routeMapEl', { zoomControl: true }).setView([from.lat, from.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors'
  }).addTo(routeMap);

  // Marker tujuan (statis, resto)
  routeDestMarker = L.marker([target.lat, target.lng], {
    icon: L.divIcon({
      className: '', iconSize: [30,30], iconAnchor: [15,28],
      html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#C4691A;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:14px;">🍽️</span></div>`
    })
  }).addTo(routeMap);

  // Titik lokasi user, live & bisa gerak mengikuti pergerakan sebenarnya
  routeUserLayer = createUserLocationLayer(routeMap);
  routeUserLayer.update(from.lat, from.lng, 30);
  routeLastUserLatLng = L.latLng(from.lat, from.lng);

  let routeFinished = false;
  routeControl = L.Routing.control({
    waypoints: [ L.latLng(from.lat, from.lng), L.latLng(target.lat, target.lng) ],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
    routeWhileDragging: false,
    draggableWaypoints: false,
    addWaypoints: false,
    fitSelectedRoutes: true,
    show: false,
    lineOptions: { styles: [
      { color: '#0D2719', opacity: 0.15, weight: 9 },
      { color: '#ffffff', opacity: 0.8, weight: 6 },
      { color: '#5AB8F5', opacity: 1, weight: 4 } // biru muda, sengaja beda dari warna titik lokasi user (teal)
    ]},
    createMarker: ()=> null // marker start/tujuan kita gambar sendiri di atas, biar sesuai desain & bisa live update
  }).addTo(routeMap);

  routeControl.on('routesfound', (e)=>{
    routeFinished = true;
    const r = e.routes[0];
    routeFullCoords = r.coordinates;
    routeTotalDistance = r.summary.totalDistance;
    routeTotalTime = r.summary.totalTime;
    updateRouteProgress(routeLastUserLatLng);
  });
  routeControl.on('routingerror', ()=>{
    infoEl.classList.add('rv-error');
    infoEl.textContent = 'Gagal memuat rute (server rute lagi sibuk). Coba Google Maps saja.';
  });
  setTimeout(()=>{
    if(!routeFinished){
      infoEl.classList.add('rv-error');
      infoEl.textContent = 'Rute lama muncul, server rute mungkin sibuk. Coba Google Maps saja.';
    }
  }, 10000);
}

document.getElementById('dirChoiceGmapsBtn').onclick = ()=>{
  closeDirectionChoice();
  if(directionTarget) openGoogleMapsDirections(directionTarget);
};
document.getElementById('dirChoiceAppBtn').onclick = ()=>{
  closeDirectionChoice();
  if(directionTarget) openRouteView(directionTarget);
};
document.getElementById('dirChoiceCancelBtn').onclick = closeDirectionChoice;
document.getElementById('directionChoiceOverlay').onclick = (e)=>{
  if(e.target.id === 'directionChoiceOverlay') closeDirectionChoice();
};
document.getElementById('routeViewCloseBtn').onclick = closeRouteView;
document.getElementById('routeLocateBtn').onclick = ()=>{
  if(routeMap && routeLastUserLatLng) routeMap.setView(routeLastUserLatLng, routeMap.getZoom());
};
document.getElementById('routeViewGmapsBtn').onclick = ()=>{
  if(directionTarget) openGoogleMapsDirections(directionTarget);
};

/* ================= LINK KETERSEDIAAN ONLINE (submit oleh user, approval admin) ================= */
let linkSubmitContext = { restoId: null };

function openLinkSubmitPopup(restoId, presetPlatform){
  linkSubmitContext = { restoId };
  const rowsWrap = document.getElementById('linkSubmitPlatformRows');
  rowsWrap.innerHTML = Object.keys(PLATFORM_FILTER_META).map(p=>{
    const meta = PLATFORM_FILTER_META[p];
    const checked = presetPlatform === p ? 'checked' : '';
    return `<div class="platform-url-row" data-platform="${p}">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:4px;">
        <input type="checkbox" class="linksubmit-check" data-platform="${p}" ${checked}>
        ${platformIconHtml(meta.file, meta.emoji, 16)} ${p}
      </label>
      <input type="url" class="linksubmit-url" data-platform="${p}" placeholder="Link ke resto di ${p}" ${checked ? '' : 'style="display:none;"'}>
    </div>`;
  }).join('');
  rowsWrap.querySelectorAll('.linksubmit-check').forEach(cb=>{
    cb.onchange = ()=>{
      const urlInput = rowsWrap.querySelector(`.linksubmit-url[data-platform="${cb.dataset.platform}"]`);
      urlInput.style.display = cb.checked ? '' : 'none';
      if(!cb.checked) urlInput.value = '';
    };
  });
  document.getElementById('linkSubmitStatus').textContent = '';
  document.getElementById('linkSubmitOverlay').classList.remove('hidden');
}

async function sendLinkSubmission(){
  const statusEl = document.getElementById('linkSubmitStatus');
  const rows = Array.from(document.querySelectorAll('#linkSubmitPlatformRows .platform-url-row'));
  const platforms = [];
  for(const row of rows){
    const checkbox = row.querySelector('.linksubmit-check');
    const urlInput = row.querySelector('.linksubmit-url');
    if(checkbox.checked){
      const url = urlInput.value.trim();
      if(!url || !/^https?:\/\//i.test(url)){
        statusEl.textContent = `Isi link ${row.dataset.platform} dengan benar (harus diawali http:// atau https://)`;
        return;
      }
      platforms.push({ platform: row.dataset.platform, url });
    }
  }
  if(platforms.length === 0){
    statusEl.textContent = 'Centang minimal 1 platform dan isi linknya, atau pilih "Resto ini tidak menjual online"';
    return;
  }
  statusEl.textContent = 'Mengirim...';
  const { error } = await sb.from('online_link_submissions').insert({
    resto_id: linkSubmitContext.restoId,
    user_id: myUserId,
    platforms
  });
  if(error){ statusEl.textContent = 'Gagal: ' + error.message; return; }
  document.getElementById('linkSubmitOverlay').classList.add('hidden');
  showToast('Link terkirim, menunggu tinjauan admin 🙏');
}

async function sendNoOnlineSalesSubmission(){
  const statusEl = document.getElementById('linkSubmitStatus');
  statusEl.textContent = 'Mengirim...';
  const { error } = await sb.from('online_link_submissions').insert({
    resto_id: linkSubmitContext.restoId,
    user_id: myUserId,
    platforms: [],
    no_online_sales: true
  });
  if(error){ statusEl.textContent = 'Gagal: ' + error.message; return; }
  document.getElementById('linkSubmitOverlay').classList.add('hidden');
  showToast('Terkirim, menunggu tinjauan admin 🙏');
}

const LINK_SUBMISSION_STATUS_LABELS = { pending: 'Pending', approved: 'Disetujui', rejected: 'Ditolak' };
let currentLinkSubmissionFilter = 'pending';

async function openAdminLinkSubmissionsPanel(){
  if(!isAdmin) return;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('adminLinkSubmissionsOverlay').classList.remove('hidden');
  currentLinkSubmissionFilter = 'pending';
  document.querySelectorAll('#linkSubmissionFilterTabs .report-filter-tab').forEach(t=> t.classList.toggle('active', t.dataset.status === 'pending'));
  await loadAndRenderAdminLinkSubmissions();
}

async function loadAndRenderAdminLinkSubmissions(){
  const list = document.getElementById('adminLinkSubmissionsList');
  list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Memuat...</div>';
  let q = sb.from('online_link_submissions').select('*, restos(id, name)').order('created_at', {ascending:false});
  if(currentLinkSubmissionFilter !== 'all') q = q.eq('status', currentLinkSubmissionFilter);
  const { data, error } = await q;
  if(error){ list.innerHTML = `<div style="font-size:12.5px;color:var(--red);">Gagal memuat: ${escapeHtml(error.message)}</div>`; return; }
  if(!data || data.length === 0){
    list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Tidak ada usulan link di kategori ini.</div>';
    return;
  }
  const userIds = [...new Set(data.map(s=> s.user_id).filter(Boolean))];
  let usernameById = {};
  if(userIds.length){
    const { data: profilesData } = await sb.from('public_contributor_profiles').select('id, username').in('id', userIds);
    (profilesData || []).forEach(p=> usernameById[p.id] = p.username);
  }
  list.innerHTML = data.map(sub=>{
    const dateStr = new Date(sub.created_at).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
    const submitterName = (sub.user_id && usernameById[sub.user_id]) || 'Pengguna (tanpa username)';
    const restoLinkHtml = sub.restos ? `<div class="report-item-resto-link" data-resto-id="${escapeAttr(sub.restos.id)}">📍 ${escapeHtml(sub.restos.name)}</div>` : '';
    const platformsHtml = sub.no_online_sales
      ? `<div>🚫 <b>Diusulkan: Resto ini tidak menjual online</b></div>`
      : (sub.platforms||[]).map(p=> `<div>🔗 <b>${escapeHtml(p.platform)}</b>: <a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a></div>`).join('');
    const actionsHtml = sub.status === 'pending'
      ? `<div class="report-item-actions">
          <button data-action="approve">✅ Setujui</button>
          <button data-action="reject">🚫 Tolak</button>
        </div>`
      : '';
    return `<div class="report-item" data-submission-id="${escapeAttr(sub.id)}">
      <div class="report-item-top">
        <span class="link-status-chip ${sub.status}">${LINK_SUBMISSION_STATUS_LABELS[sub.status] || sub.status}</span>
      </div>
      <div class="report-item-meta">👤 ${escapeHtml(submitterName)} &middot; ${dateStr}</div>
      ${restoLinkHtml}
      <div class="report-item-msg">${platformsHtml}</div>
      ${actionsHtml}
    </div>`;
  }).join('');
  list.querySelectorAll('.report-item-resto-link').forEach(el=>{
    el.onclick = ()=>{
      const rid = el.dataset.restoId;
      const r = allRestos[rid];
      document.getElementById('adminLinkSubmissionsOverlay').classList.add('hidden');
      if(r){ map.setView([r.lat, r.lng], 17); openDetail(r.id); }
    };
  });
  list.querySelectorAll('.report-item').forEach(itemEl=>{
    const submissionId = itemEl.dataset.submissionId;
    const approveBtn = itemEl.querySelector('[data-action="approve"]');
    const rejectBtn = itemEl.querySelector('[data-action="reject"]');
    if(approveBtn) approveBtn.onclick = ()=> handleApproveLinkSubmission(submissionId);
    if(rejectBtn) rejectBtn.onclick = ()=> handleRejectLinkSubmission(submissionId);
  });
}

async function handleApproveLinkSubmission(submissionId){
  const { error } = await sb.rpc('approve_online_link_submission', { p_submission_id: submissionId });
  if(error){ showToast('Gagal approve: ' + error.message); return; }
  showToast('Link disetujui ✅');
  await loadAndRenderAdminLinkSubmissions();
  updatePendingLinkSubmissionsBadge();
  await loadAllRestos(); // muat ulang data resto supaya link baru langsung tampil
}

async function handleRejectLinkSubmission(submissionId){
  const note = prompt('Catatan penolakan (opsional):') || '';
  const { error } = await sb.rpc('reject_online_link_submission', { p_submission_id: submissionId, p_note: note });
  if(error){ showToast('Gagal tolak: ' + error.message); return; }
  showToast('Link ditolak');
  await loadAndRenderAdminLinkSubmissions();
  updatePendingLinkSubmissionsBadge();
}

/* Badge jumlah usulan link berstatus pending pada tombol menu admin "Kelola Link Online" */
async function updatePendingLinkSubmissionsBadge(){
  const btn = document.getElementById('openAdminLinkSubmissionsBtn');
  if(!btn || !isAdmin) return;
  try{
    const { count } = await sb.from('online_link_submissions').select('id', {count:'exact', head:true}).eq('status', 'pending');
    btn.textContent = count > 0 ? `🔗 Kelola Link Online (${count})` : '🔗 Kelola Link Online';
  }catch(e){ btn.textContent = '🔗 Kelola Link Online'; }
}

/* ================= LEADERBOARD KONTRIBUTOR — P1 TAHAP 9 ================= */
let currentLeaderboardPeriod='month';
let currentLeaderboardCity='all';
let leaderboardRows=[];
let leaderboardRequest=0;
let leaderboardLoaded=false;
let leaderboardAvatarUrls=new Map();
const leaderboardSafeUrl=value=>{
  if(typeof value!=='string')return '';
  try{const u=new URL(value,window.location.origin);return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch(_){return '';}
};
const leaderboardAvatar=(name,userId)=>{
  const initial=escapeHtml(Array.from(String(name||'?').trim())[0]||'?').toUpperCase();
  const url=leaderboardSafeUrl(leaderboardAvatarUrls.get(userId)||(userId===myUserId?myAvatarUrl:''));
  return '<span class="gm-lb-avatar" aria-hidden="true">'+
    (url?'<img src="'+escapeHtml(url)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">':'')+
    '<span class="gm-lb-avatar-initial">'+initial+'</span></span>';
};
const leaderboardCrown='<svg class="gm-lb-crown" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5 7.5 12l4.5-7 4.5 7 5-4.5-2 11H4.5l-2-11Z"/><path d="M5 21h14"/></svg>';

const leaderboardNumber=n=>Number(n||0).toLocaleString('id-ID');
const leaderboardCity=r=>String(r.city||'Domisili belum diisi').trim()||'Domisili belum diisi';


async function openLeaderboard(){
  if(typeof currentPrimaryView==='undefined'||currentPrimaryView!=='profile')
    document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('leaderboardOverlay').classList.remove('hidden');
  if(!leaderboardLoaded) await loadAndRenderLeaderboard();
}

function renderLeaderboard(){
  const wrap=document.getElementById('leaderboardContent');
  const rows=currentLeaderboardCity==='all'?leaderboardRows:leaderboardRows.filter(x=>leaderboardCity(x)===currentLeaderboardCity);
  if(!rows.length){
    wrap.innerHTML='<div class="gm-lb-empty">Belum ada Verified Contributor dengan poin pada periode dan domisili yang dipilih.</div>';
    return;
  }
  const groups=currentLeaderboardCity==='all'
    ?new Map([['',rows]])
    :new Map([[currentLeaderboardCity,rows]]);
  wrap.innerHTML=[...groups.entries()].map(([city,items])=>{
    const sorted=items.slice().sort((a,b)=>Number(b.points)-Number(a.points)||
      String(a.username||'').localeCompare(String(b.username||''),'id-ID')||
      String(a.user_id).localeCompare(String(b.user_id)));
    const card=(entry,index,podium)=>{
      const me=entry.user_id===myUserId;
      const name=me?'Kamu':entry.username||'Pengguna';
      const avatar=leaderboardAvatar(name,entry.user_id);
      if(podium)return '<div class="gm-lb-podium-card gm-lb-place-'+(index+1)+(me?' is-me':'')+'">'+
        '<div class="gm-lb-contender">'+(index===0?leaderboardCrown:'')+avatar+'<span class="gm-lb-name">'+escapeHtml(name)+'</span></div>'+
        '<div class="gm-lb-step"><strong class="gm-lb-step-rank">#'+(index+1)+'</strong>'+
        '<span class="gm-lb-step-points">'+leaderboardNumber(entry.points)+' pts</span></div></div>';
      return '<div class="gm-lb-row'+(me?' is-me':'')+'"><span class="gm-lb-rank">'+(index+1)+'</span>'+
        avatar+'<span class="gm-lb-name">'+escapeHtml(name)+'</span>'+
        '<strong class="gm-lb-points">'+leaderboardNumber(entry.points)+' pts</strong></div>';
    };
    const podium=sorted.slice(0,3).map((x,i)=>({x,i}));
    const arranged=[podium[1],podium[0],podium[2]];
    const top='<div class="gm-lb-podium">'+arranged.map(p=>p?card(p.x,p.i,true):'<div></div>').join('')+'</div>';
    const rest=sorted.slice(3,20).map((r,i)=>card(r,i+3,false)).join('');
    return '<section class="gm-lb-city">'+(city?'<div class="gm-lb-city-header"><h3>'+escapeHtml(city)+'</h3>'+
      '<span>'+leaderboardNumber(sorted.length)+' kontributor</span></div>':'')+top+
      (rest?'<div class="gm-lb-rows">'+rest+'</div>':'')+'</section>';
  }).join('');
}

async function renderLeaderboardPersonal(request){
  const wrap=document.getElementById('leaderboardMyProgress');
  if(isAdmin){
    wrap.innerHTML='<section class="gm-lb-personal">Admin tidak menerima poin dan tidak mengikuti Leaderboard.</section>';
    return;
  }
  if(!myUserId){
    wrap.innerHTML='<section class="gm-lb-personal">Masuk untuk melihat poin dan progres Verified Contributor. <button type="button" id="gmLbLogin">Masuk</button></section>';
    document.getElementById('gmLbLogin').onclick=()=>document.getElementById('loginOverlay').classList.remove('hidden');
    return;
  }
  const [profile,summary]=await Promise.all([
    sb.from('profiles').select('city,resto_approved_count,full_review_count,is_verified_contributor').eq('id',myUserId).maybeSingle(),
    sb.rpc('gm_my_profile_stats')
  ]);
  if(request!==leaderboardRequest)return;
  if(profile.error||summary.error){
    wrap.innerHTML='<section class="gm-lb-personal gm-lb-error">Statistik pribadi gagal dimuat. Gunakan tombol Perbarui untuk mencoba lagi.</section>';return;
  }
  const p=profile.data||{};
  const data=Array.isArray(summary.data)?summary.data[0]:summary.data;
  const verified=Boolean(p.is_verified_contributor);
  const domicile=String(p.city||'').trim();
  const group=leaderboardRows.filter(x=>leaderboardCity(x)===domicile).sort((a,b)=>Number(b.points)-Number(a.points)||
    String(a.username||'').localeCompare(String(b.username||''),'id-ID')||
    String(a.user_id).localeCompare(String(b.user_id)));
  const rank=verified&&domicile?group.findIndex(x=>x.user_id===myUserId)+1:0;
  const periodEntry=leaderboardRows.find(x=>x.user_id===myUserId);
  const approved=Math.min(3,Number(p.resto_approved_count)||0),reviews=Math.min(5,Number(p.full_review_count)||0);
  const progress=verified?'': '<div class="gm-lb-progress-compact"><span>Menuju Verified Contributor</span>'+
    '<small>'+approved+'/3 resto disetujui · '+reviews+'/5 review lengkap</small></div>';
  wrap.innerHTML='<section class="gm-lb-personal"><div class="gm-lb-personal-compact">'+
    '<div><strong>Peringkat Saya</strong><small>'+(rank?'#'+rank:'Belum masuk ranking')+' · '+escapeHtml(domicile||'Domisili belum diisi')+'</small></div>'+
    '<div class="gm-lb-personal-score"><strong>'+leaderboardNumber(periodEntry?.points)+' pts</strong>'+
    '<button type="button" class="gm-lb-points-link" id="gmLbPointsLink" aria-label="Lihat riwayat poin di Profile">›</button></div></div>'+
    progress+'</section>';
  document.getElementById('gmLbPointsLink').onclick=()=>{
    if(typeof navigatePrimaryView==='function')navigatePrimaryView('profile');
    if(typeof window.openProfilePoints==='function')window.openProfilePoints();
  };
}

async function loadAndRenderLeaderboard(){
  const request=++leaderboardRequest;
  const wrap=document.getElementById('leaderboardContent');
  const progress=document.getElementById('leaderboardMyProgress');
  const updated=document.getElementById('leaderboardUpdated');
  wrap.innerHTML='<div class="gm-lb-loading" role="status">Memuat papan peringkat…</div>';
  progress.innerHTML='<div class="gm-lb-loading">Memuat statistik pribadi…</div>';
  updated.textContent='';
  const {data,error}=await sb.rpc('gm_leaderboard',{p_period:currentLeaderboardPeriod});
  if(request!==leaderboardRequest)return;
  if(error){
    leaderboardLoaded=false;
    wrap.innerHTML='<div class="gm-lb-error" role="alert">Ranking gagal dimuat. Periksa koneksi dan coba lagi. <button id="gmLbRetry" type="button">Coba lagi</button></div>';
    document.getElementById('gmLbRetry').onclick=loadAndRenderLeaderboard;
    progress.innerHTML='';
    return;
  }
  leaderboardLoaded=true;
  leaderboardRows=Array.isArray(data)?data:[];
  // Read public profile photos only for contributors present in the ranking.
  // Keep initials if profile read is restricted or a photo is missing.
  leaderboardAvatarUrls=new Map();
  const ids=[...new Set(leaderboardRows.map(row=>row.user_id).filter(Boolean))];
  if(ids.length){
    try{
      const chunks=[];for(let i=0;i<ids.length;i+=100)chunks.push(ids.slice(i,i+100));
      const results=await Promise.all(chunks.map(chunk=>sb.from('profiles').select('id,avatar_url').in('id',chunk)));
      if(request!==leaderboardRequest)return;
      for(const result of results)if(!result.error)for(const profile of result.data||[])
        if(profile.avatar_url)leaderboardAvatarUrls.set(profile.id,profile.avatar_url);
    }catch(_){/* Keep initials if public avatars cannot be read. */}
  }
  if(request!==leaderboardRequest)return;

  const citySelect=document.getElementById('leaderboardCityFilter');
  const cities=[...new Set(leaderboardRows.map(leaderboardCity))].sort((a,b)=>a.localeCompare(b,'id-ID'));
  citySelect.innerHTML='<option value="all">Semua domisili</option>'+cities.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');
  if(currentLeaderboardCity!=='all'&&!cities.includes(currentLeaderboardCity))currentLeaderboardCity='all';
  citySelect.value=currentLeaderboardCity;
  renderLeaderboard();
  updated.textContent='';
  await renderLeaderboardPersonal(request);
}
async function loadAndRenderAdminReports(){
  const list = document.getElementById('adminReportsList');
  list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Memuat laporan...</div>';
  let q = sb.from('reports').select('*, restos(id, name)').order('created_at', {ascending:false});
  if(currentReportFilter !== 'all') q = q.eq('status', currentReportFilter);
  const { data, error } = await q;
  if(error){ list.innerHTML = `<div style="font-size:12.5px;color:var(--red);">Gagal memuat: ${escapeHtml(error.message)}</div>`; return; }
  if(!data || data.length === 0){
    list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Tidak ada laporan di kategori ini.</div>';
    return;
  }
  // Ambil username pelapor (reports.user_id -> profiles.id, tidak ada FK langsung untuk auto-embed,
  // jadi diambil terpisah lalu digabung manual berdasarkan id).
  const userIds = [...new Set(data.map(rep=> rep.user_id).filter(Boolean))];
  let usernameById = {};
  if(userIds.length){
    const { data: profilesData } = await sb.from('public_contributor_profiles').select('id, username').in('id', userIds);
    (profilesData || []).forEach(p=> usernameById[p.id] = p.username);
  }
  list.innerHTML = data.map(rep=>{
    const typeLabel = REPORT_TYPE_LABELS[rep.type] || rep.type;
    const dateStr = new Date(rep.created_at).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
    const reporterName = (rep.user_id && usernameById[rep.user_id]) || 'Pengguna (tanpa username)';
    const restoLinkHtml = rep.restos ? `<div class="report-item-resto-link" data-resto-id="${escapeAttr(rep.restos.id)}">📍 ${escapeHtml(rep.restos.name)}</div>` : '';
    return `<div class="report-item" data-report-id="${escapeAttr(rep.id)}">
      <div class="report-item-top">
        <span class="report-type-chip">${typeLabel}</span>
        <span class="report-status-chip ${rep.status}">${REPORT_STATUS_LABELS[rep.status] || rep.status}</span>
      </div>
      <div class="report-item-meta">👤 ${escapeHtml(reporterName)} &middot; ${dateStr}</div>
      ${restoLinkHtml}
      <div class="report-item-msg">${escapeHtml(rep.message)}</div>
      <div class="report-item-actions">
        <button data-action="reviewed" class="${rep.status === 'reviewed' ? 'active-status' : ''}">Tandai Ditinjau</button>
        <button data-action="resolved" class="${rep.status === 'resolved' ? 'active-status' : ''}">Tandai Selesai</button>
      </div>
      <div class="report-item-reply">
        <label>Balasan Admin</label>
        <textarea class="report-note-input" placeholder="Tulis balasan/catatan untuk pengguna...">${rep.admin_note ? escapeHtml(rep.admin_note) : ''}</textarea>
        <button class="report-note-save-btn" data-action="save-note">Simpan Balasan</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.report-item-resto-link').forEach(el=>{
    el.onclick = ()=>{
      const rid = el.dataset.restoId;
      const r = allRestos[rid];
      document.getElementById('adminReportsOverlay').classList.add('hidden');
      if(r){ map.setView([r.lat, r.lng], 17); openDetail(r.id); }
    };
  });
  list.querySelectorAll('.report-item').forEach(itemEl=>{
    const reportId = itemEl.dataset.reportId;
    itemEl.querySelectorAll('.report-item-actions button').forEach(btn=>{
      btn.onclick = ()=> updateReportStatus(reportId, btn.dataset.action);
    });
    const saveBtn = itemEl.querySelector('.report-note-save-btn');
    if(saveBtn){
      saveBtn.onclick = ()=>{
        const noteVal = itemEl.querySelector('.report-note-input').value.trim();
        saveReportNote(reportId, noteVal);
      };
    }
  });
}

async function updateReportStatus(reportId, status){
  const { error } = await sb.from('reports').update({ status, updated_at: new Date().toISOString() }).eq('id', reportId);
  if(error){ showToast('Gagal update laporan: ' + error.message); return; }
  showToast('Status laporan diperbarui');
  await loadAndRenderAdminReports();
  updatePendingReportsBadge();
}

/* Admin menyimpan balasan/catatan untuk sebuah laporan. Catatan ini akan tampil ke user
   yang bersangkutan lewat panel "Laporan Saya". */
async function saveReportNote(reportId, note){
  const { error } = await sb.from('reports').update({ admin_note: note, updated_at: new Date().toISOString() }).eq('id', reportId);
  if(error){ showToast('Gagal simpan balasan: ' + error.message); return; }
  showToast('Balasan tersimpan');
  await loadAndRenderAdminReports();
}

/* Panel "Laporan Saya": user melihat status tindak lanjut laporan yang pernah dia kirim sendiri.
   Read-only -- tidak ada tombol ubah status, hanya menampilkan status & catatan admin (jika ada). */
async function openMyReportsPanel(){
  if(!requireLogin()) return;
  if(typeof currentPrimaryView === 'undefined' || currentPrimaryView !== 'profile') document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('myReportsOverlay').classList.remove('hidden');
  await loadAndRenderMyReports();
}

async function loadAndRenderMyReports(){
  const list = document.getElementById('myReportsList');
  list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Memuat laporan...</div>';
  const { data, error } = await sb.from('reports').select('*, restos(id, name)').eq('user_id', myUserId).order('created_at', {ascending:false});
  if(error){ list.innerHTML = `<div style="font-size:12.5px;color:var(--red);">Gagal memuat: ${escapeHtml(error.message)}</div>`; return; }
  if(!data || data.length === 0){
    list.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Anda belum pernah mengirim laporan.</div>';
    return;
  }
  list.innerHTML = data.map(rep=>{
    const typeLabel = REPORT_TYPE_LABELS[rep.type] || rep.type;
    const dateStr = new Date(rep.created_at).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
    const restoLinkHtml = rep.restos ? `<div class="report-item-resto-link" data-resto-id="${escapeAttr(rep.restos.id)}">📍 ${escapeHtml(rep.restos.name)}</div>` : '';
    const noteHtml = rep.admin_note ? `<div class="report-item-note"><div class="report-item-note-title">💬 Balasan Admin:</div><div class="report-item-note-body">${escapeHtml(rep.admin_note)}</div></div>` : '';
    return `<div class="report-item">
      <div class="report-item-top">
        <span class="report-type-chip">${typeLabel}</span>
        <span class="report-status-chip ${rep.status}">${REPORT_STATUS_LABELS[rep.status] || rep.status}</span>
      </div>
      ${restoLinkHtml}
      <div class="report-item-msg">${escapeHtml(rep.message)}</div>
      ${noteHtml}
      <div class="report-item-meta">${dateStr}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('.report-item-resto-link').forEach(el=>{
    el.onclick = ()=>{
      const rid = el.dataset.restoId;
      const r = allRestos[rid];
      document.getElementById('myReportsOverlay').classList.add('hidden');
      if(r){ map.setView([r.lat, r.lng], 17); openDetail(r.id); }
    };
  });
}

function emptyHours(){
  const h = {};
  DAYS.forEach(d => h[d] = {closed:false, open:'08:00', close:'22:00'});
  return h;
}

/* Cek apakah resto buka pada hari+jam tertentu. Mendukung jam tutup lewat tengah malam. */
function isOpenAt(hoursByDay, day, timeStr){
  if(!hoursByDay) return true; // data lama tanpa jam, jangan disembunyikan
  const today = hoursByDay[day];
  if(!today || today.closed) return false;
  const [oh, om] = today.open.split(':').map(Number);
  const [ch, cm] = today.close.split(':').map(Number);
  const [th, tm] = timeStr.split(':').map(Number);
  const openMin = oh*60+om, closeMin = ch*60+cm, tMin = th*60+tm;
  if(closeMin > openMin) return tMin >= openMin && tMin <= closeMin;
  // lewat tengah malam, mis. buka 18:00 tutup 02:00
  return tMin >= openMin || tMin <= closeMin;
}

function currentDayName(){
  const idx = new Date().getDay(); // 0=Minggu
  return DAYS[(idx + 6) % 7];
}
function currentTimeStr(){
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
