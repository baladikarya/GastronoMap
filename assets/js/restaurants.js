/* ================= DETAIL PANEL ================= */
function testimoniListHtml(r, showAll){
  const items = [];
  if(r.description) items.push({text:r.description, at:null, legacy:true});
  (r.testimonials||[]).forEach(t=> items.push(t));
  if(items.length === 0){
    return '<span style="color:var(--muted);font-size:12.5px;">Belum ada testimoni. Ceritakan pengalaman Anda!</span>';
  }
  const sorted = items.slice().sort((a,b)=> (b.at||0) - (a.at||0));
  const visible = showAll ? sorted : sorted.slice(0, 2);
  let html = visible.map(t=>{
    const dateStr = t.at ? new Date(t.at).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}) : '';
    const mine = t.userId && t.userId === myUserId;
    const authorName = mine ? 'Anda' : (t.userId && profilesMap[t.userId]) ? profilesMap[t.userId] : (t.legacy ? null : 'Pengguna');
    const authorHtml = authorName ? `<b>${escapeHtml(authorName)}</b>${dateStr ? ' · ' : ''}` : '';
    return `<div class="testi-item${mine ? ' testi-mine' : ''}">${escapeHtml(t.text)}${(authorHtml || dateStr) ? `<span class="testi-date">${authorHtml}${dateStr}</span>` : ''}</div>`;
  }).join('');
  if(!showAll && sorted.length > 2){
    html += `<div class="testi-more" id="testiShowMoreBtn">Lihat semua ${sorted.length} testimoni</div>`;
  }
  return html;
}

