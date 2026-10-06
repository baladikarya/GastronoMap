/* ================= UTIL ================= */
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 2200);
}

/* ================= EVENTS ================= */
document.getElementById('fab').onclick = ()=>{ setHomeView('map'); refreshMyGpsLocation(); openForm(null); };

/* ---------- BOTTOM NAVIGATION ---------- */
const NAV_VIEW_TO_BUTTON = {
  home: 'navHomeBtn',
  community: 'navCommunityBtn',
  leaderboard: 'navLeaderboardBtn',
  more: 'navMoreBtn'
};
let currentPrimaryView = 'home';

function setActiveNavTab(activeId){
  document.querySelectorAll('#bottomNav .nav-item').forEach(el=>{
    const isActive = el.id === activeId;
    el.classList.toggle('active', isActive);
    if(isActive && el.id !== 'navAddBtn') el.setAttribute('aria-current','page');
    else el.removeAttribute('aria-current');
  });
}

function hidePrimaryViews(){
  document.getElementById('communityView').classList.add('hidden');
  document.getElementById('moreView').classList.add('hidden');
  document.getElementById('leaderboardOverlay').classList.add('hidden');
}

function closeHomeOverlays(){
  setHomeView('map');
  document.getElementById('detailPanel').classList.add('hidden');
  document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('wishlistOverlay').classList.add('hidden');
  document.getElementById('filterOverlay').classList.add('hidden');
  closePreviewCard();
}

function navigatePrimaryView(view, options = {}){
  const target = NAV_VIEW_TO_BUTTON[view] ? view : 'home';
  hidePrimaryViews();
  document.getElementById('accountOverlay').classList.add('hidden');
  document.getElementById('filterOverlay').classList.add('hidden');
  closePreviewCard();

  if(target === 'home'){
    closeHomeOverlays();
  }else if(target === 'community'){
    document.getElementById('detailPanel').classList.add('hidden');
    document.getElementById('communityView').classList.remove('hidden');
  }else if(target === 'leaderboard'){
    document.getElementById('detailPanel').classList.add('hidden');
    openLeaderboard();
  }else if(target === 'more'){
    document.getElementById('detailPanel').classList.add('hidden');
    document.getElementById('moreView').classList.remove('hidden');
  }

  currentPrimaryView = target;
  setActiveNavTab(NAV_VIEW_TO_BUTTON[target]);

  if(options.history !== false){
    const currentStateView = history.state && history.state.gmView;
    if(currentStateView !== target){
      history.pushState({ ...(history.state || {}), gmView: target }, '', window.location.href);
    }
  }
}

function navigateBackHome(){
  if(currentPrimaryView !== 'home' && history.state && history.state.gmView === currentPrimaryView){
    history.back();
  }else{
    navigatePrimaryView('home', {history:false});
  }
}

document.getElementById('navHomeBtn').onclick = ()=> navigatePrimaryView('home');
document.getElementById('navCommunityBtn').onclick = ()=> navigatePrimaryView('community');
document.getElementById('navAddBtn').onclick = ()=>{
  setHomeView('map');
  refreshMyGpsLocation();
  openForm(null);
};
document.getElementById('navLeaderboardBtn').onclick = ()=> navigatePrimaryView('leaderboard');
document.getElementById('navMoreBtn').onclick = ()=> navigatePrimaryView('more');
document.getElementById('communityBackBtn').onclick = navigateBackHome;
document.getElementById('moreBackBtn').onclick = navigateBackHome;

history.replaceState({ ...(history.state || {}), gmView: 'home' }, '', window.location.href);
window.addEventListener('popstate', (event)=>{
  navigatePrimaryView((event.state && event.state.gmView) || 'home', {history:false});
});

