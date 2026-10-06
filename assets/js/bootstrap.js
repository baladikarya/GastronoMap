/* ================= START ================= */
initMap();
renderFilterChips();
populateTypeSelect();
initPlatformPicker();
refreshMyGpsLocation();
runSplashSessionCheck();
(async ()=>{
  await initIdentity();
  await loadAllRestos();
  setTimeout(showNewRestoPopupIfNeeded, 700); // beri jeda dikit supaya tidak "nabrak" modal lengkapi profil
})();