function openDetail(id, showAllTesti){
  const r = allRestos[id];
  if(!r) return;
  closePreviewCard(); // pastikan preview card (kalau ada) tertutup begitu detail penuh dibuka
  if(isNewForMe(r)) markRestoSeen(id); // hilangkan badge "baru" begitu resto ini dilihat
  const t = TYPES[r.type] || DEFAULT_TYPE_META;
  const imgs = (r.menuImages||[]).filter(Boolean);
  const favs = (r.favoriteMenu||[]).filter(Boolean);
  const today = currentDayName();

  let scheduleRowsHtml = '';
  let openNowBadge = '';
  if(r.hoursByDay){
    scheduleRowsHtml = DAYS.map((day, i)=>{
      const d = r.hoursByDay[day];
      const isToday = day === today;
      const txt = d.closed ? 'Tutup' : `${d.open} – ${d.close}`;
      const labelCells = i === 0 ? `<span class="df-label">JAM BUKA</span><span class="df-colon1">:</span>` : '';
      return `<div class="df-row ${isToday ? 'df-today' : ''}">${labelCells}<span class="df-day">${day}</span><span class="df-colon2">:</span><span class="df-time">${txt}</span></div>`;
    }).join('');
    const openNow = isOpenAt(r.hoursByDay, today, currentTimeStr());
    openNowBadge = `<span class="open-badge ${openNow ? 'yes' : 'no'}">${openNow ? 'Sudah Buka' : 'Masih Tutup'}</span>`;
  }

  const summary = computeRatingSummary(r.ratings);
  const compactCount = (n)=>{
    if(n >= 1000000) return `${(n/1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.0','')}jt`;
    if(n >= 1000) return `${(n/1000).toFixed(n >= 10000 ? 0 : 1).replace('.0','')}k`;
    return String(n);
  };
  const priceLevel = ({
    '< Rp 25rb':'$',
    'Rp 25rb - 50rb':'$$',
    'Rp 50rb - 100rb':'$$$',
    'Rp 100rb - 250rb':'$$$$',
    '> Rp 250rb':'$$$$$'
  })[r.priceRange] || '';
  const ratingSummaryHtml = summary.overallCount > 0
    ? `<div class="detail-meta-row">
         <span class="detail-rating-star" aria-hidden="true">★</span>
         <strong>${summary.overall.toFixed(1)}</strong>
         <span class="detail-review-count">(${compactCount(summary.overallCount)} ulasan)</span>
         <span class="detail-meta-sep">·</span>
         <span>${escapeHtml(r.type || 'Resto')}</span>
         ${priceLevel ? `<span class="detail-meta-sep">·</span><span class="detail-price-level">${priceLevel}</span>` : ''}
       </div>`
    : `<div class="detail-meta-row detail-meta-empty">
         <span class="detail-rating-star" aria-hidden="true">★</span>
         <span>Belum ada ulasan</span>
         <span class="detail-meta-sep">·</span>
         <span>${escapeHtml(r.type || 'Resto')}</span>
         ${priceLevel ? `<span class="detail-meta-sep">·</span><span class="detail-price-level">${priceLevel}</span>` : ''}
       </div>`;
  const ratingBreakdownHtml = summary.overallCount > 0
    ? `<div class="review-aggregate">
         <div class="review-aggregate-head">
           <div><strong>${summary.overall.toFixed(1)}</strong><span> / 5</span></div>
           <span>${summary.overallCount} ulasan</span>
         </div>
         <div class="rating-breakdown">${buildRatingBreakdownRowsHtml(summary)}</div>
       </div>`
    : '';

  const platforms = (r.onlinePlatforms||[]);
  let platformsHtml = '';
  if(r.noOnlineSales){
    // Sudah diverifikasi tidak berjualan online -- sengaja tidak menampilkan apa pun.
    platformsHtml = '';
  } else if(platforms.length){
    platformsHtml = `<div class="badge-row">${platforms.map(p=>{
        // Kompatibel data lama (string saja) maupun baru ({platform,url})
        const name = typeof p === 'string' ? p : p.platform;
        const url = typeof p === 'string' ? '' : (p.url || '');
        const meta = PLATFORM_FILTER_META[name] || {emoji:'🔗', color:'#555', file:'other'};
        const inner = `${platformIconHtml(meta.file, meta.emoji, 16)} ${name}`;
        if(url){
          return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener" class="platform-chip" style="background:${meta.color}">${inner}</a>`;
        }
        return `<span class="platform-chip platform-chip-add-link" data-platform="${escapeAttr(name)}" style="background:${meta.color};opacity:0.75;cursor:pointer;" title="Tap untuk tambahkan link">${inner} ➕</span>`;
      }).join('')}</div>`;
  } else {
    // Belum ada info sama sekali -- ajak user melengkapi (link platform ATAU tandai tidak jual online)
    platformsHtml = `<div class="badge-row"><span class="platform-chip platform-chip-add-link" id="onlineAvailabilityPromptChip" style="background:var(--teal);cursor:pointer;">🔗 Lengkapi ketersediaan online ➕</span></div>`;
  }
  const payments = (r.paymentMethods||[]);
  const paymentsHtml = payments.length
    ? `<div class="df-row"><span class="df-label">PEMBAYARAN</span><span class="df-colon1">:</span><span class="df-value">${payments.map(p=> p === 'cash' ? 'Cash' : 'Cashless').join(' & ')}</span></div>`
    : '';

  const myRatingEntry = (r.ratings||[]).find(x => x.userId === myUserId) || null;
  const myTestiEntry = (r.testimonials||[]).find(x => x.userId === myUserId) || null;

  const isVisited = visitedIds.has(r.id);
  const isWishlisted = wishlistIds.has(r.id);

  // ---------- Hero carousel: maksimal 5 foto representatif, urutan stabil (tidak random) ----------
  // Prioritas saat ini: foto menu/cover yang dikelola resto, lalu foto kunjungan terbaru.
  // Fullscreen tetap membuka seluruh koleksi foto agar Hero hanya berfungsi sebagai preview.
  const visitHeroImgs = (r.photos || []).slice().sort((a,b)=> (b.at||0) - (a.at||0))
    .map(p => photoPublicUrl(p.storagePath)).filter(Boolean);
  const allHeroGallery = [...new Set([...imgs, ...visitHeroImgs])];
  const heroImgs = allHeroGallery.slice(0, 5);
  const heroFallback = 'icons/icon-512.png';
  let heroIndex = 0;
  const heroImgEl = document.getElementById('detailHeroImg');
  const heroProgressEl = document.getElementById('detailHeroProgress');
  const heroCountBtn = document.getElementById('detailHeroCountBtn');
  const heroPrevBtn = document.getElementById('detailHeroPrevBtn');
  const heroNextBtn = document.getElementById('detailHeroNextBtn');
  const heroMediaBtn = document.getElementById('detailHeroMediaBtn');

  const renderHero = ()=>{
    const hasPhotos = heroImgs.length > 0;
    heroImgEl.src = hasPhotos ? heroImgs[heroIndex] : heroFallback;
    heroImgEl.alt = hasPhotos ? `Foto ${heroIndex + 1} dari ${r.name}` : `Foto ${r.name}`;
    heroProgressEl.innerHTML = heroImgs.length > 1
      ? heroImgs.map((_, i)=>`<span class="detail-hero-dot${i === heroIndex ? ' active' : ''}"></span>`).join('')
      : '';
    heroCountBtn.textContent = allHeroGallery.length ? `▧ ${allHeroGallery.length}` : '';
    heroCountBtn.classList.toggle('hidden', !allHeroGallery.length);
    heroPrevBtn.classList.toggle('hidden', heroImgs.length < 2);
    heroNextBtn.classList.toggle('hidden', heroImgs.length < 2);
  };
  const moveHero = (delta)=>{
    if(heroImgs.length < 2) return;
    heroIndex = (heroIndex + delta + heroImgs.length) % heroImgs.length;
    renderHero();
  };
  heroPrevBtn.onclick = (e)=>{ e.stopPropagation(); moveHero(-1); };
  heroNextBtn.onclick = (e)=>{ e.stopPropagation(); moveHero(1); };
  heroMediaBtn.onclick = ()=>{ if(allHeroGallery.length) openPhotoLightbox(allHeroGallery, Math.max(0, allHeroGallery.indexOf(heroImgs[heroIndex]))); };
  heroCountBtn.onclick = (e)=>{ e.stopPropagation(); if(allHeroGallery.length) openPhotoLightbox(allHeroGallery, 0); };
  let heroTouchStartX = null;
  heroMediaBtn.ontouchstart = (e)=>{ heroTouchStartX = e.touches && e.touches[0] ? e.touches[0].clientX : null; };
  heroMediaBtn.ontouchend = (e)=>{
    if(heroTouchStartX == null) return;
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : heroTouchStartX;
    const delta = endX - heroTouchStartX;
    heroTouchStartX = null;
    if(Math.abs(delta) > 42){ e.preventDefault(); moveHero(delta < 0 ? 1 : -1); }
  };
  renderHero();

  document.getElementById('detailHeroBackBtn').onclick = closeDetail;
  const heroVisitBtn = document.getElementById('detailHeroVisitBtn');
  heroVisitBtn.textContent = isVisited ? '✓ Dikunjungi' : 'Belum dikunjungi';
  heroVisitBtn.classList.toggle('is-visited', isVisited);
  heroVisitBtn.onclick = async ()=>{ await toggleVisited(r.id); openDetail(id, showAllTesti); };

  // ---------- Header resto: nama → meta → status buka → CTA ----------
  const isOpenNow = r.hoursByDay ? isOpenAt(r.hoursByDay, today, currentTimeStr()) : false;
  const todayHours = r.hoursByDay ? r.hoursByDay[today] : null;
  const clockLabel = (value)=> String(value || '').replace(':','.');
  let openStatusDetail = '';
  if(todayHours){
    if(todayHours.closed){
      openStatusDetail = 'Tutup hari ini';
    }else if(isOpenNow){
      openStatusDetail = `Buka · Tutup ${clockLabel(todayHours.close)}`;
    }else{
      openStatusDetail = `Tutup · Buka ${clockLabel(todayHours.open)}`;
    }
  }
  const openStatusPillHtml = r.hoursByDay
    ? `<span class="detail-pill ${isOpenNow ? 'open-yes' : 'open-no'}"><span class="detail-status-dot">${isOpenNow ? '✓' : '×'}</span>${isOpenNow ? 'Buka Sekarang' : 'Tutup Sekarang'}</span>`
    : '';

  const routeIcon = `<svg class="detail-cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12 12 3Z"/><path d="M8.5 13.5h4.2c1.5 0 2.3-.8 2.3-2.3V9.5"/><path d="m13 11 2-2 2 2"/></svg>`;
  const phoneIcon = `<svg class="detail-cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 10 7.8 8.4 9.5c1.2 2.4 3.2 4.4 5.6 5.6l1.7-1.6 4.3 2.8-.8 3.4c-.2.8-.9 1.3-1.7 1.3C9.5 20.3 3.7 14.5 3 6.5c-.1-.8.5-1.5 1.3-1.7l2.9-.7Z"/></svg>`;
  const heartIcon = `<svg class="detail-cta-icon detail-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/></svg>`;
  const reportIcon = `<svg class="detail-cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>`;

  document.getElementById('detailContent').innerHTML = `
    <section class="detail-header-summary">
      <div class="detail-title-row">
        <h3 class="detail-name">${escapeHtml(r.name)}${r.isVerified ? '<span class="verified-badge" title="Diverifikasi admin" aria-label="Terverifikasi">✓</span>' : ''}</h3>
      </div>
      ${ratingSummaryHtml}
      ${r.hoursByDay ? `<div class="detail-open-row">${openStatusPillHtml}${openStatusDetail ? `<span class="detail-open-detail">${openStatusDetail}</span>` : ''}</div>` : ''}
      <div class="detail-cta-row">
        <button type="button" class="detail-cta-btn cta-primary" id="directionBtn">${routeIcon}<span>Rute</span></button>
        <button type="button" class="detail-cta-btn" id="telpCtaBtn" ${r.phone ? '' : 'disabled'}>${phoneIcon}<span>Telepon</span></button>
        <button type="button" class="detail-cta-btn cta-wishlist ${isWishlisted ? 'cta-active' : ''}" id="simpanCtaBtn">${heartIcon}<span>${isWishlisted ? 'Tersimpan' : 'Wishlist'}</span></button>
        <button type="button" class="detail-cta-btn" id="reportCtaBtn">${reportIcon}<span>Laporkan</span></button>
      </div>
    </section>

    <div class="detail-tabs">
      <button type="button" class="detail-tab-btn active" data-tab="ringkasan">Ringkasan</button>
      <button type="button" class="detail-tab-btn" data-tab="menu">Menu</button>
      <button type="button" class="detail-tab-btn" data-tab="ulasan">Ulasan</button>
      <button type="button" class="detail-tab-btn" data-tab="foto">Foto</button>
    </div>

    <div class="detail-tab-panel active" data-tab-panel="ringkasan">
      ${platformsHtml}
      <div class="detail-fields">
        ${r.address ? `<div class="df-row"><span class="df-label">ALAMAT</span><span class="df-colon1">:</span><span class="df-value">${escapeHtml(r.address)}</span></div>` : ''}
        <div class="df-row"><span class="df-label">HARGA</span><span class="df-colon1">:</span><span class="df-value">${escapeHtml(r.priceRange||'-')}</span></div>
        ${paymentsHtml}
        ${r.hoursByDay ? scheduleRowsHtml : `<div class="df-row"><span class="df-label">JAM BUKA</span><span class="df-colon1">:</span><span class="df-value" style="color:var(--muted);">Jam buka belum diisi</span></div>`}
      </div>
      ${isAdmin ? `<div class="action-row">
        <button class="btn btn-secondary" id="editBtn">✏️ Edit</button>
        <button class="btn btn-danger" id="delBtn">🗑</button>
      </div>
      <div class="admin-verify-row">
        <button class="btn ${r.isVerified ? 'btn-verify-on' : 'btn-verify-off'}" id="verifyBtn">${r.isVerified ? '✓ Verified' : 'Tandai Verified'}</button>
      </div>` : ''}
    </div>

    <div class="detail-tab-panel" data-tab-panel="menu">
      <div class="field">
        <label>Menu Favorit / Rekomendasi</label>
        <div class="fav-chip-list" id="favChipList">${(()=>{
          const ranked = groupAndRankFavorites(favs);
          return ranked.length
            ? ranked.map(g=>`<span class="fav-chip">⭐ ${escapeHtml(g.canonical)}${g.count > 1 ? ` <b>(${g.count})</b>` : ''}</span>`).join('')
            : '<span style="color:var(--muted);font-size:12.5px;">Belum ada rekomendasi. Jadilah yang pertama!</span>';
        })()}</div>
        <div class="quick-fav-row">
          <input type="text" id="quickFavInput" placeholder="Tambahkan rekomendasi menu...">
          <button id="quickFavBtn">Tambah</button>
        </div>
      </div>
      <div class="field" style="margin-top:14px;">
        <label>Daftar Menu</label>
        ${buildMenuPhotosCarouselHtml(imgs, r.menuPhotos)}
        <input type="file" id="menuPhotoDetailCameraInput" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="menuPhotoDetailGalleryInput" accept="image/*" class="hidden">
        <div class="quick-photo-row">
          <button type="button" id="menuPhotoDetailCameraBtn" class="btn btn-secondary">📷 Ambil Foto</button>
          <button type="button" id="menuPhotoDetailGalleryBtn" class="btn btn-secondary">🖼️ Galeri</button>
        </div>
      </div>
    </div>

    <div class="detail-tab-panel" data-tab-panel="ulasan">
      ${ratingBreakdownHtml}
      <div class="field" id="ratingSection">
        <label>Rating Pengunjung</label>
        ${myRatingEntry ? '<div style="font-size:11.5px;color:var(--teal-dark);margin-bottom:6px;">Anda sudah pernah menilai resto ini. Ubah bintang di bawah lalu simpan untuk memperbarui.</div>' : ''}
        <div id="ratingForm">${RATING_CRITERIA.map(c=>`
          <div class="rating-crit-row">
            <span class="crit-label">${c.label}</span>
            <div class="star-picker" data-crit="${c.key}">${[1,2,3,4,5].map(v=>`<span data-v="${v}">★</span>`).join('')}</div>
          </div>`).join('')}
        </div>
        <button class="btn btn-primary" id="submitRatingBtn" style="width:100%;margin-top:10px;">${myRatingEntry ? 'Update Rating Saya' : 'Kirim Rating'}</button>
      </div>
      <div class="field" style="margin-top:14px;">
        <label>Testimoni Pengunjung</label>
        <div class="testi-list" id="testiList">${testimoniListHtml(r, showAllTesti)}</div>
        <div class="quick-testi-row">
          ${myTestiEntry ? '<div style="font-size:11.5px;color:var(--teal-dark);margin-bottom:4px;">Anda sudah menulis testimoni. Ubah teks di bawah untuk memperbarui.</div>' : ''}
          <textarea id="quickTestiInput" placeholder="Bagaimana suasana atau pengalaman Anda di sini?">${myTestiEntry ? escapeHtml(myTestiEntry.text) : ''}</textarea>
          <button id="quickTestiBtn">${myTestiEntry ? 'Update Testimoni Saya' : 'Kirim Testimoni'}</button>
        </div>
      </div>
    </div>

    <div class="detail-tab-panel" data-tab-panel="foto">
      <div class="field">
        <label>Foto Kunjungan</label>
        ${buildPhotosCarouselHtml(r.photos)}
        <input type="file" id="photoCameraInput" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="photoGalleryInput" accept="image/*" class="hidden">
        <div class="quick-photo-row">
          <button type="button" id="photoCameraBtn" class="btn btn-secondary">📷 Ambil Foto</button>
          <button type="button" id="photoGalleryBtn" class="btn btn-secondary">🖼️ Galeri</button>
        </div>
      </div>
      <div class="field" style="margin-top:14px;">
        <label>Referensi (Reels/Video)</label>
        <div class="ref-grid" id="refGrid">${(r.references && r.references.length) ? r.references.map(buildRefCardHtml).join('') : '<span style="color:var(--muted);font-size:12.5px;">Belum ada referensi. Tempel link IG/YouTube/TikTok di bawah.</span>'}</div>
        <div class="quick-ref-row">
          <input type="url" id="quickRefInput" placeholder="Tempel link Reels/YouTube/TikTok...">
          <button id="quickRefBtn">Tambah</button>
        </div>
      </div>
    </div>
  `;
  document.querySelectorAll('.detail-tab-btn').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('.detail-tab-btn').forEach(b=> b.classList.toggle('active', b === btn));
      document.querySelectorAll('.detail-tab-panel').forEach(p=> p.classList.toggle('active', p.dataset.tabPanel === btn.dataset.tab));
    };
  });
  document.getElementById('telpCtaBtn').onclick = ()=>{ if(r.phone) window.location.href = `tel:${r.phone.replace(/[^0-9+]/g,'')}`; };
  document.getElementById('simpanCtaBtn').onclick = async ()=>{ await toggleWishlist(r.id); openDetail(id, showAllTesti); };
  document.getElementById('reportCtaBtn').onclick = ()=>{ openReportModal(r.id, r.name); };
  if(myRatingEntry){
    setTimeout(()=>{
      document.querySelectorAll('#ratingSection .star-picker').forEach(picker=>{
        const crit = picker.dataset.crit;
        const v = myRatingEntry[crit];
        if(v) picker.querySelectorAll('span').forEach(s=> s.classList.toggle('filled', Number(s.dataset.v) <= v));
      });
    }, 0);
  }
  document.getElementById('directionBtn').onclick = ()=>{
    openDirectionChoice(r.lat, r.lng, r.name);
  };
  document.querySelectorAll('.platform-chip-add-link').forEach(chip=>{
    chip.onclick = ()=>{
      if(!requireLogin()) return;
      if(isAdmin){ showToast('Admin bisa edit langsung lewat form Edit Resto'); return; }
      openLinkSubmitPopup(r.id, chip.dataset.platform || null);
    };
  });
  const editBtnEl = document.getElementById('editBtn');
  if(editBtnEl) editBtnEl.onclick = ()=> openForm(r);
  const delBtnEl = document.getElementById('delBtn');
  if(delBtnEl) delBtnEl.onclick = async ()=>{
    if(confirm('Hapus resto ini dari peta bersama?')){
      await deleteResto(r.id);
      closeDetail();
      showToast('Resto dihapus');
    }
  };
  const verifyBtnEl = document.getElementById('verifyBtn');
  if(verifyBtnEl) verifyBtnEl.onclick = async ()=>{
    await toggleVerified(r.id, !r.isVerified);
    await loadAllRestos();
    openDetail(id, showAllTesti);
  };
  document.getElementById('photoCameraBtn').onclick = ()=>{
    if(!requireLogin()) return;
    document.getElementById('photoCameraInput').click();
  };
  document.getElementById('photoGalleryBtn').onclick = ()=>{
    if(!requireLogin()) return;
    document.getElementById('photoGalleryInput').click();
  };
  const handlePhotoPick = async (e)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // reset supaya bisa pilih file yang sama lagi nanti
    if(!file) return;
    if(!requireLogin()) return;
    showToast('Memeriksa wajah pada foto...');
    const blob = await prepareVisitPhotoBlob(file);
    if(!blob) return; // user membatalkan foto ini lewat modal konfirmasi
    const ok = await uploadVisitPhotoBlob(blob, r.id);
    if(ok){ await loadAllRestos(); openDetail(id, showAllTesti); }
  };
  document.getElementById('photoCameraInput').onchange = handlePhotoPick;
  document.getElementById('photoGalleryInput').onchange = handlePhotoPick;
  document.getElementById('menuPhotoDetailCameraBtn').onclick = ()=>{
    if(!requireLogin()) return;
    document.getElementById('menuPhotoDetailCameraInput').click();
  };
  document.getElementById('menuPhotoDetailGalleryBtn').onclick = ()=>{
    if(!requireLogin()) return;
    document.getElementById('menuPhotoDetailGalleryInput').click();
  };
  const handleMenuPhotoDetailPick = async (e)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!file) return;
    const ok = await uploadMenuPhotoCrowd(file, r.id);
    if(ok){ await loadAllRestos(); openDetail(id, showAllTesti); }
  };
  document.getElementById('menuPhotoDetailCameraInput').onchange = handleMenuPhotoDetailPick;
  document.getElementById('menuPhotoDetailGalleryInput').onchange = handleMenuPhotoDetailPick;
  document.querySelectorAll('#photoGrid .photo-card').forEach(card=>{
    card.onclick = ()=> openPhotoLightbox(currentDetailPhotos.map(p=>photoPublicUrl(p.storagePath)), Number(card.dataset.idx), visitPhotoCaption);
  });
  document.querySelectorAll('#menuPhotoDisplayGrid .photo-card').forEach(card=>{
    card.onclick = ()=> openPhotoLightbox(currentDetailMenuItems.map(item=>item.url), Number(card.dataset.idx));
  });
  document.querySelectorAll('.photo-del-btn:not(.menu-photo-del-btn)').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      if(!confirm('Hapus foto ini?')) return;
      const ok = await deleteVisitPhoto(btn.dataset.id, btn.dataset.path);
      if(ok){ await loadAllRestos(); openDetail(id, showAllTesti); }
    };
  });
  document.querySelectorAll('.menu-photo-del-btn').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      if(!confirm('Hapus foto menu ini?')) return;
      const item = currentDetailMenuItems[Number(btn.dataset.idx)];
      if(!item) return;
      const ok = item.kind === 'crowd'
        ? await deleteMenuPhotoCrowd(item.id, item.storagePath)
        : await deleteLegacyMenuImage(r.id, item.url);
      if(ok){ await loadAllRestos(); openDetail(id, showAllTesti); }
    };
  });
  document.querySelectorAll('.ref-del-btn').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.preventDefault();
      if(!confirm('Hapus referensi ini?')) return;
      const ok = await deleteReference(btn.dataset.id);
      if(ok){ await loadAllRestos(); openDetail(id, showAllTesti); showToast('Referensi dihapus'); }
    };
  });
  document.getElementById('quickRefBtn').onclick = async ()=>{
    if(!requireLogin()) return;
    const inp = document.getElementById('quickRefInput');
    const val = inp.value.trim();
    if(!val) return;
    let url;
    try{ url = new URL(val).href; }catch(e){ showToast('Link tidak valid, pastikan mulai dengan https://'); return; }
    const platform = detectPlatform(url);
    const { error } = await sb.from('references_link').insert({resto_id: id, user_id: myUserId, url, platform});
    if(error){ showToast('Gagal: ' + error.message); return; }
    showToast('Referensi ditambahkan');
    await loadAllRestos();
    openDetail(id, showAllTesti);
  };
  document.getElementById('quickFavBtn').onclick = async ()=>{
    if(!requireLogin()) return;
    const inp = document.getElementById('quickFavInput');
    const val = inp.value.trim();
    if(!val) return;
    const { error } = await sb.from('favorite_menu').insert({resto_id: id, user_id: myUserId, menu_name: val});
    if(error){ showToast('Gagal: ' + error.message); return; }
    showToast('Rekomendasi ditambahkan, terima kasih!');
    await loadAllRestos();
    openDetail(id, showAllTesti);
  };
  const showMoreBtn = document.getElementById('testiShowMoreBtn');
  if(showMoreBtn) showMoreBtn.onclick = ()=> openDetail(id, true);
  document.getElementById('quickTestiBtn').onclick = async ()=>{
    if(!requireLogin()) return;
    const inp = document.getElementById('quickTestiInput');
    const val = inp.value.trim();
    if(!val) return;
    const { error } = await sb.from('testimonials').upsert({resto_id: id, user_id: myUserId, text: val, updated_at: new Date().toISOString()});
    if(error){ showToast('Gagal: ' + error.message); return; }
    showToast(myTestiEntry ? 'Testimoni Anda diperbarui' : 'Testimoni ditambahkan, terima kasih!');
    await loadAllRestos();
    openDetail(id, true);
  };

  const ratingDraft = {};
  document.querySelectorAll('#ratingSection .star-picker').forEach(picker=>{
    const crit = picker.dataset.crit;
    ratingDraft[crit] = myRatingEntry && myRatingEntry[crit] ? myRatingEntry[crit] : 0;
    picker.querySelectorAll('span').forEach(star=>{
      star.onclick = ()=>{
        const v = Number(star.dataset.v);
        ratingDraft[crit] = v;
        picker.querySelectorAll('span').forEach(s=> s.classList.toggle('filled', Number(s.dataset.v) <= v));
      };
    });
  });
  document.getElementById('submitRatingBtn').onclick = async ()=>{
    if(!requireLogin()) return;
    const belumDiisi = RATING_CRITERIA.filter(c => !ratingDraft[c.key]);
    if(belumDiisi.length > 0){
      showToast('Isi rating untuk: ' + belumDiisi.map(c=>c.label).join(', '));
      return;
    }
    // Rating keseluruhan = rata-rata dari 5 kriteria (harga, porsi, rasa, suasana, pelayanan),
    // dihitung otomatis di sini per-user, lalu dirata-rata lagi antar semua user di computeRatingSummary().
    const critValues = RATING_CRITERIA.map(c => ratingDraft[c.key]);
    const overall = critValues.reduce((a,b)=>a+b,0) / critValues.length;
    const row = {resto_id: id, user_id: myUserId, overall};
    RATING_CRITERIA.forEach(c=>{ row[c.key] = ratingDraft[c.key]; });
    const { error } = await sb.from('ratings').upsert(row);
    if(error){ showToast('Gagal: ' + error.message); return; }
    showToast(myRatingEntry ? 'Rating Anda diperbarui' : 'Terima kasih atas rating-nya!');
    await loadAllRestos();
    openDetail(id, showAllTesti);
  };
  document.getElementById('detailPanel').classList.remove('hidden');
}
function closeDetail(){ document.getElementById('detailPanel').classList.add('hidden'); }