document.getElementById('previewCardCloseBtn').onclick = (e)=>{ e.stopPropagation(); closePreviewCard(); };
document.getElementById('closeDetail').onclick = closeDetail;
document.getElementById('cancelForm').onclick = closeForm;
document.getElementById('modalOverlay').onclick = (e)=>{
  if(e.target.id === 'modalOverlay') closeForm();
};
document.getElementById('pinPeekConfirmBtn').onclick = exitPinPeek;
document.getElementById('adjustPinLinkBtn').onclick = ()=>{
  if(pickedLatLng) map.setView([pickedLatLng.lat, pickedLatLng.lng], map.getZoom() < 16 ? 17 : map.getZoom());
  enterPinPeek();
};
document.getElementById('saveForm').onclick = handleSave;
document.getElementById('addRefUrlBtn').onclick = ()=> addRefUrlRow('');
document.getElementById('addFavBtn').onclick = ()=> addFavRow('');
let nameSearchDebounce = null;
document.getElementById('f_name').addEventListener('input', (e)=>{
  clearTimeout(nameSearchDebounce);
  const val = e.target.value.trim();
  nameSearchDebounce = setTimeout(()=> searchLocation(val, document.getElementById('nameSuggestions')), 400);
});
document.getElementById('f_name').addEventListener('blur', ()=>{
  setTimeout(()=> document.getElementById('nameSuggestions').classList.add('hidden'), 200);
});
document.getElementById('f_address').oninput = (e)=>{
  clearTimeout(locSearchDebounce);
  const val = e.target.value.trim();
  locSearchDebounce = setTimeout(()=> searchLocation(val, document.getElementById('locSuggestions')), 400);
};
document.getElementById('f_address').addEventListener('blur', ()=>{
  setTimeout(()=> document.getElementById('locSuggestions').classList.add('hidden'), 200);
});
document.getElementById('useMyLocationBtn').onclick = useMyLocationNow;
document.getElementById('menuPhotoCameraBtn').onclick = ()=>{ if(requireLogin()) document.getElementById('menuPhotoCameraInput').click(); };
document.getElementById('menuPhotoGalleryBtn').onclick = ()=>{ if(requireLogin()) document.getElementById('menuPhotoGalleryInput').click(); };
const handleMenuPhotoPick = async (e)=>{
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const url = await uploadMenuImage(file);
  if(url){ formMenuImages.push(url); renderMenuPhotoGrid(); }
};
document.getElementById('menuPhotoCameraInput').onchange = handleMenuPhotoPick;
document.getElementById('menuPhotoGalleryInput').onchange = handleMenuPhotoPick;
document.getElementById('visitPhotoCameraBtn').onclick = ()=>{ if(requireLogin()) document.getElementById('visitPhotoCameraInput').click(); };
document.getElementById('visitPhotoGalleryBtn').onclick = ()=>{ if(requireLogin()) document.getElementById('visitPhotoGalleryInput').click(); };
const handleVisitPhotoPick = async (e)=>{
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  showToast('Memeriksa wajah pada foto...');
  const blob = await prepareVisitPhotoBlob(file);
  if(!blob) return; // user membatalkan foto ini lewat modal konfirmasi
  formVisitPhotos.push({ blob, previewUrl: URL.createObjectURL(blob) });
  renderVisitPhotoGrid();
};
document.getElementById('visitPhotoCameraInput').onchange = handleVisitPhotoPick;
document.getElementById('visitPhotoGalleryInput').onchange = handleVisitPhotoPick;
renderFormRatingPicker();
document.getElementById('searchInput').oninput = ()=>{
  renderMarkers();
  renderSearchSuggestions();
  document.getElementById('searchClearBtn').classList.toggle('hidden', !document.getElementById('searchInput').value);
};
document.getElementById('searchInput').onfocus = renderSearchSuggestions;
document.getElementById('searchClearBtn').onclick = ()=>{
  const input = document.getElementById('searchInput');
  input.value = '';
  document.getElementById('searchClearBtn').classList.add('hidden');
  document.getElementById('searchSuggestions').classList.add('hidden');
  renderMarkers();
  input.focus();
};
document.getElementById('searchInput').addEventListener('blur', ()=>{
  setTimeout(()=> document.getElementById('searchSuggestions').classList.add('hidden'), 150);
});

document.getElementById('tf_day').value = currentDayName();
document.getElementById('tf_time').value = currentTimeStr();

document.getElementById('filterOverlay').onclick = (e)=>{
  if(e.target.id === 'filterOverlay') document.getElementById('filterOverlay').classList.add('hidden');
};

