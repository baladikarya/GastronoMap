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
})();