/* ================= FORM MODAL ================= */
function openForm(existing){
  if(existing && !isAdmin){
    showToast('Edit resto hanya untuk admin');
    return;
  }
  if(!existing && !requireLogin()) return;
  initPlatformPicker(); // rebuild & tampilkan/sembunyikan field Ketersediaan Online sesuai status admin terkini
  pickingLocationMode = true;
  editingId = existing ? existing.id : null;
  const quickLoc = (!existing && pendingNewRestoLatLng) ? pendingNewRestoLatLng : null;
  pendingNewRestoLatLng = null;
  pickedLatLng = existing ? L.latLng(existing.lat, existing.lng) : null;
  document.getElementById('formTitle').textContent = existing ? 'Edit Resto' : 'Tambah Resto';
  document.getElementById('formModal').classList.toggle('is-edit-mode', !!existing);
  if(!existing) goToWizardStep(1); // reset wizard ke step 1 tiap kali buka form Tambah Resto baru
  document.getElementById('f_address').value = existing ? (existing.address || '') : '';
  document.getElementById('f_phone').value = existing ? (existing.phone || '') : '';
  document.getElementById('locSuggestions').classList.add('hidden');
  document.getElementById('nameSuggestions').classList.add('hidden');
  document.getElementById('f_name').value = existing ? existing.name : '';
  document.getElementById('f_type').value = existing ? existing.type : 'Indonesian';
  document.getElementById('f_price').value = existing ? existing.priceRange : '< Rp 25rb';
  const existingPlatforms = existing && existing.onlinePlatforms ? existing.onlinePlatforms : [];
  // Kompatibel dengan data lama (array nama saja) maupun baru (array {platform,url})
  const platformUrlMap = {};
  existingPlatforms.forEach(p=>{
    if(typeof p === 'string') platformUrlMap[p] = '';
    else platformUrlMap[p.platform] = p.url || '';
  });
  document.querySelectorAll('#platformPicker .platform-toggle').forEach(el=>{
    const active = el.dataset.platform in platformUrlMap;
    el.classList.toggle('active', active);
    const input = document.querySelector(`.platform-url-input[data-platform="${el.dataset.platform}"]`);
    input.value = platformUrlMap[el.dataset.platform] || '';
    // Kotak link hanya boleh diisi/diubah admin, dan hanya dimunculkan untuk
    // admin. User biasa cukup lihat toggle-nya saja, tanpa kotak link.
    input.classList.toggle('hidden', !active || !isAdmin);
    input.disabled = !isAdmin;
    if(isAdmin) input.placeholder = `Link langsung ke resto di ${el.dataset.platform} (opsional)`;
  });
  const existingPayments = existing && existing.paymentMethods ? existing.paymentMethods : [];
  document.querySelectorAll('#paymentPicker .platform-toggle').forEach(el=>{
    el.classList.toggle('active', existingPayments.includes(el.dataset.payment));
  });
  if(quickLoc){
    // Datang dari tap-tahan di peta utama -- langsung taruh tempMarker draggable di lokasi itu.
    placeDraggableMarker(quickLoc.lat, quickLoc.lng, 'tap-tahan peta', 'manual');
  } else if(pickedLatLng){
    setPinStatus(`Lokasi tersimpan: ${pickedLatLng.lat.toFixed(5)}, ${pickedLatLng.lng.toFixed(5)}. Geser kalau perlu diperbaiki.`, 'auto');
  } else {
    setPinStatus('Anda juga bisa tap langsung di peta untuk pilih lokasi.', null);
  }

  renderDayHoursRows(existing && existing.hoursByDay ? existing.hoursByDay : emptyHours());

  formMenuImages = (existing && existing.menuImages) ? existing.menuImages.slice() : [];
  renderMenuPhotoGrid();

  // Foto Kunjungan, Rating, & Testimoni di form ini hanya untuk ISIAN AWAL resto baru
  // (sama seperti Menu Favorit & Referensi) -- disembunyikan saat mode edit.
  formVisitPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
  formVisitPhotos = [];
  renderVisitPhotoGrid();
  resetFormRatingPicker();
  document.getElementById('f_testi').value = '';
  ['visitPhotoFieldWrap','formRatingFieldWrap','formTestiFieldWrap'].forEach(id=>{
    document.getElementById(id).classList.toggle('hidden', !!existing);
  });

  const favList = document.getElementById('favList');
  favList.innerHTML = '';
  const favs = existing && existing.favoriteMenu && existing.favoriteMenu.length ? existing.favoriteMenu : [''];
  favs.forEach(f => addFavRow(f));

  const refList = document.getElementById('refUrlList');
  refList.innerHTML = '';
  const addRefBtn = document.getElementById('addRefUrlBtn');
  const editNote = document.getElementById('refFieldEditNote');
  if(existing){
    // Mode edit: referensi dikelola dari panel detail saja (tombol hapus di sana benar-benar berfungsi).
    // Tampilkan sebagai daftar baca-saja supaya admin tidak salah kira bisa hapus dari sini.
    (existing.references || []).forEach(r => addRefUrlRow(r.url));
    refList.querySelectorAll('.ref-url-row input').forEach(inp => inp.disabled = true);
    refList.querySelectorAll('.ref-url-row button').forEach(btn => btn.classList.add('hidden'));
    addRefBtn.classList.add('hidden');
    editNote.classList.remove('hidden');
  }else{
    addRefUrlRow('');
    addRefBtn.classList.remove('hidden');
    editNote.classList.add('hidden');
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
}

function renderMenuPhotoGrid(){
  const grid = document.getElementById('menuPhotoGrid');
  if(formMenuImages.length === 0){
    grid.innerHTML = '<span style="color:var(--muted);font-size:12.5px;">Belum ada foto menu.</span>';
    return;
  }
  grid.innerHTML = formMenuImages.map((url, idx)=>`
    <div class="photo-card">
      <img src="${escapeAttr(url)}" onerror="this.style.opacity=0.2">
      <button type="button" class="photo-del-btn" data-idx="${idx}" title="Hapus foto">✕</button>
    </div>
  `).join('');
  grid.querySelectorAll('.photo-del-btn').forEach(btn=>{
    btn.onclick = ()=>{
      formMenuImages.splice(Number(btn.dataset.idx), 1);
      renderMenuPhotoGrid();
    };
  });
}

/* Foto Kunjungan di form Tambah Resto: preview lokal saja (object URL), diunggah beneran
   ke Supabase saat Simpan Resto -- karena butuh resto_id yang baru terbit setelah insert. */
function renderVisitPhotoGrid(){
  const grid = document.getElementById('visitPhotoGrid');
  if(formVisitPhotos.length === 0){
    grid.innerHTML = '<span style="color:var(--muted);font-size:12.5px;">Belum ada foto kunjungan.</span>';
    return;
  }
  grid.innerHTML = formVisitPhotos.map((p, idx)=>`
    <div class="photo-card">
      <img src="${escapeAttr(p.previewUrl)}" onerror="this.style.opacity=0.2">
      <button type="button" class="photo-del-btn" data-idx="${idx}" title="Hapus foto">✕</button>
    </div>
  `).join('');
  grid.querySelectorAll('.photo-del-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const idx = Number(btn.dataset.idx);
      URL.revokeObjectURL(formVisitPhotos[idx].previewUrl);
      formVisitPhotos.splice(idx, 1);
      renderVisitPhotoGrid();
    };
  });
}