document.getElementById('filterApplyAllBtn').onclick = ()=>{
  activeTypeFilters = new Set(Array.from(document.querySelectorAll('#typeCheckList input:checked')).map(el=>el.value));
  activePlatformFilters = new Set(Array.from(document.querySelectorAll('#platformCheckList input:checked')).map(el=>el.value));
  activePriceFilters = new Set(Array.from(document.querySelectorAll('#priceCheckList input:checked')).map(el=>el.value));
  openNowFilter = document.getElementById('openNowFilterInput').checked;
  if(openNowFilter){
    timeFilter = null;
  }else if(document.getElementById('tf_enable').checked){
    timeFilter = { day: document.getElementById('tf_day').value, time: document.getElementById('tf_time').value || currentTimeStr() };
  }else{
    timeFilter = null;
  }
  visitFilter = document.getElementById('visitFilterSelect').value || null;
  wishlistFilter = document.getElementById('wishlistFilterSelect').value || null;
  renderFilterChips(); // sinkronkan chip kategori cepat dengan checkbox tipe yang baru diterapkan
  document.getElementById('filterOverlay').classList.add('hidden');
  renderMarkers();
  showToast('Filter diterapkan');
};

document.getElementById('filterResetAllBtn').onclick = ()=>{
  activeTypeFilters = new Set();
  activePlatformFilters = new Set();
  activePriceFilters = new Set();
  openNowFilter = false;
  timeFilter = null;
  visitFilter = null;
  wishlistFilter = null;
  document.getElementById('openNowFilterInput').checked = false;
  document.getElementById('tf_enable').checked = false;
  document.getElementById('tf_day').value = currentDayName();
  document.getElementById('tf_time').value = currentTimeStr();
  document.getElementById('visitFilterSelect').value = '';
  document.getElementById('wishlistFilterSelect').value = '';
  renderFilterChips(); // sinkronkan chip kategori cepat setelah reset
  document.getElementById('filterOverlay').classList.add('hidden');
  renderMarkers();
  showToast('Semua filter direset');
};
let mainLiveTracking = null; // {watchId, layer}
document.getElementById('locateBtn').onclick = ()=>{
  const btn = document.getElementById('locateBtn');
  if(mainLiveTracking){
    navigator.geolocation.clearWatch(mainLiveTracking.watchId);
    mainLiveTracking.layer.remove();
    mainLiveTracking = null;
    btn.classList.remove('locate-active');
    showToast('Pelacakan lokasi dimatikan');
    return;
  }
  if(!navigator.geolocation){ showToast('HP/browser ini tidak mendukung deteksi lokasi'); return; }
  const layer = createUserLocationLayer(map);
  let firstFix = true;
  const watchId = navigator.geolocation.watchPosition(
    (pos)=>{
      const { latitude, longitude, accuracy } = pos.coords;
      layer.update(latitude, longitude, accuracy);
      if(firstFix){ map.setView([latitude, longitude], 16); firstFix = false; }
    },
    ()=>{
      showToast('Tidak bisa mengambil lokasi');
      layer.remove();
      mainLiveTracking = null;
      btn.classList.remove('locate-active');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  mainLiveTracking = { watchId, layer };
  btn.classList.add('locate-active');
  showToast('Melacak lokasi Anda secara live 📍');
};
document.getElementById('logo').onclick = refreshAllData;
document.getElementById('accountOverlay').onclick = (e)=>{ if(e.target.id === 'accountOverlay') document.getElementById('accountOverlay').classList.add('hidden'); };
document.getElementById('accountAvatarWrap').onclick = ()=> document.getElementById('avatarInput').click();
document.getElementById('avatarInput').onchange = (e)=>{
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(file) uploadAvatar(file);
};
document.getElementById('editProfileAgainBtn').onclick = ()=> openProfileCompletionModal(true);
document.getElementById('logoutBtn').onclick = ()=>{
  document.getElementById('accountOverlay').classList.add('hidden');
  signOut();
};
document.getElementById('openNewRestoListBtn').onclick = openNewRestoListPanel;
document.getElementById('guideMenuToggle').onclick = ()=>{
  document.getElementById('guideSubmenu').classList.toggle('hidden');
  document.getElementById('guideMenuArrow').classList.toggle('open');
};
document.getElementById('openInstallGuideBtn').onclick = ()=> openGuidePanel('install');
document.getElementById('openUsageGuideBtn').onclick = ()=> openGuidePanel('usage');
document.getElementById('closeGuideBtn').onclick = ()=> document.getElementById('guideOverlay').classList.add('hidden');
document.getElementById('guideOverlay').onclick = (e)=>{ if(e.target.id === 'guideOverlay') document.getElementById('guideOverlay').classList.add('hidden'); };
document.getElementById('closeNewRestoBtn').onclick = ()=> document.getElementById('newRestoOverlay').classList.add('hidden');
document.getElementById('markAllSeenBtn').onclick = markAllNewRestosSeen;
document.getElementById('dismissNewRestoBtn').onclick = ()=> document.getElementById('newRestoOverlay').classList.add('hidden');
document.getElementById('newRestoOverlay').onclick = (e)=>{ if(e.target.id === 'newRestoOverlay') document.getElementById('newRestoOverlay').classList.add('hidden'); };
document.getElementById('openWishlistBtn').onclick = openWishlistPanel;
document.getElementById('closeWishlistBtn').onclick = ()=> document.getElementById('wishlistOverlay').classList.add('hidden');
document.getElementById('wishlistOverlay').onclick = (e)=>{ if(e.target.id === 'wishlistOverlay') document.getElementById('wishlistOverlay').classList.add('hidden'); };

document.getElementById('reportMenuToggle').onclick = ()=>{
  document.getElementById('reportSubmenu').classList.toggle('hidden');
  document.getElementById('reportMenuArrow').classList.toggle('open');
};
document.getElementById('openReportBtn').onclick = ()=> openReportModal(null, null);
document.getElementById('reportSubmitBtn').onclick = submitReport;
document.getElementById('reportCancelBtn').onclick = ()=> document.getElementById('reportOverlay').classList.add('hidden');
document.getElementById('reportOverlay').onclick = (e)=>{ if(e.target.id === 'reportOverlay') document.getElementById('reportOverlay').classList.add('hidden'); };

document.getElementById('openMyReportsBtn').onclick = openMyReportsPanel;
document.getElementById('closeMyReportsBtn').onclick = ()=> document.getElementById('myReportsOverlay').classList.add('hidden');
document.getElementById('myReportsOverlay').onclick = (e)=>{ if(e.target.id === 'myReportsOverlay') document.getElementById('myReportsOverlay').classList.add('hidden'); };

document.getElementById('openAdminReportsBtn').onclick = openAdminReportsPanel;
document.getElementById('closeAdminReportsBtn').onclick = ()=> document.getElementById('adminReportsOverlay').classList.add('hidden');
document.getElementById('adminReportsOverlay').onclick = (e)=>{ if(e.target.id === 'adminReportsOverlay') document.getElementById('adminReportsOverlay').classList.add('hidden'); };
document.querySelectorAll('.report-filter-tab').forEach(tab=>{
  tab.onclick = ()=>{
    document.querySelectorAll('.report-filter-tab').forEach(t=> t.classList.remove('active'));
    tab.classList.add('active');
    currentReportFilter = tab.dataset.status;
    loadAndRenderAdminReports();
  };
});

document.getElementById('closeLeaderboardBtn').onclick = navigateBackHome;
document.getElementById('leaderboardOverlay').onclick = (e)=>{ if(e.target.id === 'leaderboardOverlay') navigateBackHome(); };
document.querySelectorAll('#leaderboardPeriodTabs .leaderboard-period-tab').forEach(tab=>{
  tab.onclick = ()=>{
    document.querySelectorAll('#leaderboardPeriodTabs .leaderboard-period-tab').forEach(t=> t.classList.remove('active'));
    tab.classList.add('active');
    currentLeaderboardPeriod = tab.dataset.period;
    loadAndRenderLeaderboard();
  };
});

document.getElementById('openAdminLinkSubmissionsBtn').onclick = openAdminLinkSubmissionsPanel;
document.getElementById('closeAdminLinkSubmissionsBtn').onclick = ()=> document.getElementById('adminLinkSubmissionsOverlay').classList.add('hidden');
document.getElementById('adminLinkSubmissionsOverlay').onclick = (e)=>{ if(e.target.id === 'adminLinkSubmissionsOverlay') document.getElementById('adminLinkSubmissionsOverlay').classList.add('hidden'); };
document.querySelectorAll('#linkSubmissionFilterTabs .report-filter-tab').forEach(tab=>{
  tab.onclick = ()=>{
    document.querySelectorAll('#linkSubmissionFilterTabs .report-filter-tab').forEach(t=> t.classList.remove('active'));
    tab.classList.add('active');
    currentLinkSubmissionFilter = tab.dataset.status;
    loadAndRenderAdminLinkSubmissions();
  };
});

document.getElementById('linkSubmitSendBtn').onclick = sendLinkSubmission;
document.getElementById('linkSubmitNotOnlineBtn').onclick = sendNoOnlineSalesSubmission;
document.getElementById('linkSubmitCancelBtn').onclick = ()=> document.getElementById('linkSubmitOverlay').classList.add('hidden');
document.getElementById('linkSubmitOverlay').onclick = (e)=>{ if(e.target.id === 'linkSubmitOverlay') document.getElementById('linkSubmitOverlay').classList.add('hidden'); };

function hideSplash(){
  document.getElementById('splashOverlay').classList.add('hidden');
}
function hideSplashLoader(){
  document.getElementById('splashLoader').classList.add('hidden');
}
document.getElementById('splashStartBtn').onclick = hideSplash;
document.getElementById('splashLoginBtn').onclick = ()=>{
  // Form Masuk/Daftar ditanam di splash sendiri -- BUKAN buka modal #loginOverlay.
  document.getElementById('splashActions').classList.remove('ready');
  document.getElementById('splashAuthForm').classList.add('show');
  document.getElementById('splashOverlay').classList.add('auth-mode');
};
document.getElementById('splashAuthBackBtn').onclick = ()=>{
  document.getElementById('splashAuthForm').classList.remove('show');
  document.getElementById('splashActions').classList.add('ready');
  document.getElementById('splashOverlay').classList.remove('auth-mode');
};
document.getElementById('splashSendLinkBtn').onclick = ()=> sendMagicLink('splashEmailInput','splashLoginStatus');
document.getElementById('splashGoogleBtn').onclick = signInWithGoogle;

// Splash tampil TIAP kali app dibuka, tapi perilakunya beda tergantung status login:
// - Sudah login (sesi tersimpan valid)  -> splash tampil sebentar lalu otomatis lanjut ke home.
// - Belum login / sudah logout          -> splash tetap tampil dengan pilihan "Mulai Jelajah" / "Masuk & Daftar".
// Timeout dipasang supaya kalau koneksi lemot, splash tidak nyangkut selamanya di posisi "mengecek".
async function runSplashSessionCheck(){
  const MIN_DISPLAY_MS = 3000; // splash tetap terlihat ~3 detik biar tagline sempat kebaca, tidak langsung "kedip" lewat
  const started = Date.now();
  let session = null;
  try{
    const sessionCheck = sb.auth.getSession().then(r => r.data.session);
    const timeout = new Promise(resolve => setTimeout(()=> resolve(null), 2500));
    session = await Promise.race([sessionCheck, timeout]);
  }catch(e){ session = null; }

  const elapsed = Date.now() - started;
  if(elapsed < MIN_DISPLAY_MS) await new Promise(r => setTimeout(r, MIN_DISPLAY_MS - elapsed));

  hideSplashLoader(); // titik tunggu selesai -> matikan animasi loading dots
  if(session && session.user){
    hideSplash(); // sudah login -> langsung ke home, tanpa perlu pilih apa pun
  }else{
    document.getElementById('splashActions').classList.add('ready'); // belum login -> tampilkan pilihan
  }
}

document.getElementById('userBadge').onclick = openAccountPanel;
document.getElementById('loginSendBtn').onclick = sendMagicLink;
document.getElementById('loginGoogleBtn').onclick = signInWithGoogle;
document.getElementById('loginCancelBtn').onclick = ()=> document.getElementById('loginOverlay').classList.add('hidden');
document.getElementById('profileSaveBtn').onclick = saveProfile;
document.getElementById('profileCancelBtn').onclick = ()=>{
  document.getElementById('profileOverlay').classList.add('hidden');
};

if('serviceWorker' in navigator){
  window.addEventListener('load', async ()=>{
    try{
      const reg = await navigator.serviceWorker.register('service-worker.js');
      reg.update(); // paksa cek versi baru begitu app dibuka, tidak nunggu jadwal 24 jam browser

      // Cek ulang tiap kali app dibuka lagi dari background (umum terjadi di PWA HP
      // yang "dilanjutkan" bukan benar-benar ditutup)
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'visible') reg.update();
      });

      // Sambil app terbuka lama, cek ulang tiap 1 jam
      setInterval(()=> reg.update(), 60 * 60 * 1000);
    }catch(e){ /* abaikan kalau gagal daftar SW */ }
  });

  // Begitu versi baru selesai dipasang & ambil alih -> reload otomatis,
  // supaya user langsung dapat versi terbaru TANPA perlu uninstall/install ulang.
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}
