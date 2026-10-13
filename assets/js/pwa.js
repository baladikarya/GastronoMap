/* P2-14 install, offline and opt-in update UX. No cached account or API data. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const offline = $('pwaOfflineBanner');
  const update = $('pwaUpdateBanner');
  const install = $('pwaInstallBanner');
  let registration = null;
  let installEvent = null;
  let requestedRefresh = false;
  let installDismissed = false;
  let updateDismissed = false;
  const standalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const notice = (element, visible) => element && element.classList.toggle('hidden', !visible);

  function hasPotentialDraft() {
    const addResto = $('modalOverlay');
    if (addResto && !addResto.classList.contains('hidden')) return true;
    const composer = document.querySelector('.community-composer:not([hidden])');
    if (composer) return true;
    const profile = $('profileOverlay');
    if (profile && !profile.classList.contains('hidden')) return true;
    return false;
  }
  function mayReload() {
    return !hasPotentialDraft() ||
      window.confirm('Ada formulir atau postingan yang mungkin belum disimpan. Muat ulang dan buang perubahan yang belum disimpan?');
  }
  function renderConnectivity() {
    const isOffline = !navigator.onLine;
    notice(offline, isOffline);
    if (isOffline) {
      notice(install, false);
    } else {
      renderInstall();
    }
  }
  function renderInstall() {
    notice(install, Boolean(installEvent) && !standalone() && !installDismissed && navigator.onLine);
    const guideButton = $('pwaInstallNowBtn');
    if (guideButton) guideButton.hidden = !(installEvent && !standalone());
  }
  function renderUpdate() {
    notice(update, Boolean(registration && registration.waiting && navigator.serviceWorker.controller && !updateDismissed));
  }
  function updateGuide() {
    const content = $('guideContent');
    if (!content || !$('guidePanel') || $('guideOverlay').classList.contains('hidden')) return;
    if (!$('pwaInstallNowBtn')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'pwaInstallNowBtn';
      button.className = 'ui-button ui-button--primary pwa-guide-install';
      button.textContent = 'Instal GastronoMap';
      button.addEventListener('click', promptInstall);
      content.prepend(button);
    }
    if (!$('pwaInstallNote')) {
      const message = document.createElement('p');
      message.id = 'pwaInstallNote';
      message.className = 'pwa-guide-note';
      message.textContent = 'Setelah diinstal, peta dan data restoran tetap memerlukan internet. Perangkat iOS menggunakan Tambah ke Layar Utama melalui Safari.';
      content.append(message);
    }
    renderInstall();
  }
  async function promptInstall() {
    if (!installEvent) { updateGuide(); return; }
    const event = installEvent;
    installEvent = null;
    notice(install, false);
    try {
      await event.prompt();
      await event.userChoice;
    } catch (error) {
      console.warn('Permintaan instalasi dibatalkan atau gagal.', error);
    }
    renderInstall();
  }
  function offerUpdate() {
    if (!registration || !registration.waiting || !mayReload()) return;
    requestedRefresh = true;
    $('pwaUpdateNowBtn').disabled = true;
    $('pwaUpdateNowBtn').textContent = 'Memperbarui…';
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  $('pwaRetryBtn').addEventListener('click', () => {
    if (!navigator.onLine) {
      $('pwaOfflineDescription').textContent = 'Masih offline. Periksa jaringan dan coba lagi.';
      return;
    }
    if (mayReload()) window.location.reload();
  });
  $('pwaUpdateNowBtn').addEventListener('click', offerUpdate);
  $('pwaUpdateLaterBtn').addEventListener('click', () => {
    updateDismissed = true;
    renderUpdate();
  });
  $('pwaInstallNowBannerBtn').addEventListener('click', promptInstall);
  $('pwaInstallLaterBtn').addEventListener('click', () => {
    installDismissed = true;
    renderInstall();
  });
  $('openInstallGuideBtn').addEventListener('click', updateGuide);
  window.addEventListener('online', renderConnectivity);
  window.addEventListener('offline', renderConnectivity);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    renderInstall();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installDismissed = true;
    renderInstall();
  });
  renderConnectivity();

  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requestedRefresh) window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' });
      renderUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            updateDismissed = false;
            renderUpdate();
          }
        });
      });
      const check = () => registration.update().catch(() => {});
      check();
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, 60 * 60 * 1000);
    } catch (error) {
      console.warn('Service worker tidak dapat didaftarkan.', error);
    }
  });
})();