/* Rating Pengunjung di form Tambah Resto: sama seperti #ratingSection di panel detail,
   tapi disimpan ke tabel `ratings` setelah resto_id terbit (opsional, boleh dilewati). */
function renderFormRatingPicker(){
  const wrap = document.getElementById('formRatingForm');
  wrap.innerHTML = RATING_CRITERIA.map(c=>`
    <div class="rating-crit-row">
      <span class="crit-label">${c.label}</span>
      <div class="star-picker" data-crit="${c.key}">${[1,2,3,4,5].map(v=>`<span data-v="${v}">★</span>`).join('')}</div>
    </div>`).join('');
  wrap.querySelectorAll('.star-picker').forEach(picker=>{
    const crit = picker.dataset.crit;
    picker.querySelectorAll('span').forEach(star=>{
      star.onclick = ()=>{
        const v = Number(star.dataset.v);
        formRatingDraft[crit] = v;
        picker.querySelectorAll('span').forEach(s=> s.classList.toggle('filled', Number(s.dataset.v) <= v));
      };
    });
  });
}
function resetFormRatingPicker(){
  formRatingDraft = {};
  document.querySelectorAll('#formRatingForm .star-picker span').forEach(s=> s.classList.remove('filled'));
}

async function uploadMenuImage(file){
  if(!requireLogin()) return null;
  showToast('Mengunggah foto menu...');
  try{
    const blob = await compressImage(file);
    const path = `menu/${myUserId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.jpg`;
    const { error: upErr } = await sb.storage.from('visit-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if(upErr) throw upErr;
    const url = sb.storage.from('visit-photos').getPublicUrl(path).data.publicUrl;
    showToast('Foto menu ditambahkan');
    return url;
  }catch(e){
    showToast('Gagal unggah: ' + e.message);
    return null;
  }
}

function addRefUrlRow(value=''){
  const row = document.createElement('div');
  row.className = 'ref-url-row';
  row.innerHTML = `<input type="url" placeholder="https://instagram.com/reel/... atau youtube.com/..." value="${escapeAttr(value)}"><button type="button">✕</button>`;
  row.querySelector('button').onclick = ()=> row.remove();
  document.getElementById('refUrlList').appendChild(row);
}

function closeForm(){
  pickingLocationMode = false;
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('pinPeekBar').classList.add('hidden');
  if(tempMarker){ map.removeLayer(tempMarker); tempMarker = null; }
}

/* ================= WIZARD TAMBAH RESTO (4 langkah: Info/Detail/Foto/Selesai) =================
   Hanya berlaku untuk mode TAMBAH BARU (lihat #formModal.is-edit-mode di CSS -- mode edit tetap
   satu halaman panjang seperti sebelumnya, karena hanya admin yang mengedit dan mereka sudah
   terbiasa dengan tampilan lama). Wizard ini murni navigasi/tampilan -- semua field tetap ada di
   DOM yang sama seperti sebelumnya, jadi handleSave() tidak perlu diubah sama sekali. */
let currentWizardStep = 1;
function goToWizardStep(n){
  currentWizardStep = n;
  document.querySelectorAll('.wizard-step').forEach(el=>{
    el.classList.toggle('active', Number(el.dataset.step) === n);
  });
  document.querySelectorAll('.wizard-step-item').forEach(el=>{
    const s = Number(el.dataset.stepItem);
    el.classList.toggle('active', s === n);
    el.querySelector('.wizard-step-dot').classList.toggle('active', s === n);
    el.querySelector('.wizard-step-dot').classList.toggle('done', s < n);
    el.querySelector('.wizard-step-dot').textContent = s < n ? '✓' : s;
  });
  document.querySelectorAll('.wizard-step-connector').forEach(el=>{
    el.classList.toggle('done', Number(el.dataset.connector) < n);
  });
  // Tombol "Simpan Resto" cuma tampil di step 4 (Selesai) -- step 1-3 pakai "Lanjut" bawaan wizard.
  document.getElementById('saveForm').classList.toggle('hidden', n < 4);
  if(n === 4) renderWizardReview();
  document.getElementById('formModal').scrollTop = 0;
}
function renderWizardReview(){
  const name = document.getElementById('f_name').value.trim() || '-';
  const address = document.getElementById('f_address').value.trim() || '-';
  const type = document.getElementById('f_type').value || '-';
  const price = document.getElementById('f_price').value || '-';
  document.getElementById('wizardReviewBox').innerHTML = `
    <div class="wr-row"><span class="wr-label">Nama</span><span class="wr-value">${escapeHtml(name)}</span></div>
    <div class="wr-row"><span class="wr-label">Alamat</span><span class="wr-value">${escapeHtml(address)}</span></div>
    <div class="wr-row"><span class="wr-label">Kategori</span><span class="wr-value">${escapeHtml(type)} · ${escapeHtml(price)}</span></div>
  `;
}
document.getElementById('wizardNext1').onclick = ()=>{
  if(!document.getElementById('f_name').value.trim()){ showToast('Isi nama resto dulu'); return; }
  if(!pickedLatLng){ showToast('Pilih lokasi resto di peta dulu'); return; }
  goToWizardStep(2);
};
document.getElementById('wizardBack2').onclick = ()=> goToWizardStep(1);
document.getElementById('wizardNext2').onclick = ()=> goToWizardStep(3);
document.getElementById('wizardBack3').onclick = ()=> goToWizardStep(2);
document.getElementById('wizardNext3').onclick = ()=> goToWizardStep(4);
document.getElementById('wizardBack4').onclick = ()=> goToWizardStep(3);

/* ================= CEK DUPLIKAT LOKASI (crowdsource) ================= */
// Haversine sederhana, cukup akurat untuk radius kecil (meter-level).
function distanceMetersBetween(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function normalizeRestoName(name){
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function namesLookSimilar(a, b){
  const na = normalizeRestoName(a), nb = normalizeRestoName(b);
  if(!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
// Dipanggil sebelum simpan resto BARU: cari resto lain dalam radius 5m dari pin.
// - Nama mirip & <=5m  -> diblokir (kemungkinan besar duplikat)
// - Nama beda & <=5m   -> peringatan, boleh lanjut kalau user yakin (mis. beda tenant di foodcourt)
// Return true kalau boleh lanjut simpan, false kalau harus dibatalkan.
function checkDuplicateLocation(name, lat, lng){
  const DUP_RADIUS_M = 5;
  let nearest = null;
  Object.values(allRestos).forEach(r=>{
    if(r.lat == null || r.lng == null) return;
    const d = distanceMetersBetween(lat, lng, r.lat, r.lng);
    if(d <= DUP_RADIUS_M && (!nearest || d < nearest.d)) nearest = { r, d };
  });
  if(!nearest) return true;
  const distTxt = nearest.d < 1 ? '<1 meter' : `${nearest.d.toFixed(1)} meter`;
  if(namesLookSimilar(name, nearest.r.name)){
    showToast(`Sudah ada resto serupa: "${nearest.r.name}" (${distTxt} dari titik ini). Cek dulu apakah ini resto yang sama.`);
    return false;
  }
  return confirm(`Ada resto lain persis di lokasi ini: "${nearest.r.name}" (${distTxt}). Yakin ini resto yang berbeda (mis. tenant lain di foodcourt/ruko yang sama)?`);
}

async function handleSave(){
  const name = document.getElementById('f_name').value.trim();
  if(!name){ showToast('Nama resto wajib diisi'); return; }
  if(!pickedLatLng){ showToast('Pilih lokasi di peta dulu'); return; }
  if(!requireLogin()) return;
  if(!editingId && !checkDuplicateLocation(name, pickedLatLng.lat, pickedLatLng.lng)) return;
  const imgUrls = formMenuImages;
  const favMenus = Array.from(document.querySelectorAll('.fav-row input')).map(i=>i.value.trim()).filter(Boolean);
  const refUrlsRaw = Array.from(document.querySelectorAll('.ref-url-row input')).map(i=>i.value.trim()).filter(Boolean);
  const platforms = isAdmin
    ? Array.from(document.querySelectorAll('#platformPicker .platform-toggle.active')).map(el=>{
        const input = document.querySelector(`.platform-url-input[data-platform="${el.dataset.platform}"]`);
        return { platform: el.dataset.platform, url: (input && input.value.trim()) || '' };
      })
    : []; // User biasa: ketersediaan online diusulkan lewat halaman detail (openLinkSubmitPopup), bukan form ini.
  if(isAdmin && platforms.some(p=> !p.url)){
    showToast('Link wajib diisi kalau platform ketersediaan online dipilih');
    return;
  }
  const paymentMethods = Array.from(document.querySelectorAll('#paymentPicker .platform-toggle.active')).map(el=>el.dataset.payment);
  const data = {
    id: editingId || null,
    name,
    address: document.getElementById('f_address').value.trim(),
    phone: document.getElementById('f_phone').value.trim(),
    type: document.getElementById('f_type').value,
    priceRange: document.getElementById('f_price').value,
    hoursByDay: readDayHoursFromForm(),
    onlinePlatforms: platforms,
    paymentMethods: paymentMethods,
    menuImages: imgUrls,
    lat: pickedLatLng.lat,
    lng: pickedLatLng.lng
  };
  try{
    const restoId = await upsertRestoCore(data);
    // Menu favorit, referensi, foto kunjungan, rating & testimoni di form ini hanya dipakai
    // untuk ISIAN AWAL resto baru. Untuk resto yang sudah ada, tambah/kelola lewat panel detail
    // (supaya jelas siapa penulisnya).
    if(!editingId){
      if(favMenus.length){
        const { error } = await sb.from('favorite_menu').insert(favMenus.map(menu_name=>({resto_id: restoId, user_id: myUserId, menu_name})));
        if(error) console.error(error);
      }
      if(refUrlsRaw.length){
        const refRows = refUrlsRaw.map(rawUrl=>{
          let url; try{ url = new URL(rawUrl).href; }catch(e){ url = rawUrl; }
          return {resto_id: restoId, user_id: myUserId, url, platform: detectPlatform(url)};
        });
        const { error } = await sb.from('references_link').insert(refRows);
        if(error) console.error(error);
      }
      if(formVisitPhotos.length){
        for(const p of formVisitPhotos){ await uploadVisitPhotoBlob(p.blob, restoId); }
      }
      const ratedCrit = RATING_CRITERIA.filter(c => formRatingDraft[c.key]);
      if(ratedCrit.length === RATING_CRITERIA.length){
        const critValues = RATING_CRITERIA.map(c => formRatingDraft[c.key]);
        const overall = critValues.reduce((a,b)=>a+b,0) / critValues.length;
        const row = {resto_id: restoId, user_id: myUserId, overall};
        RATING_CRITERIA.forEach(c=>{ row[c.key] = formRatingDraft[c.key]; });
        const { error } = await sb.from('ratings').upsert(row);
        if(error) console.error(error);
      } else if(ratedCrit.length > 0){
        showToast('Rating tidak disimpan: isi semua kriteria dulu, atau kosongkan semua.');
      }
      const testiVal = document.getElementById('f_testi').value.trim();
      if(testiVal){
        const { error } = await sb.from('testimonials').upsert({resto_id: restoId, user_id: myUserId, text: testiVal, updated_at: new Date().toISOString()});
        if(error) console.error(error);
      }
    }
    closeForm();
    showToast(editingId ? 'Perubahan disimpan' : 'Resto ditambahkan');
    editingId = null;
    formVisitPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    formVisitPhotos = [];
    resetFormRatingPicker();
    document.getElementById('f_testi').value = '';
    await loadAllRestos();
  }catch(e){
    showToast('Gagal menyimpan: ' + e.message);
  }
}
