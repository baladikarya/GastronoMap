/* ================= DETAIL PANEL ================= */
function reviewInitials(name){
  const clean = String(name || 'Pengguna').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'P') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function buildCombinedReviews(r){
  const ratingByUser = new Map((r.ratings || []).filter(x=>x.userId).map(x=>[x.userId, x]));
  const testiByUser = new Map((r.testimonials || []).filter(x=>x.userId).map(x=>[x.userId, x]));
  const userIds = new Set([...ratingByUser.keys(), ...testiByUser.keys()]);
  return [...userIds].map(userId=>{
    const rating = ratingByUser.get(userId) || null;
    const testimonial = testiByUser.get(userId) || null;
    const criteriaVals = RATING_CRITERIA.map(c=> rating && typeof rating[c.key] === 'number' ? rating[c.key] : null)
      .filter(v=> typeof v === 'number');
    const overall = rating && typeof rating.overall === 'number'
      ? rating.overall
      : (criteriaVals.length ? criteriaVals.reduce((a,b)=>a+b,0) / criteriaVals.length : null);

    const createdAtCandidates = [rating?.createdAt, testimonial?.createdAt].filter(v=> Number.isFinite(v) && v > 0);
    const createdAt = createdAtCandidates.length ? Math.min(...createdAtCandidates) : 0;
    const editedCandidates = [];
    // Toleransi 1 detik mencegah row lama yang created_at/updated_at-nya berbeda
    // beberapa milidetik saat insert dianggap sebagai hasil edit.
    if(rating && rating.updatedAt && rating.createdAt && rating.updatedAt - rating.createdAt > 1000){
      editedCandidates.push(rating.updatedAt);
    }
    if(testimonial && testimonial.updatedAt && testimonial.createdAt && testimonial.updatedAt - testimonial.createdAt > 1000){
      editedCandidates.push(testimonial.updatedAt);
    }
    const editedAt = editedCandidates.length ? Math.max(...editedCandidates) : 0;

    return {
      userId,
      rating,
      testimonial,
      overall,
      createdAt,
      editedAt,
      at: Math.max(rating?.at || 0, testimonial?.at || 0)
    };
  }).sort((a,b)=> (b.at || 0) - (a.at || 0));
}

function reviewListHtml(r, showAll){
  const reviews = buildCombinedReviews(r);
  if(!reviews.length){
    return `<div class="review-empty-state">
      <strong>Belum ada ulasan</strong>
      <span>Jadilah yang pertama membagikan penilaian dan pengalaman di tempat ini.</span>
    </div>`;
  }
  const visible = showAll ? reviews : reviews.slice(0, 3);
  let html = visible.map(review=>{
    const mine = review.userId === myUserId;
    const displayName = mine ? 'Anda' : (profilesMap[review.userId] || 'Pengguna');
    const dateBase = review.createdAt || review.at;
    const dateStr = dateBase ? new Date(dateBase).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}) : '';
    const editedStr = review.editedAt
      ? new Date(review.editedAt).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'})
      : '';
    const overallHtml = typeof review.overall === 'number'
      ? `<div class="review-card-rating"><span aria-hidden="true">★</span><strong>${review.overall.toFixed(1)}</strong></div>`
      : '';
    const textHtml = review.testimonial && review.testimonial.text
      ? `<div class="review-card-text">${escapeHtml(review.testimonial.text)}</div>`
      : '<div class="review-card-text review-card-text-muted">Memberikan rating tanpa ulasan tertulis.</div>';
    const moderationBtn = isAdmin
      ? `<button type="button" class="review-admin-menu-btn" data-review-user-id="${escapeAttr(review.userId)}" title="Kelola ulasan" aria-label="Kelola ulasan">•••</button>`
      : '';
    const editedHtml = editedStr
      ? `<div class="review-edited-note">(Edited ${escapeHtml(editedStr)})</div>`
      : '';

    return `<article class="review-card${mine ? ' is-mine' : ''}" data-review-user-id="${escapeAttr(review.userId)}">
      <div class="review-card-head">
        <div class="review-avatar" aria-hidden="true">${escapeHtml(reviewInitials(displayName))}</div>
        <div class="review-card-author">
          <strong>${escapeHtml(displayName)}</strong>
          <span>${dateStr || 'Tanggal tidak tersedia'}${mine ? ' · Ulasan Anda' : ''}</span>
        </div>
        <div class="review-card-head-actions">
          ${overallHtml}
          ${moderationBtn}
        </div>
      </div>
      ${textHtml}
      ${editedHtml}
    </article>`;
  }).join('');
  if(!showAll && reviews.length > 3){
    html += `<button type="button" class="review-show-more" id="testiShowMoreBtn">Lihat semua ${reviews.length} ulasan</button>`;
  }
  return html;
}

function openAdminReviewAction(r, reviewUserId, showAllReviews){
  if(!isAdmin || !reviewUserId) return;
  const mine = reviewUserId === myUserId;
  const displayName = mine ? 'ulasan Anda' : `ulasan ${profilesMap[reviewUserId] || 'pengguna ini'}`;
  const previous = document.getElementById('reviewAdminActionOverlay');
  if(previous) previous.remove();

  const overlay = document.createElement('div');
  overlay.id = 'reviewAdminActionOverlay';
  overlay.className = 'review-admin-action-overlay';
  overlay.innerHTML = `
    <div class="review-admin-action-sheet" role="dialog" aria-modal="true" aria-labelledby="reviewAdminActionTitle">
      <div class="food-menu-tag-handle" aria-hidden="true"></div>
      <h3 id="reviewAdminActionTitle">Kelola Ulasan</h3>
      <p>Admin hanya dapat menghapus ulasan pengguna lain, bukan mengedit isinya.</p>
      <button type="button" class="review-admin-delete-btn" id="reviewAdminDeleteBtn">
        <strong>Hapus Ulasan</strong>
        <span>Rating dan ulasan tertulis akan dihapus sekaligus.</span>
      </button>
      <button type="button" class="btn btn-secondary review-admin-cancel-btn" id="reviewAdminCancelBtn">Batal</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = ()=> overlay.remove();
  overlay.querySelector('#reviewAdminCancelBtn').onclick = close;
  overlay.addEventListener('click', e=>{ if(e.target === overlay) close(); });
  overlay.querySelector('#reviewAdminDeleteBtn').onclick = async ()=>{
    if(!confirm(`Hapus ${displayName}? Rating dan ulasan tertulis akan dihapus. Tindakan ini tidak dapat dibatalkan.`)) return;
    try{
      const { error } = await sb.rpc('admin_delete_review', {
        p_resto_id: r.id,
        p_user_id: reviewUserId
      });
      if(error) throw error;
      close();
      showToast('Ulasan berhasil dihapus');
      await loadAllRestos();
      openDetail(r.id, showAllReviews);
      activateDetailTab('ulasan');
    }catch(error){
      showToast('Gagal menghapus ulasan: ' + error.message);
    }
  };
}

function reviewAggregateHtml(summary){
  if(!summary.overallCount){
    return `<section class="review-summary-card is-empty">
      <div class="review-summary-empty-icon" aria-hidden="true">★</div>
      <div>
        <strong>Belum ada rating</strong>
        <span>Rating akan muncul setelah pengunjung memberikan penilaian.</span>
      </div>
    </section>`;
  }
  return `<section class="review-summary-card">
    <div class="review-score-block">
      <div class="review-score-main"><strong>${summary.overall.toFixed(1)}</strong><span>/5</span></div>
      <div class="review-score-stars">${renderStars(summary.overall)}</div>
      <span class="review-score-count">${summary.overallCount} ulasan</span>
    </div>
    <div class="review-criteria-summary">
      ${RATING_CRITERIA.map(c=>{
        const data = summary.byCriteria[c.key];
        const hasValue = data && data.count > 0;
        const avg = hasValue ? data.avg : 0;
        return `<div class="review-criteria-row">
          <span class="review-criteria-name">${escapeHtml(c.label)}</span>
          <span class="review-criteria-track"><span style="width:${(avg/5*100).toFixed(1)}%"></span></span>
          <strong>${hasValue ? avg.toFixed(1) : '—'}</strong>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function openFoodPhotoMenuTagPicker(r, options={}){
  return new Promise(resolve=>{
    const previous = document.getElementById('foodMenuTagOverlay');
    if(previous) previous.remove();

    const blob = options.blob || null;
    const objectPreviewUrl = blob ? URL.createObjectURL(blob) : '';
    const previewUrl = objectPreviewUrl || options.previewUrl || '';
    const mode = options.mode === 'edit' ? 'edit' : 'upload';
    const existingItems = (r.menuItems || []).slice().sort((a,b)=> a.name.localeCompare(b.name, 'id'));
    const existingById = new Map(existingItems.map(item=> [item.id, item]));
    const selected = new Map();
    const itemKey = (item)=> item.id ? `id:${item.id}` : `name:${normalizeMenuEntityName(item.name)}`;

    (options.initialMenuItemIds || []).forEach(id=>{
      const item = existingById.get(id);
      if(item) selected.set(itemKey(item), item);
    });

    const overlay = document.createElement('div');
    overlay.id = 'foodMenuTagOverlay';
    overlay.className = 'food-menu-tag-overlay';
    overlay.innerHTML = `
      <div class="food-menu-tag-sheet" role="dialog" aria-modal="true" aria-labelledby="foodMenuTagTitle">
        <div class="food-menu-tag-handle" aria-hidden="true"></div>
        <div class="food-menu-tag-head">
          ${previewUrl ? `<img class="food-menu-tag-preview" src="${escapeAttr(previewUrl)}" alt="Preview foto makanan">` : ''}
          <div>
            <h3 id="foodMenuTagTitle">${mode === 'edit' ? 'Edit menu pada foto' : 'Menu dalam foto ini'}</h3>
            <p>Pilih satu atau beberapa nama menu. Tag foto tidak otomatis menjadi rekomendasi.</p>
          </div>
        </div>
        <div class="food-menu-tag-selected" id="foodMenuTagSelected"></div>
        <div class="food-menu-tag-search-wrap">
          <input id="foodMenuTagSearch" type="text" autocomplete="off" placeholder="Cari nama menu yang sudah ada...">
        </div>
        <div class="food-menu-tag-suggestions" id="foodMenuTagSuggestions"></div>
        <div class="food-menu-tag-actions">
          <button type="button" class="btn btn-secondary" id="foodMenuTagCancel">Batal</button>
          <button type="button" class="btn btn-primary" id="foodMenuTagConfirm"></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const selectedEl = overlay.querySelector('#foodMenuTagSelected');
    const searchEl = overlay.querySelector('#foodMenuTagSearch');
    const suggestionsEl = overlay.querySelector('#foodMenuTagSuggestions');
    const confirmBtn = overlay.querySelector('#foodMenuTagConfirm');

    const closeWith = (value)=>{
      if(objectPreviewUrl) URL.revokeObjectURL(objectPreviewUrl);
      overlay.remove();
      resolve(value);
    };
    const addItem = (item)=>{
      const name = cleanMenuEntityName(item && item.name);
      if(!name) return;
      const normalizedName = item.normalizedName || normalizeMenuEntityName(name);
      const normalizedItem = {id:item.id || null, name, normalizedName};
      selected.set(itemKey(normalizedItem), normalizedItem);
      searchEl.value = '';
      renderSelected();
      renderSuggestions();
      searchEl.focus();
    };
    const removeItem = (key)=>{
      selected.delete(key);
      renderSelected();
      renderSuggestions();
    };
    const renderSelected = ()=>{
      const items = [...selected.entries()];
      selectedEl.innerHTML = items.length
        ? items.map(([key,item])=>`<button type="button" class="food-menu-selected-chip" data-key="${escapeAttr(key)}" title="Hapus tag menu">
            <span>${escapeHtml(item.name)}</span><span aria-hidden="true">×</span>
          </button>`).join('')
        : '<span class="food-menu-tag-none">Belum ada menu yang ditandai.</span>';
      selectedEl.querySelectorAll('.food-menu-selected-chip').forEach(btn=>{
        btn.onclick = ()=> removeItem(btn.dataset.key);
      });
      if(mode === 'edit'){
        confirmBtn.textContent = 'Simpan perubahan';
      }else{
        confirmBtn.textContent = items.length
          ? `Unggah foto · ${items.length} menu`
          : 'Unggah tanpa tag';
      }
    };

    const suggestionMeta = (item, rawQuery)=>{
      const query = normalizeMenuEntityName(rawQuery);
      if(!query) return {score:100, label:'Tersedia'};
      const itemStrict = item.normalizedName || normalizeMenuEntityName(item.name);
      const queryAlias = normalizeMenuName(rawQuery);
      const itemAlias = normalizeMenuName(item.name);

      if(itemStrict === query || (queryAlias && itemAlias === queryAlias)){
        return {score:0, label:'Sudah ada'};
      }
      if(itemStrict.startsWith(query) || (queryAlias && itemAlias.startsWith(queryAlias))){
        return {score:10, label:'Cocok'};
      }
      if(itemStrict.includes(query) || (queryAlias && itemAlias.includes(queryAlias))){
        return {score:20, label:'Cocok'};
      }
      if(queryAlias && itemAlias){
        const dist = levenshtein(itemAlias, queryAlias);
        const threshold = Math.min(3, Math.max(1, Math.floor(Math.max(itemAlias.length, queryAlias.length) * 0.22)));
        if(dist <= threshold) return {score:40 + dist, label:'Mirip'};
      }
      return null;
    };
    const getSuggestions = (rawQuery)=>{
      return existingItems
        .filter(item=> !selected.has(itemKey(item)))
        .map(item=> ({item, meta:suggestionMeta(item, rawQuery)}))
        .filter(entry=> !!entry.meta)
        .sort((a,b)=> a.meta.score - b.meta.score || a.item.name.localeCompare(b.item.name, 'id'))
        .slice(0, 8);
    };
    const hasEquivalentName = (rawQuery)=>{
      const strict = normalizeMenuEntityName(rawQuery);
      const alias = normalizeMenuName(rawQuery);
      return existingItems.some(item=>
        (item.normalizedName || normalizeMenuEntityName(item.name)) === strict
        || (alias && normalizeMenuName(item.name) === alias)
      ) || [...selected.values()].some(item=>
        item.normalizedName === strict || (alias && normalizeMenuName(item.name) === alias)
      );
    };

    const renderSuggestions = ()=>{
      const rawQuery = searchEl.value;
      const query = normalizeMenuEntityName(rawQuery);
      const suggestions = getSuggestions(rawQuery);
      const existingHtml = suggestions.map(({item,meta})=>`<button type="button" class="food-menu-suggestion" data-menu-id="${escapeAttr(item.id)}">
          <span class="food-menu-suggestion-main">
            <span class="food-menu-suggestion-name">${escapeHtml(item.name)}</span>
            <span class="food-menu-suggestion-sub">${meta.label === 'Sudah ada' ? 'Gunakan nama menu yang sudah tersimpan' : (meta.label === 'Mirip' ? 'Nama ini mirip dengan yang kamu ketik' : 'Nama menu yang sudah tersedia')}</span>
          </span>
          <span class="food-menu-suggestion-hint ${meta.label === 'Sudah ada' ? 'is-exact' : (meta.label === 'Mirip' ? 'is-similar' : '')}">${meta.label}</span>
        </button>`).join('');
      const rawNew = cleanMenuEntityName(rawQuery);
      const canCreate = !!(query && rawNew && !hasEquivalentName(rawQuery));
      const newOption = canCreate
        ? `<div class="food-menu-new-divider"><span>Belum menemukan nama yang tepat?</span></div>
           <button type="button" class="food-menu-suggestion food-menu-new-option" data-new-name="${escapeAttr(rawNew)}">
             <span class="food-menu-suggestion-plus">+</span>
             <span class="food-menu-suggestion-main">
               <span class="food-menu-suggestion-name">Tambah “${escapeHtml(rawNew)}”</span>
               <span class="food-menu-suggestion-sub">Buat sebagai menu baru. Pastikan bukan duplikat menu di atas.</span>
             </span>
           </button>`
        : '';
      suggestionsEl.innerHTML = existingHtml + newOption
        || '<div class="food-menu-tag-empty">Tidak ada nama menu yang cocok. Ketik nama menu untuk menambahkannya.</div>';

      suggestionsEl.querySelectorAll('[data-menu-id]').forEach(btn=>{
        btn.onclick = ()=>{
          const item = existingById.get(btn.dataset.menuId);
          if(item) addItem(item);
        };
      });
      const newBtn = suggestionsEl.querySelector('[data-new-name]');
      if(newBtn) newBtn.onclick = ()=> addItem({name:newBtn.dataset.newName});
    };

    searchEl.oninput = renderSuggestions;
    searchEl.onkeydown = (e)=>{
      if(e.key !== 'Enter') return;
      e.preventDefault();
      const raw = searchEl.value;
      if(!normalizeMenuEntityName(raw)) return;
      const suggestions = getSuggestions(raw);
      // Enter memprioritaskan entity yang sudah ada supaya typo tidak mudah membuat duplikat.
      if(suggestions.length) addItem(suggestions[0].item);
      else addItem({name:raw});
    };
    overlay.querySelector('#foodMenuTagCancel').onclick = ()=> closeWith(null);
    confirmBtn.onclick = ()=> closeWith([...selected.values()]);
    overlay.addEventListener('click', (e)=>{
      if(e.target === overlay) closeWith(null);
    });

    renderSelected();
    renderSuggestions();
    setTimeout(()=> searchEl.focus(), 0);
  });
}

function activateDetailTab(tabName){
  const btn = document.querySelector(`.detail-tab-btn[data-tab="${tabName}"]`);
  if(btn) btn.click();
}

function menuTagNamesSummary(items, maxNames=2){
  const names = (items || []).map(item=> item && item.name).filter(Boolean);
  if(names.length <= maxNames) return names.join(', ');
  return `${names.slice(0, maxNames).join(', ')} +${names.length - maxNames} menu`;
}

async function resolveMenuTagSelection(restoId, selectedMenuItems){
  const canonical = [];
  for(const selected of (selectedMenuItems || [])){
    if(selected.id){
      canonical.push(selected);
    }else{
      const item = await ensureMenuItem(restoId, selected.name);
      if(item) canonical.push(item);
    }
  }
  return canonical;
}

function openFoodPhotoActionSheet(r, photo, showAllTesti){
  const previous = document.getElementById('foodPhotoActionOverlay');
  if(previous) previous.remove();

  const itemById = new Map((r.menuItems || []).map(item=> [item.id, item]));
  const taggedNames = (photo.menuItemIds || []).map(id=> itemById.get(id)?.name).filter(Boolean);
  const overlay = document.createElement('div');
  overlay.id = 'foodPhotoActionOverlay';
  overlay.className = 'food-photo-action-overlay';
  overlay.innerHTML = `
    <div class="food-photo-action-sheet" role="dialog" aria-modal="true" aria-labelledby="foodPhotoActionTitle">
      <div class="food-menu-tag-handle" aria-hidden="true"></div>
      <div class="food-photo-action-head">
        <img src="${escapeAttr(photoPublicUrl(photo.storagePath))}" alt="Foto makanan">
        <div>
          <h3 id="foodPhotoActionTitle">Kelola Foto Makanan</h3>
          <p>${taggedNames.length ? `Ditandai sebagai ${escapeHtml(taggedNames.join(', '))}` : 'Belum ditandai ke nama menu.'}</p>
        </div>
      </div>
      <button type="button" class="food-photo-action-row" id="foodPhotoEditMenuBtn">
        <span><strong>Edit Menu</strong><small>Tambah atau hapus nama menu pada foto ini</small></span>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" class="food-photo-action-row is-danger" id="foodPhotoDeleteBtn">
        <span><strong>Hapus Foto</strong><small>Foto dan semua tag menunya akan dihapus</small></span>
      </button>
      <button type="button" class="btn btn-secondary food-photo-action-cancel" id="foodPhotoActionCancel">Batal</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = ()=> overlay.remove();
  overlay.querySelector('#foodPhotoActionCancel').onclick = close;
  overlay.addEventListener('click', e=>{ if(e.target === overlay) close(); });

  overlay.querySelector('#foodPhotoEditMenuBtn').onclick = async ()=>{
    close();
    const picked = await openFoodPhotoMenuTagPicker(r, {
      previewUrl: photoPublicUrl(photo.storagePath),
      initialMenuItemIds: photo.menuItemIds || [],
      mode: 'edit'
    });
    if(picked === null) return;
    try{
      const canonical = await resolveMenuTagSelection(r.id, picked);
      await syncFoodPhotoMenuTags(photo.id, photo.menuItemIds || [], canonical.map(item=>item.id));
      showToast(canonical.length
        ? `Menu pada foto diperbarui: ${menuTagNamesSummary(canonical)}`
        : 'Tag menu pada foto dihapus');
      await loadAllRestos();
      openDetail(r.id, showAllTesti);
      activateDetailTab('referensi');
    }catch(error){
      showToast('Gagal memperbarui menu pada foto: ' + error.message);
    }
  };

  overlay.querySelector('#foodPhotoDeleteBtn').onclick = async ()=>{
    if(!confirm('Hapus foto makanan ini? Foto dan tag menu terkait akan ikut dihapus.')) return;
    const ok = await deleteVisitPhoto(photo.id, photo.storagePath);
    if(!ok) return;
    close();
    showToast('Foto makanan dihapus');
    await loadAllRestos();
    openDetail(r.id, showAllTesti);
    activateDetailTab('referensi');
  };
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

  const formatHour = (value)=> String(value || '').replace(':','.');
  const allHoursRowsHtml = r.hoursByDay
    ? DAYS.map(day=>{
        const d = r.hoursByDay[day];
        const isToday = day === today;
        const txt = !d ? 'Belum diisi' : (d.closed ? 'Tutup' : `${formatHour(d.open)} – ${formatHour(d.close)}`);
        return `<div class="summary-hours-row ${isToday ? 'is-today' : ''}">
          <span class="summary-hours-day">${day}</span>
          <span class="summary-hours-time">${txt}</span>
        </div>`;
      }).join('')
    : '';

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
  const reviewSummaryHtml = reviewAggregateHtml(summary);

  const platforms = (r.onlinePlatforms||[]);
  let platformsHtml = '';
  if(r.noOnlineSales){
    platformsHtml = '<span class="summary-muted-value">Tidak tersedia</span>';
  } else if(platforms.length){
    platformsHtml = `<div class="summary-platform-list">${platforms.map(p=>{
        // Kompatibel data lama (string saja) maupun baru ({platform,url})
        const name = typeof p === 'string' ? p : p.platform;
        const url = typeof p === 'string' ? '' : (p.url || '');
        const meta = PLATFORM_FILTER_META[name] || {emoji:'🔗', color:'#555', file:'other'};
        const inner = `${platformIconHtml(meta.file, meta.emoji, 15)} ${name}`;
        if(url){
          return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener" class="platform-chip summary-platform-chip" style="--platform-color:${meta.color}">${inner}</a>`;
        }
        return `<button type="button" class="platform-chip summary-platform-chip platform-chip-add-link" data-platform="${escapeAttr(name)}" style="--platform-color:${meta.color}" title="Tambahkan link">${inner}</button>`;
      }).join('')}</div>`;
  } else {
    platformsHtml = `<button type="button" class="summary-complete-link platform-chip-add-link" id="onlineAvailabilityPromptChip">Lengkapi ketersediaan online</button>`;
  }
  const payments = (r.paymentMethods||[]);
  const paymentsText = payments.length
    ? payments.map(p=> p === 'cash' ? 'Tunai' : (p === 'cashless' ? 'Cashless' : p)).join(' & ')
    : 'Belum ada informasi';

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
      openStatusDetail = `Tutup ${clockLabel(todayHours.close)}`;
    }else{
      openStatusDetail = `Buka ${clockLabel(todayHours.open)}`;
    }
  }
  const openStatusPillHtml = r.hoursByDay
    ? `<span class="detail-pill ${isOpenNow ? 'open-yes' : 'open-no'}"><span class="detail-status-dot">${isOpenNow ? '✓' : '×'}</span>${isOpenNow ? 'Buka' : 'Tutup'}</span>`
    : '';

  const routeIcon = `<svg class="detail-cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12 12 3Z"/><path d="M8.5 13.5h4.2c1.5 0 2.3-.8 2.3-2.3V9.5"/><path d="m13 11 2-2 2 2"/></svg>`;
  const phoneIcon = `<svg class="detail-cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 10 7.8 8.4 9.5c1.2 2.4 3.2 4.4 5.6 5.6l1.7-1.6 4.3 2.8-.8 3.4c-.2.8-.9 1.3-1.7 1.3C9.5 20.3 3.7 14.5 3 6.5c-.1-.8.5-1.5 1.3-1.7l2.9-.7Z"/></svg>`;
  const heartIcon = `<svg class="detail-cta-icon detail-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/></svg>`;
  const reportIcon = `<svg class="detail-cta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>`;

  const referencePhotos = (r.photos || []).slice().sort((a,b)=> (b.at||0) - (a.at||0));
  const foodPhotos = referencePhotos.filter(p => visitPhotoCategory(p) === 'food');
  const ambiencePhotos = referencePhotos.filter(p => visitPhotoCategory(p) === 'ambience');
  const legacyVisitPhotos = referencePhotos.filter(p => visitPhotoCategory(p) === 'legacy');

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
      <button type="button" class="detail-tab-btn" data-tab="referensi">Referensi</button>
    </div>

    <div class="detail-tab-panel active" data-tab-panel="ringkasan">
      <section class="summary-main-section">
        <h4 class="summary-section-title">Informasi Utama</h4>

        <div class="summary-info-row">
          <div class="summary-info-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>
          </div>
          <div class="summary-info-label">Alamat</div>
          <div class="summary-info-value">${r.address ? escapeHtml(r.address) : '<span class="summary-muted-value">Belum ada informasi</span>'}</div>
          ${r.address ? `<button type="button" class="summary-row-action" id="copyAddressBtn" aria-label="Salin alamat" title="Salin alamat">
            <svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
          </button>` : ''}
        </div>

        <div class="summary-info-row">
          <div class="summary-info-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7.5h13.5a2.5 2.5 0 0 1 0 5H16"/><path d="M4 7.5v9A2.5 2.5 0 0 0 6.5 19H20V5H6.5A2.5 2.5 0 0 0 4 7.5Z"/><circle cx="16.5" cy="10" r=".8"/></svg>
          </div>
          <div class="summary-info-label">Rentang Harga</div>
          <div class="summary-info-value">${escapeHtml(r.priceRange || 'Belum ada informasi')}${r.priceRange ? '<span class="summary-value-suffix"> / orang</span>' : ''}</div>
        </div>

        <div class="summary-info-row">
          <div class="summary-info-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 15h4"/></svg>
          </div>
          <div class="summary-info-label">Pembayaran</div>
          <div class="summary-info-value">${escapeHtml(paymentsText)}</div>
        </div>

        <div class="summary-info-row summary-hours-wrap">
          <div class="summary-info-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>
          </div>
          <div class="summary-info-label">Jam Operasional</div>
          <div class="summary-info-value summary-hours-summary">
            ${r.hoursByDay && todayHours
              ? `<span class="summary-hours-today"><strong>${today}</strong><strong>${todayHours.closed ? 'Tutup' : `${formatHour(todayHours.open)} – ${formatHour(todayHours.close)}`}</strong></span>`
              : '<span class="summary-muted-value">Jam buka belum diisi</span>'}
          </div>
          ${r.hoursByDay ? `<div class="summary-hours-actions">
            ${openStatusPillHtml}
            <button type="button" class="summary-expand-btn" id="summaryHoursToggle" aria-expanded="false" aria-controls="summaryHoursDetails" aria-label="Lihat jam buka semua hari">
              <svg viewBox="0 0 24 24"><path d="m7 9 5 5 5-5"/></svg>
            </button>
          </div>` : ''}
          ${r.hoursByDay ? `<div class="summary-hours-details hidden" id="summaryHoursDetails">${allHoursRowsHtml}</div>` : ''}
        </div>

        <div class="summary-info-row">
          <div class="summary-info-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h3v3H7zM14 9h3v3h-3zM7 14h3v2H7zM14 14h3v2h-3z"/></svg>
          </div>
          <div class="summary-info-label">Platform Online</div>
          <div class="summary-info-value summary-platform-value">${platformsHtml}</div>
        </div>
      </section>

      ${isAdmin ? `<div class="action-row summary-admin-actions">
        <button class="btn btn-secondary" id="editBtn">✏️ Edit</button>
        <button class="btn btn-danger" id="delBtn">🗑</button>
      </div>
      <div class="admin-verify-row">
        <button class="btn ${r.isVerified ? 'btn-verify-on' : 'btn-verify-off'}" id="verifyBtn">${r.isVerified ? '✓ Verified' : 'Tandai Verified'}</button>
      </div>` : ''}
    </div>

    <div class="detail-tab-panel" data-tab-panel="menu">
      <section class="menu-section">
        <div class="menu-section-head">
          <div>
            <div class="detail-info-title"><h4>Rekomendasi Pengunjung</h4><button type="button" class="detail-info-trigger" aria-label="Info: Rekomendasi Pengunjung" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                        <p class="detail-info-popover" role="tooltip" hidden>Menu yang paling banyak direkomendasikan oleh pengunjung.</p>
          </div>
        </div>
        <div class="menu-recommend-list" id="favChipList">${(()=>{
          const ranked = rankMenuRecommendations(r);
          return ranked.length
            ? ranked.map((g,idx)=>{
                const hasPhotos = !!(g.menuItemId && g.photoCount > 0);
                return `<div class="menu-recommend-row${hasPhotos ? ' has-photos' : ''}"
                  ${g.menuItemId ? `data-menu-item-id="${escapeAttr(g.menuItemId)}"` : ''}
                  ${hasPhotos ? `data-menu-photo-count="${g.photoCount}" role="button" tabindex="0" aria-label="${escapeAttr(g.canonical)}, ${g.count} rekomendasi, lihat ${g.photoCount} foto"` : ''}>
                  <span class="menu-recommend-rank">${idx + 1}</span>
                  <span class="menu-recommend-body">
                    <span class="menu-recommend-name">${escapeHtml(g.canonical)}</span>
                    <span class="menu-recommend-meta">
                      <span class="menu-recommend-count" title="Jumlah rekomendasi">👍 ${g.count} rekomendasi</span>
                      ${g.photoCount > 0 ? `<span class="menu-recommend-sep" aria-hidden="true">·</span><span class="menu-recommend-photo-count" title="Buka galeri foto menu">${g.photoCount} foto <span aria-hidden="true">›</span></span>` : ''}
                    </span>
                  </span>
                </div>`;
              }).join('')
            : '<div class="menu-empty-state">Belum ada rekomendasi. Jadilah yang pertama merekomendasikan menu.</div>';
        })()}</div>
        <div class="quick-fav-row menu-recommend-form">
          <input type="text" id="quickFavInput" autocomplete="off" placeholder="Nama menu yang kamu rekomendasikan...">
          <button id="quickFavBtn">+ Rekomendasikan</button>
        </div>
        <div class="menu-recommend-autocomplete hidden" id="quickFavSuggestions"></div>
      </section>

      <section class="menu-section menu-price-section">
        <div class="menu-section-head">
          <div>
            <div class="detail-info-title"><h4>Daftar Menu &amp; Harga</h4><button type="button" class="detail-info-trigger" aria-label="Info: Daftar Menu & Harga" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                        <p class="detail-info-popover" role="tooltip" hidden>Foto buku menu, papan menu, atau daftar harga dari restoran ini.</p>
          </div>
        </div>
        ${buildMenuPhotosCarouselHtml(imgs, r.menuPhotos)}
        <input type="file" id="menuPhotoDetailCameraInput" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="menuPhotoDetailGalleryInput" accept="image/*" class="hidden">
        <div class="quick-photo-row menu-photo-actions">
          <button type="button" id="menuPhotoDetailCameraBtn" class="btn btn-secondary">📷 Ambil Foto</button>
          <button type="button" id="menuPhotoDetailGalleryBtn" class="btn btn-secondary">🖼️ Pilih Galeri</button>
        </div>
      </section>
    </div>

    <div class="detail-tab-panel" data-tab-panel="ulasan">
      <div class="review-tab-shell">
        ${reviewSummaryHtml}

        <section class="review-compose-section">
          <div class="review-compose-intro">
            <div>
              <div class="detail-info-title"><h4>${myRatingEntry || myTestiEntry ? 'Ulasan Anda' : 'Bagikan pengalaman Anda'}</h4><button type="button" class="detail-info-trigger" aria-label="Info: Bagikan pengalaman Anda" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                            <p class="detail-info-popover" role="tooltip" hidden>Nilai enam aspek restoran. Cerita pengalaman bersifat opsional.</p>
            </div>
            <button type="button" class="btn btn-primary review-compose-toggle" id="reviewComposerToggle">
              ${myRatingEntry || myTestiEntry ? 'Edit Ulasan' : 'Tulis Ulasan'}
            </button>
          </div>

          <div class="review-composer hidden" id="reviewComposer">
            <div class="review-composer-note">Rating wajib diisi untuk semua aspek. Ulasan tertulis boleh dikosongkan.</div>
            <div class="review-rating-grid" id="ratingSection">
              ${RATING_CRITERIA.map(c=>{
                const current = myRatingEntry && typeof myRatingEntry[c.key] === 'number' ? myRatingEntry[c.key] : 0;
                return `<div class="review-rating-row">
                  <span class="review-rating-label">${escapeHtml(c.label)}</span>
                  <div class="star-picker review-star-picker" data-crit="${escapeAttr(c.key)}" aria-label="Rating ${escapeAttr(c.label)}">
                    ${[1,2,3,4,5].map(v=>`<button type="button" data-v="${v}" class="${v <= current ? 'filled' : ''}" aria-label="${v} dari 5 untuk ${escapeAttr(c.label)}">★</button>`).join('')}
                  </div>
                  <span class="review-rating-value" data-rating-value="${escapeAttr(c.key)}">${current ? current.toFixed(1) : '—'}</span>
                </div>`;
              }).join('')}
            </div>
            <label class="review-text-label" for="reviewTextInput">
              Cerita pengalaman <span>Opsional</span>
            </label>
            <textarea id="reviewTextInput" class="review-text-input" maxlength="1200" placeholder="Apa yang paling berkesan? Ceritakan soal makanan, pelayanan, suasana, atau tips untuk pengunjung lain.">${myTestiEntry ? escapeHtml(myTestiEntry.text) : ''}</textarea>
            <div class="review-composer-actions">
              <button type="button" class="btn btn-secondary" id="cancelReviewBtn">Batal</button>
              <button type="button" class="btn btn-primary" id="submitReviewBtn">${myRatingEntry || myTestiEntry ? 'Simpan Perubahan' : 'Kirim Ulasan'}</button>
            </div>
          </div>
        </section>

        <section class="review-list-section">
          <div class="review-list-head">
            <div>
              <div class="detail-info-title"><h4>Ulasan Pengunjung</h4><button type="button" class="detail-info-trigger" aria-label="Info: Ulasan Pengunjung" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                            <p class="detail-info-popover" role="tooltip" hidden>Rating dan pengalaman dari pengunjung restoran ini.</p>
            </div>
            <span>${buildCombinedReviews(r).length} ulasan</span>
          </div>
          <div class="review-list" id="reviewList">${reviewListHtml(r, showAllTesti)}</div>
        </section>
      </div>
    </div>

    <div class="detail-tab-panel" data-tab-panel="referensi">
      <section class="reference-section">
        <div class="reference-section-head">
          <div>
            <div class="detail-info-title"><h4>Foto Makanan</h4><button type="button" class="detail-info-trigger" aria-label="Info: Foto Makanan" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                        <p class="detail-info-popover" role="tooltip" hidden>Foto hidangan yang dipesan pengunjung. Saat upload, nama menu dapat ditandai satu atau beberapa sekaligus.</p>
          </div>
          <span class="reference-count">${foodPhotos.length} foto</span>
        </div>
        ${buildReferencePhotoCarouselHtml(foodPhotos, 'foodPhotoGrid', 'Belum ada foto makanan.')}
        <input type="file" id="foodPhotoCameraInput" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="foodPhotoGalleryInput" accept="image/*" class="hidden">
        <div class="quick-photo-row reference-upload-actions">
          <button type="button" id="foodPhotoCameraBtn" class="btn btn-secondary">📷 Ambil Foto</button>
          <button type="button" id="foodPhotoGalleryBtn" class="btn btn-secondary">🖼️ Pilih Galeri</button>
        </div>
      </section>

      <section class="reference-section">
        <div class="reference-section-head">
          <div>
            <div class="detail-info-title"><h4>Foto Suasana</h4><button type="button" class="detail-info-trigger" aria-label="Info: Foto Suasana" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                        <p class="detail-info-popover" role="tooltip" hidden>Interior, eksterior, meja, dan suasana restoran dari kunjungan pengguna.</p>
          </div>
          <span class="reference-count">${ambiencePhotos.length} foto</span>
        </div>
        ${buildReferencePhotoCarouselHtml(ambiencePhotos, 'ambiencePhotoGrid', 'Belum ada foto suasana.')}
        <input type="file" id="ambiencePhotoCameraInput" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="ambiencePhotoGalleryInput" accept="image/*" class="hidden">
        <div class="quick-photo-row reference-upload-actions">
          <button type="button" id="ambiencePhotoCameraBtn" class="btn btn-secondary">📷 Ambil Foto</button>
          <button type="button" id="ambiencePhotoGalleryBtn" class="btn btn-secondary">🖼️ Pilih Galeri</button>
        </div>
      </section>

      ${legacyVisitPhotos.length ? `<section class="reference-section reference-legacy-section">
        <div class="reference-section-head">
          <div>
            <div class="detail-info-title"><h4>Foto Kunjungan Sebelumnya</h4><button type="button" class="detail-info-trigger" aria-label="Info: Foto Kunjungan Sebelumnya" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                        <p class="detail-info-popover" role="tooltip" hidden>Foto lama yang dibuat sebelum kategori Makanan dan Suasana tersedia.</p>
          </div>
          <span class="reference-count">${legacyVisitPhotos.length} foto</span>
        </div>
        ${buildReferencePhotoCarouselHtml(legacyVisitPhotos, 'legacyPhotoGrid', '')}
      </section>` : ''}

      <section class="reference-section reference-social-section">
        <div class="reference-section-head">
          <div>
            <div class="detail-info-title"><h4>Referensi Media Sosial</h4><button type="button" class="detail-info-trigger" aria-label="Info: Referensi Media Sosial" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.6"/><circle class="detail-info-dot" cx="12" cy="17.3" r="0.8"/></svg></button></div>
                        <p class="detail-info-popover" role="tooltip" hidden>Reels, TikTok, YouTube, atau link lain yang membantu mengenal restoran ini.</p>
          </div>
        </div>
        <div class="reference-social-grid" id="refGrid">${(r.references && r.references.length) ? r.references.map(buildRefCardHtml).join('') : '<div class="reference-empty-state">Belum ada referensi media sosial.</div>'}</div>
        <div class="quick-ref-row reference-link-form">
          <input type="url" id="quickRefInput" placeholder="Tempel link Instagram, TikTok, YouTube...">
          <button id="quickRefBtn">+ Tambah</button>
        </div>
      </section>
    </div>
  `;
  // Header tidak bergantung pada panjang konten tab: mode expanded/collapsed eksplisit.
  const detailPanelEl = document.getElementById('detailPanel');
  const compactBarEl = document.getElementById('detailCompactBar');
  const compactBackBtn = document.getElementById('detailCompactBackBtn');
  const compactExpandBtn = document.getElementById('detailCompactExpandBtn');
  const tabPanels = Array.from(detailPanelEl.querySelectorAll('.detail-tab-panel'));
  document.getElementById('detailCompactName').textContent = r.name;
  compactBackBtn.onclick = closeDetail;

  const setHeaderCollapsed = (collapsed)=>{
    detailPanelEl.classList.toggle('is-collapsed', collapsed);
    compactBarEl.setAttribute('aria-hidden', String(!collapsed));
    compactBackBtn.tabIndex = collapsed ? 0 : -1;
    compactExpandBtn.tabIndex = collapsed ? 0 : -1;
    compactExpandBtn.setAttribute('aria-expanded', String(!collapsed));
    if(!collapsed){
      const activePanel = tabPanels.find(panel=> panel.classList.contains('active'));
      if(activePanel) activePanel.scrollTop = 0;
    }
  };
  compactExpandBtn.onclick = ()=> setHeaderCollapsed(false);

  // Scroll panjang maupun gestur di tab kosong dapat mengecilkan header.
  // Setelah collapsed, hanya panel tab aktif yang scroll secara independen.
  tabPanels.forEach(panel=>{
    panel.onscroll = ()=>{
      if(panel.classList.contains('active') &&
         !detailPanelEl.classList.contains('is-collapsed') &&
         panel.scrollTop > 12){
        setHeaderCollapsed(true);
      }
    };
  });
  detailPanelEl.onwheel = (event)=>{
    if(event.deltaY > 8 && Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
       !detailPanelEl.classList.contains('is-collapsed')){
      setHeaderCollapsed(true);
    }
  };
  let gestureStart = null;
  detailPanelEl.ontouchstart = (event)=>{
    if(event.touches.length !== 1){ gestureStart = null; return; }
    const touch = event.touches[0];
    gestureStart = { x:touch.clientX, y:touch.clientY };
  };
  detailPanelEl.ontouchend = (event)=>{
    if(!gestureStart || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - gestureStart.x;
    const deltaY = touch.clientY - gestureStart.y;
    gestureStart = null;
    if(deltaY < -35 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2 &&
       !detailPanelEl.classList.contains('is-collapsed')){
      setHeaderCollapsed(true);
    }
  };
  detailPanelEl.onkeydown = (event)=>{
    const target = event.target;
    if((event.key === 'PageDown' || event.key === 'ArrowDown') &&
       !['INPUT','TEXTAREA','SELECT'].includes(target.tagName) &&
       !target.isContentEditable &&
       !detailPanelEl.classList.contains('is-collapsed')){
      setHeaderCollapsed(true);
    }
  };

  document.querySelectorAll('.detail-tab-btn').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('.detail-tab-btn').forEach(b=> b.classList.toggle('active', b === btn));
      tabPanels.forEach(panel=>{
        const active = panel.dataset.tabPanel === btn.dataset.tab;
        panel.classList.toggle('active', active);
        if(active) panel.scrollTop = 0;
      });
      // Pindah tab selalu memakai header ringkas, meski tab tujuan tidak punya konten.
      setHeaderCollapsed(true);
    };
  });
  // Petunjuk singkat per bagian: tersembunyi sampai tombol info ditekan.
  const closeDetailInfo = (except)=>{
    detailPanelEl.querySelectorAll('.detail-info-trigger').forEach(trigger=>{
      if(trigger === except) return;
      trigger.setAttribute('aria-expanded','false');
      const popup = trigger.parentElement.nextElementSibling;
      if(popup && popup.classList.contains('detail-info-popover')) popup.hidden = true;
    });
  };
  detailPanelEl.querySelectorAll('.detail-info-trigger').forEach(trigger=>{
    const popup = trigger.parentElement.nextElementSibling;
    if(!popup || !popup.classList.contains('detail-info-popover')) return;
    trigger.onclick = (event)=>{
      event.stopPropagation();
      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
      closeDetailInfo();
      if(!wasOpen){trigger.setAttribute('aria-expanded','true');popup.hidden=false;}
    };
  });
  // Pasang sekali pada panel yang dibuat ulang setiap kali detail dibuka.
  if(detailPanelEl._detailInfoOutsideClick) document.removeEventListener('click',detailPanelEl._detailInfoOutsideClick);
  if(detailPanelEl._detailInfoEscape) document.removeEventListener('keydown',detailPanelEl._detailInfoEscape);
  detailPanelEl._detailInfoOutsideClick = (event)=>{
    if(!event.target.closest('.detail-info-title, .detail-info-popover')) closeDetailInfo();
  };
  detailPanelEl._detailInfoEscape = (event)=>{
    if(event.key === 'Escape') closeDetailInfo();
  };
  document.addEventListener('click',detailPanelEl._detailInfoOutsideClick);
  document.addEventListener('keydown',detailPanelEl._detailInfoEscape);
  const socialGrid = document.getElementById('refGrid');
  hydrateReferenceThumbnails(socialGrid);
  const hoursToggleEl = document.getElementById('summaryHoursToggle');
  const hoursDetailsEl = document.getElementById('summaryHoursDetails');
  if(hoursToggleEl && hoursDetailsEl){
    hoursToggleEl.onclick = ()=>{
      const expanded = hoursToggleEl.getAttribute('aria-expanded') === 'true';
      hoursToggleEl.setAttribute('aria-expanded', String(!expanded));
      hoursToggleEl.classList.toggle('expanded', !expanded);
      hoursDetailsEl.classList.toggle('hidden', expanded);
    };
  }
  const copyAddressBtn = document.getElementById('copyAddressBtn');
  if(copyAddressBtn){
    copyAddressBtn.onclick = async ()=>{
      try{
        await navigator.clipboard.writeText(r.address || '');
        showToast('Alamat disalin');
      }catch(e){
        showToast('Tidak bisa menyalin alamat');
      }
    };
  }
  document.getElementById('telpCtaBtn').onclick = ()=>{ if(r.phone) window.location.href = `tel:${r.phone.replace(/[^0-9+]/g,'')}`; };
  document.getElementById('simpanCtaBtn').onclick = async ()=>{ await toggleWishlist(r.id); openDetail(id, showAllTesti); };
  document.getElementById('reportCtaBtn').onclick = ()=>{ openReportModal(r.id, r.name); };
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
  const setupReferencePhotoUpload = (kind, prefix)=>{
    const cameraBtn = document.getElementById(prefix + 'PhotoCameraBtn');
    const galleryBtn = document.getElementById(prefix + 'PhotoGalleryBtn');
    const cameraInput = document.getElementById(prefix + 'PhotoCameraInput');
    const galleryInput = document.getElementById(prefix + 'PhotoGalleryInput');
    if(!cameraBtn || !galleryBtn || !cameraInput || !galleryInput) return;
    cameraBtn.onclick = ()=>{
      if(!requireLogin()) return;
      cameraInput.click();
    };
    galleryBtn.onclick = ()=>{
      if(!requireLogin()) return;
      galleryInput.click();
    };
    const handlePick = async (e)=>{
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if(!file || !requireLogin()) return;
      showToast('Memeriksa wajah pada foto...');
      const blob = await prepareVisitPhotoBlob(file);
      if(!blob) return;

      let canonicalMenuItems = [];
      if(kind === 'food'){
        const picked = await openFoodPhotoMenuTagPicker(r, {blob, mode:'upload'});
        if(picked === null) return; // user membatalkan seluruh upload
        try{
          canonicalMenuItems = await resolveMenuTagSelection(r.id, picked);
        }catch(error){
          showToast('Gagal menyiapkan nama menu: ' + error.message);
          return;
        }
      }

      const uploaded = await uploadVisitPhotoBlob(blob, r.id, kind);
      if(!uploaded) return;

      if(kind === 'food'){
        if(canonicalMenuItems.length){
          try{
            await tagFoodPhotoMenuItems(uploaded.id, canonicalMenuItems.map(item=>item.id));
            showToast(`Foto berhasil ditambahkan · Menu: ${menuTagNamesSummary(canonicalMenuItems)}`);
          }catch(error){
            // Foto tetap dipertahankan walau tagging gagal; user tidak perlu upload ulang foto.
            showToast('Foto berhasil ditambahkan, tetapi tag menu gagal disimpan. Kamu bisa mengeditnya lewat tombol •••.');
            console.error('Gagal menyimpan tag menu foto:', error);
          }
        }else{
          showToast('Foto berhasil ditambahkan · Belum ada tag menu. Kamu bisa menambahkannya lewat tombol •••.');
        }
      }else{
        showToast('Foto suasana berhasil ditambahkan');
      }

      await loadAllRestos();
      openDetail(id, showAllTesti);
      activateDetailTab('referensi');
    };
    cameraInput.onchange = handlePick;
    galleryInput.onchange = handlePick;
  };
  setupReferencePhotoUpload('food', 'food');
  setupReferencePhotoUpload('ambience', 'ambience');
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
    if(ok){
      await loadAllRestos();
      openDetail(id, showAllTesti);
      activateDetailTab('menu');
    }
  };
  document.getElementById('menuPhotoDetailCameraInput').onchange = handleMenuPhotoDetailPick;
  document.getElementById('menuPhotoDetailGalleryInput').onchange = handleMenuPhotoDetailPick;
  const wireReferencePhotoGrid = (gridId, photos)=>{
    document.querySelectorAll(`#${gridId} .photo-card`).forEach(card=>{
      card.onclick = ()=> openPhotoLightbox(
        photos.map(p=>photoPublicUrl(p.storagePath)),
        Number(card.dataset.idx),
        (idx)=> visitPhotoCaptionFromList(photos, idx)
      );
    });
  };
  wireReferencePhotoGrid('foodPhotoGrid', foodPhotos);
  wireReferencePhotoGrid('ambiencePhotoGrid', ambiencePhotos);
  wireReferencePhotoGrid('legacyPhotoGrid', legacyVisitPhotos);

  document.querySelectorAll('#foodPhotoGrid .food-photo-more-btn').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      const photo = foodPhotos.find(item=> item.id === btn.dataset.id);
      if(photo) openFoodPhotoActionSheet(r, photo, showAllTesti);
    };
  });

  const openMenuLinkedPhotos = (menuItemId)=>{
    if(!menuItemId) return;
    const linkedPhotos = foodPhotos.filter(photo=> (photo.menuItemIds || []).includes(menuItemId));
    if(!linkedPhotos.length) return;
    openPhotoLightbox(
      linkedPhotos.map(photo=>photoPublicUrl(photo.storagePath)),
      0,
      (idx)=> visitPhotoCaptionFromList(linkedPhotos, idx)
    );
  };
  document.querySelectorAll('.menu-recommend-row.has-photos[data-menu-item-id]').forEach(row=>{
    row.onclick = ()=> openMenuLinkedPhotos(row.dataset.menuItemId);
    row.onkeydown = (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openMenuLinkedPhotos(row.dataset.menuItemId);
      }
    };
  });
  document.querySelectorAll('#menuPhotoDisplayGrid .photo-card').forEach(card=>{
    card.onclick = ()=> openPhotoLightbox(currentDetailMenuItems.map(item=>item.url), Number(card.dataset.idx));
  });
  document.querySelectorAll('.photo-del-btn:not(.menu-photo-del-btn)').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      if(!confirm('Hapus foto ini?')) return;
      const ok = await deleteVisitPhoto(btn.dataset.id, btn.dataset.path);
      if(ok){
        await loadAllRestos();
        openDetail(id, showAllTesti);
        activateDetailTab('referensi');
      }
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
      if(ok){
        await loadAllRestos();
        openDetail(id, showAllTesti);
        activateDetailTab('menu');
      }
    };
  });
  document.querySelectorAll('.ref-del-btn').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.preventDefault();
      if(!confirm('Hapus referensi ini?')) return;
      const ok = await deleteReference(btn.dataset.id);
      if(ok){
        await loadAllRestos();
        openDetail(id, showAllTesti);
        activateDetailTab('referensi');
        showToast('Referensi dihapus');
      }
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
    activateDetailTab('referensi');
  };
  const quickFavInput = document.getElementById('quickFavInput');
  const quickFavSuggestions = document.getElementById('quickFavSuggestions');
  const getQuickFavSuggestions = (raw)=>{
    const strict = normalizeMenuEntityName(raw);
    const alias = normalizeMenuName(raw);
    if(!strict) return [];
    return (r.menuItems || []).map(item=>{
      const itemStrict = item.normalizedName || normalizeMenuEntityName(item.name);
      const itemAlias = normalizeMenuName(item.name);
      let score = Infinity;
      let label = '';
      if(itemStrict === strict || (alias && itemAlias === alias)){
        score = 0; label = 'Sudah ada';
      }else if(itemStrict.startsWith(strict) || (alias && itemAlias.startsWith(alias))){
        score = 10; label = 'Cocok';
      }else if(itemStrict.includes(strict) || (alias && itemAlias.includes(alias))){
        score = 20; label = 'Cocok';
      }else if(alias && itemAlias){
        const dist = levenshtein(itemAlias, alias);
        const threshold = Math.min(3, Math.max(1, Math.floor(Math.max(itemAlias.length, alias.length) * 0.22)));
        if(dist <= threshold){ score = 40 + dist; label = 'Mirip'; }
      }
      return {item, score, label};
    }).filter(entry=> Number.isFinite(entry.score))
      .sort((a,b)=> a.score - b.score || a.item.name.localeCompare(b.item.name, 'id'))
      .slice(0, 5);
  };
  const renderQuickFavSuggestions = ()=>{
    const raw = quickFavInput.value;
    const suggestions = getQuickFavSuggestions(raw);
    if(!normalizeMenuEntityName(raw) || !suggestions.length){
      quickFavSuggestions.classList.add('hidden');
      quickFavSuggestions.innerHTML = '';
      return;
    }
    quickFavSuggestions.innerHTML = suggestions.map(({item,label})=>`
      <button type="button" class="menu-recommend-suggestion" data-name="${escapeAttr(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <small>${label}</small>
      </button>`).join('');
    quickFavSuggestions.classList.remove('hidden');
    quickFavSuggestions.querySelectorAll('.menu-recommend-suggestion').forEach(btn=>{
      btn.onclick = ()=>{
        quickFavInput.value = btn.dataset.name;
        quickFavSuggestions.classList.add('hidden');
        quickFavInput.focus();
      };
    });
  };
  quickFavInput.oninput = renderQuickFavSuggestions;
  quickFavInput.onfocus = renderQuickFavSuggestions;

  document.getElementById('quickFavBtn').onclick = async ()=>{
    if(!requireLogin()) return;
    const val = quickFavInput.value.trim();
    if(!val) return;
    // Untuk alias ejaan yang jelas (mis. "special"/"spesial"), gunakan entity yang
    // sudah ada. Kemiripan fuzzy tetap hanya suggestion dan tidak digabung otomatis.
    const alias = normalizeMenuName(val);
    const equivalent = (r.menuItems || []).find(item=> alias && normalizeMenuName(item.name) === alias);
    const recommendationName = equivalent ? equivalent.name : val;
    try{
      await addMenuRecommendation(id, recommendationName);
    }catch(error){
      showToast('Gagal: ' + error.message);
      return;
    }
    showToast(equivalent && equivalent.name !== val
      ? `Rekomendasi ditambahkan ke menu yang sudah ada: ${equivalent.name}`
      : 'Rekomendasi ditambahkan, terima kasih!');
    await loadAllRestos();
    openDetail(id, showAllTesti);
    activateDetailTab('menu');
  };
  const showMoreBtn = document.getElementById('testiShowMoreBtn');
  if(showMoreBtn) showMoreBtn.onclick = ()=>{
    openDetail(id, true);
    activateDetailTab('ulasan');
  };
  document.querySelectorAll('.review-admin-menu-btn[data-review-user-id]').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      openAdminReviewAction(r, btn.dataset.reviewUserId, showAllTesti);
    };
  });

  const reviewComposer = document.getElementById('reviewComposer');
  const reviewComposerToggle = document.getElementById('reviewComposerToggle');
  const cancelReviewBtn = document.getElementById('cancelReviewBtn');
  const submitReviewBtn = document.getElementById('submitReviewBtn');
  const reviewTextInput = document.getElementById('reviewTextInput');
  const ratingDraft = {};

  const setReviewComposerOpen = (open)=>{
    if(!reviewComposer) return;
    reviewComposer.classList.toggle('hidden', !open);
    if(reviewComposerToggle){
      reviewComposerToggle.textContent = open ? 'Tutup' : (myRatingEntry || myTestiEntry ? 'Edit Ulasan' : 'Tulis Ulasan');
      reviewComposerToggle.setAttribute('aria-expanded', String(open));
    }
    if(open){
      setTimeout(()=>{
        const firstUnset = RATING_CRITERIA.find(c=> !ratingDraft[c.key]);
        const target = firstUnset
          ? document.querySelector(`.review-star-picker[data-crit="${firstUnset.key}"] button`)
          : reviewTextInput;
        if(target) target.focus({preventScroll:true});
      }, 0);
    }
  };

  document.querySelectorAll('#ratingSection .review-star-picker').forEach(picker=>{
    const crit = picker.dataset.crit;
    ratingDraft[crit] = myRatingEntry && typeof myRatingEntry[crit] === 'number' ? myRatingEntry[crit] : 0;
    picker.querySelectorAll('button').forEach(star=>{
      star.onclick = ()=>{
        const value = Number(star.dataset.v);
        ratingDraft[crit] = value;
        picker.querySelectorAll('button').forEach(btn=>{
          const active = Number(btn.dataset.v) <= value;
          btn.classList.toggle('filled', active);
          btn.setAttribute('aria-pressed', String(Number(btn.dataset.v) === value));
        });
        const valueEl = document.querySelector(`[data-rating-value="${crit}"]`);
        if(valueEl) valueEl.textContent = value.toFixed(1);
      };
    });
  });

  if(reviewComposerToggle){
    reviewComposerToggle.setAttribute('aria-expanded', 'false');
    reviewComposerToggle.onclick = ()=>{
      if(!requireLogin()) return;
      setReviewComposerOpen(reviewComposer.classList.contains('hidden'));
    };
  }
  if(cancelReviewBtn) cancelReviewBtn.onclick = ()=> setReviewComposerOpen(false);

  if(submitReviewBtn) submitReviewBtn.onclick = async ()=>{
    if(!requireLogin()) return;
    const missing = RATING_CRITERIA.filter(c=> !ratingDraft[c.key]);
    if(missing.length){
      showToast('Lengkapi rating: ' + missing.map(c=>c.label).join(', '));
      const first = document.querySelector(`.review-star-picker[data-crit="${missing[0].key}"] button`);
      if(first) first.focus();
      return;
    }

    const textValue = reviewTextInput ? reviewTextInput.value.trim() : '';
    if(myTestiEntry && !textValue){
      showToast('Ulasan tertulis yang sudah dibuat tidak bisa dikosongkan. Edit isinya, atau admin dapat menghapus seluruh ulasan.');
      if(reviewTextInput) reviewTextInput.focus();
      return;
    }
    const critValues = RATING_CRITERIA.map(c=>ratingDraft[c.key]);
    const overall = critValues.reduce((a,b)=>a+b,0) / critValues.length;
    const ratingRow = {resto_id:id, user_id:myUserId, overall};
    RATING_CRITERIA.forEach(c=>{ ratingRow[c.key] = ratingDraft[c.key]; });

    submitReviewBtn.disabled = true;
    submitReviewBtn.textContent = 'Menyimpan...';
    let ratingSaved = false;
    try{
      const { error: ratingError } = await sb.from('ratings').upsert(ratingRow);
      if(ratingError) throw ratingError;
      ratingSaved = true;

      if(textValue){
        const { error: testiError } = await sb.from('testimonials').upsert({
          resto_id:id,
          user_id:myUserId,
          text:textValue
        });
        if(testiError) throw testiError;
      }

      showToast(myRatingEntry || myTestiEntry ? 'Ulasan Anda diperbarui' : 'Ulasan berhasil dikirim');
      await loadAllRestos();
      openDetail(id, showAllTesti);
      activateDetailTab('ulasan');
    }catch(error){
      showToast((ratingSaved ? 'Rating tersimpan, tetapi cerita ulasan gagal diperbarui: ' : 'Gagal menyimpan ulasan: ') + error.message);
      submitReviewBtn.disabled = false;
      submitReviewBtn.textContent = myRatingEntry || myTestiEntry ? 'Simpan Perubahan' : 'Kirim Ulasan';
    }
  };

  setHeaderCollapsed(false);
  detailPanelEl.classList.remove('hidden');
}
function closeDetail(){
  document.getElementById('detailPanel').classList.add('hidden');
}

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
  draftReady = false; // tidak menimpa draft sebelum pemulihan selesai
  document.getElementById('f_address').value = existing ? (existing.address || '') : '';
  document.getElementById('f_phone').value = existing ? (existing.phone || '') : '';
  document.getElementById('locSuggestions').classList.add('hidden');
  document.getElementById('nameSuggestions').classList.add('hidden');
  document.getElementById('f_name').value = existing ? existing.name : '';
  document.getElementById('f_type').value = existing ? existing.type : 'Indonesian';
  document.getElementById('f_price').value = existing ? (existing.priceRange || '') : '';
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
  const saveBtn = document.getElementById('saveForm');
  saveBtn.disabled = false;
  saveBtn.textContent = existing ? 'Simpan Perubahan' : 'Kirim Resto';
  document.getElementById('restoSaveStatus').classList.add('hidden');
  document.getElementById('draftRestoredNotice').classList.add('hidden');
  if(!existing){ goToWizardStep(1); restoreAddRestoDraft({keepLocation:!!quickLoc}); }
  else { saveBtn.classList.remove('hidden'); }
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

function closeForm(options = {}){
  if(isRestoSaving && !options.skipDraft)return;
  if(!options.skipDraft)saveAddRestoDraft();
  draftReady = false;
  pickingLocationMode = false;
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('pinPeekBar').classList.add('hidden');
  if(tempMarker){ map.removeLayer(tempMarker); tempMarker = null; }
}

/* ================= P1 TAHAP 5: ADD RESTO WIZARD + SESI DRAFT ================= */
let currentWizardStep = 1;
let draftReady = false;
let isRestoSaving = false;
function getAddRestoDraftKey(){return myUserId ? 'gastronomap:add-resto-draft:'+myUserId : null;}
function saveAddRestoDraft(){
  if(!draftReady || editingId || !myUserId || isRestoSaving) return;
  const key=getAddRestoDraftKey(); if(!key)return;
  const draft={
    name:document.getElementById('f_name').value,
    address:document.getElementById('f_address').value,
    phone:document.getElementById('f_phone').value,
    type:document.getElementById('f_type').value,
    price:document.getElementById('f_price').value,
    lat:pickedLatLng ? pickedLatLng.lat : null,
    lng:pickedLatLng ? pickedLatLng.lng : null,
    hoursByDay:readDayHoursFromForm(),
    payments:Array.from(document.querySelectorAll('#paymentPicker .platform-toggle.active')).map(x=>x.dataset.payment),
    favorites:Array.from(document.querySelectorAll('#favList .fav-row input')).map(x=>x.value),
    references:Array.from(document.querySelectorAll('#refUrlList .ref-url-row input')).map(x=>x.value),
    menuImages:formMenuImages.slice(),
    rating:{...formRatingDraft},
    testimonial:document.getElementById('f_testi').value,
    step:currentWizardStep,
    savedAt:Date.now()
  };
  try{sessionStorage.setItem(key,JSON.stringify(draft));}catch(error){console.warn('Draft tidak dapat disimpan:',error);}
}
function clearAddRestoDraft(){
  const key=getAddRestoDraftKey();
  if(key)try{sessionStorage.removeItem(key);}catch(error){console.warn('Draft tidak dapat dihapus:',error);}
  document.getElementById('draftRestoredNotice').classList.add('hidden');
}
function restoreAddRestoDraft(options={}){
  const key=getAddRestoDraftKey();
  let draft=null;
  try{draft=key && JSON.parse(sessionStorage.getItem(key)||'null');}catch(error){console.warn('Draft rusak:',error);}
  if(draft && typeof draft==='object'){
    const value=(id,v)=>{if(typeof v==='string')document.getElementById(id).value=v;};
    value('f_name',draft.name);value('f_address',draft.address);value('f_phone',draft.phone);
    value('f_type',draft.type);value('f_price',draft.price);value('f_testi',draft.testimonial);
    if(draft.hoursByDay && typeof draft.hoursByDay==='object')renderDayHoursRows(draft.hoursByDay);
    document.querySelectorAll('#paymentPicker .platform-toggle').forEach(el=>el.classList.toggle('active',(draft.payments||[]).includes(el.dataset.payment)));
    const favList=document.getElementById('favList');favList.innerHTML='';
    (Array.isArray(draft.favorites)&&draft.favorites.length?draft.favorites:['']).forEach(value=>addFavRow(value));
    const refList=document.getElementById('refUrlList');refList.innerHTML='';
    (Array.isArray(draft.references)&&draft.references.length?draft.references:['']).forEach(value=>addRefUrlRow(value));
    if(Array.isArray(draft.menuImages)) {formMenuImages=draft.menuImages.filter(u=>typeof u==='string');renderMenuPhotoGrid();}
    formRatingDraft=(draft.rating && typeof draft.rating==='object')?draft.rating:{};
    document.querySelectorAll('#formRatingForm .star-picker').forEach(picker=>{
      const n=Number(formRatingDraft[picker.dataset.crit]||0);
      picker.querySelectorAll('span').forEach(star=>star.classList.toggle('filled',Number(star.dataset.v)<=n));
    });
    if(!options.keepLocation && Number.isFinite(draft.lat) && Number.isFinite(draft.lng)){
      placeDraggableMarker(draft.lat,draft.lng,'draft dipulihkan','manual',{skipReverseGeocode:true});
    }
    goToWizardStep(Math.min(4,Math.max(1,Number(draft.step)||1)));
    document.getElementById('draftRestoredNotice').classList.remove('hidden');
  }else{
    document.getElementById('draftRestoredNotice').classList.add('hidden');
  }
  draftReady=true;
  saveAddRestoDraft();
}
function validateAddRestoBasics(){
  const name=document.getElementById('f_name').value.trim();
  const phone=document.getElementById('f_phone').value.trim();
  if(name.length<3){showToast('Nama resto minimal 3 karakter');document.getElementById('f_name').focus();return false;}
  if(!document.getElementById('f_type').value){showToast('Pilih kategori resto');return false;}
  if(phone && !/^[+\d\s().-]{7,24}$/.test(phone)){showToast('Nomor telepon tidak valid');document.getElementById('f_phone').focus();return false;}
  return true;
}
function validateAddRestoLocation(){
  if(!pickedLatLng || !Number.isFinite(pickedLatLng.lat) || !Number.isFinite(pickedLatLng.lng)){showToast('Pilih titik lokasi resto di peta');return false;}
  if(editingId)return true; // admin tetap boleh mengedit resto existing
  const candidates=findAddRestoDuplicateCandidates(document.getElementById('f_name').value.trim(),pickedLatLng.lat,pickedLatLng.lng);
  const blocked=candidates.find(x=>x.similar && x.distance<=25);
  if(blocked){showToast('Resto sangat mirip sudah ada di titik ini: '+blocked.resto.name);return false;}
  return true;
}
function validateAddRestoExtras(){
  const count=RATING_CRITERIA.filter(c=>Number(formRatingDraft[c.key])>0).length;
  if(count>0 && count!==RATING_CRITERIA.length){showToast('Isi keenam aspek rating atau kosongkan semuanya');return false;}
  const refs=Array.from(document.querySelectorAll('#refUrlList .ref-url-row input')).map(x=>x.value.trim()).filter(Boolean);
  for(const ref of refs){
    try{const url=new URL(ref);if(!['http:','https:'].includes(url.protocol))throw Error('Protokol tidak valid');}
    catch(error){showToast('Link referensi harus berupa URL lengkap https://...');return false;}
  }
  return true;
}
function goToWizardStep(n){
  currentWizardStep=n;
  document.querySelectorAll('.wizard-step').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===n));
  document.querySelectorAll('.wizard-step-item').forEach(el=>{
    const s=Number(el.dataset.stepItem),dot=el.querySelector('.wizard-step-dot');
    el.classList.toggle('active',s===n);
    dot.classList.toggle('active',s===n);
    dot.classList.toggle('done',s<n);
    dot.textContent=s<n?'✓':s;
    if(s===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
  });
  document.querySelectorAll('.wizard-step-connector').forEach(el=>el.classList.toggle('done',Number(el.dataset.connector)<n));
  const btn=document.getElementById('saveForm');
  btn.classList.toggle('hidden',n<4);
  if(n===2)refreshAddRestoDuplicateHint();
  if(n===4)renderWizardReview();
  document.getElementById('formModal').scrollTop=0;
  saveAddRestoDraft();
}
function renderWizardReview(){
  const val=id=>document.getElementById(id).value.trim()||'—';
  const row=(label,value)=>'<div class="wr-row"><span class="wr-label">'+escapeHtml(label)+'</span><span class="wr-value">'+escapeHtml(String(value))+'</span></div>';
  const section=(title,step)=>'<div class="wr-section"><span>'+escapeHtml(title)+'</span><button type="button" data-wizard-edit="'+step+'">Edit</button></div>';
  const favorites=Array.from(document.querySelectorAll('#favList .fav-row input')).map(x=>x.value.trim()).filter(Boolean);
  const references=Array.from(document.querySelectorAll('#refUrlList .ref-url-row input')).map(x=>x.value.trim()).filter(Boolean);
  const payments=Array.from(document.querySelectorAll('#paymentPicker .platform-toggle.active')).map(x=>x.dataset.payment);
  const ratingCount=RATING_CRITERIA.filter(c=>formRatingDraft[c.key]).length;
  const loc=pickedLatLng?pickedLatLng.lat.toFixed(5)+', '+pickedLatLng.lng.toFixed(5):'Belum dipilih';
  document.getElementById('wizardReviewBox').innerHTML=
    section('Informasi Dasar',1)+row('Nama',val('f_name'))+row('Kategori',val('f_type'))+
    row('Harga',val('f_price'))+row('Telepon',val('f_phone'))+
    section('Lokasi',2)+row('Alamat',val('f_address'))+row('Pin',loc)+
    section('Detail Tambahan',3)+row('Pembayaran',payments.join(', ')||'—')+
    row('Menu favorit',favorites.length+' menu')+
    row('Foto menu',formMenuImages.length+' foto')+row('Foto kunjungan',formVisitPhotos.length+' foto')+
    row('Referensi',references.length+' link')+
    row('Rating',ratingCount===6?'6 aspek':'Tidak diisi')+
    row('Testimoni',val('f_testi')==='—'?'Tidak diisi':'Sudah diisi');
  document.querySelectorAll('#wizardReviewBox [data-wizard-edit]').forEach(btn=>{
    btn.onclick=()=>goToWizardStep(Number(btn.dataset.wizardEdit));
  });
}
function findAddRestoDuplicateCandidates(name,lat,lng){
  if(!name || !Number.isFinite(lat) || !Number.isFinite(lng))return [];
  return Object.values(allRestos).filter(r=>r && r.id!==editingId && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))).map(r=>{
    const distance=distanceMetersBetween(lat,lng,Number(r.lat),Number(r.lng));
    return {resto:r,distance,similar:namesLookSimilar(name,r.name)};
  }).filter(x=>x.distance<=250 && (x.similar||x.distance<=8)).sort((a,b)=>a.distance-b.distance).slice(0,4);
}
function refreshAddRestoDuplicateHint(){
  const box=document.getElementById('duplicateRestoHint');
  if(!box || editingId || !pickedLatLng){if(box)box.classList.add('hidden');return;}
  const matches=findAddRestoDuplicateCandidates(document.getElementById('f_name').value.trim(),pickedLatLng.lat,pickedLatLng.lng);
  if(!matches.length){box.classList.add('hidden');return;}
  const blocked=matches.some(m=>m.similar && m.distance<=25);
  box.innerHTML='<strong>'+(blocked?'Resto serupa sudah terdaftar di dekat pin':'Periksa resto di sekitar titik ini')+'</strong>'+
    '<ul>'+matches.map(m=>'<li>'+escapeHtml(m.resto.name)+' — '+Math.round(m.distance)+' m'+(m.similar?' (nama mirip)':'')+'</li>').join('')+'</ul>'+
    '<span>'+(blocked?'Ubah lokasi atau periksa resto yang sudah ada.':'Pastikan tidak menambahkan resto yang sama dua kali.')+'</span>';
  box.classList.remove('hidden');
}
document.getElementById('wizardNext1').onclick=()=>{if(validateAddRestoBasics())goToWizardStep(2);};
document.getElementById('wizardBack2').onclick=()=>goToWizardStep(1);
document.getElementById('wizardNext2').onclick=()=>{if(validateAddRestoLocation())goToWizardStep(3);};
document.getElementById('wizardBack3').onclick=()=>goToWizardStep(2);
document.getElementById('wizardNext3').onclick=()=>{if(validateAddRestoExtras())goToWizardStep(4);};
document.getElementById('wizardBack4').onclick=()=>goToWizardStep(3);
document.getElementById('discardRestoDraftBtn').onclick=()=>{clearAddRestoDraft();draftReady=false;openForm(null);};
let addRestoDraftTimer=null;
const scheduleAddRestoDraft=()=>{clearTimeout(addRestoDraftTimer);addRestoDraftTimer=setTimeout(()=>{saveAddRestoDraft();refreshAddRestoDuplicateHint();},350);};
document.getElementById('formModal').addEventListener('input',scheduleAddRestoDraft);
document.getElementById('formModal').addEventListener('change',scheduleAddRestoDraft);
document.getElementById('formModal').addEventListener('click',scheduleAddRestoDraft);

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
  return String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function namesLookSimilar(a,b){
  const na=normalizeRestoName(a),nb=normalizeRestoName(b);
  if(!na||!nb)return false;
  if(na===nb)return true;
  const as=new Set(na.split(' ')),bs=new Set(nb.split(' '));
  const same=Array.from(as).filter(t=>bs.has(t)).length;
  return same>=2 && same/Math.max(as.size,bs.size)>=0.85;
}

function checkDuplicateLocation(name,lat,lng){
  const matches=findAddRestoDuplicateCandidates(name,lat,lng);
  const blocked=matches.find(m=>m.similar && m.distance<=25);
  if(blocked){showToast('Resto serupa sudah terdaftar: '+blocked.resto.name);return false;}
  const nearest=matches[0];
  if(!nearest)return true;
  const reason=nearest.similar?'bernama mirip':'berada di lokasi yang sangat dekat';
  return confirm('Ada resto '+reason+': "'+nearest.resto.name+'" ('+Math.round(nearest.distance)+' m). Yakin ini resto berbeda?');
}

async function handleSave(){
  if(isRestoSaving)return;
  const editMode=!!editingId;
  if(!validateAddRestoBasics()){if(!editMode)goToWizardStep(1);return;}
  if(!validateAddRestoLocation()){if(!editMode)goToWizardStep(2);return;}
  if(!validateAddRestoExtras()){if(!editMode)goToWizardStep(3);return;}
  if(!requireLogin())return;
  const name=document.getElementById('f_name').value.trim();
  if(!editMode && !checkDuplicateLocation(name,pickedLatLng.lat,pickedLatLng.lng))return;
  const favMenus=Array.from(document.querySelectorAll('#favList .fav-row input')).map(i=>i.value.trim()).filter(Boolean);
  const refUrlsRaw=Array.from(document.querySelectorAll('#refUrlList .ref-url-row input')).map(i=>i.value.trim()).filter(Boolean);
  const platforms=isAdmin?Array.from(document.querySelectorAll('#platformPicker .platform-toggle.active')).map(el=>{
    const input=document.querySelector('.platform-url-input[data-platform="'+el.dataset.platform+'"]');
    return {platform:el.dataset.platform,url:input?input.value.trim():''};
  }):[];
  if(isAdmin && platforms.some(p=>!p.url)){showToast('Link wajib diisi jika platform online dipilih');if(!editMode)goToWizardStep(3);return;}
  const data={
    id:editingId||null,name,address:document.getElementById('f_address').value.trim(),
    phone:document.getElementById('f_phone').value.trim(),type:document.getElementById('f_type').value,
    priceRange:document.getElementById('f_price').value || null,hoursByDay:readDayHoursFromForm(),
    onlinePlatforms:platforms,
    paymentMethods:Array.from(document.querySelectorAll('#paymentPicker .platform-toggle.active')).map(el=>el.dataset.payment),
    menuImages:formMenuImages.slice(),lat:pickedLatLng.lat,lng:pickedLatLng.lng
  };
  const btn=document.getElementById('saveForm'),status=document.getElementById('restoSaveStatus');
  isRestoSaving=true;btn.disabled=true;btn.textContent='Menyimpan...';
  status.classList.remove('hidden');status.textContent='Menyimpan data resto...';
  let coreSaved=false;
  const failures=[];
  const failure=(label,error)=>{failures.push(label);console.error('Add Resto — '+label,error);};
  try{
    const restoId=await upsertRestoCore(data);
    coreSaved=true;
    if(!editMode){
      status.textContent='Resto tersimpan. Mengirim kontribusi tambahan...';
      for(const menuName of favMenus){
        try{const ok=await addMenuRecommendation(restoId,menuName);if(!ok)failures.push('menu favorit');}
        catch(error){failure('menu favorit',error);}
      }
      if(refUrlsRaw.length){
        try{
          const rows=refUrlsRaw.map(url=>({resto_id:restoId,user_id:myUserId,url:new URL(url).href,platform:detectPlatform(url)}));
          const {error}=await sb.from('references_link').insert(rows);
          if(error)throw error;
        }catch(error){failure('referensi',error);}
      }
      for(const photo of formVisitPhotos){
        try{const uploaded=await uploadVisitPhotoBlob(photo.blob,restoId);if(!uploaded)throw Error('Upload gagal');}
        catch(error){failure('foto kunjungan',error);}
      }
      if(RATING_CRITERIA.every(c=>formRatingDraft[c.key])){
        try{
          const values=RATING_CRITERIA.map(c=>Number(formRatingDraft[c.key]));
          const rating={resto_id:restoId,user_id:myUserId,overall:values.reduce((a,b)=>a+b,0)/values.length};
          RATING_CRITERIA.forEach(c=>rating[c.key]=formRatingDraft[c.key]);
          const {error}=await sb.from('ratings').upsert(rating);
          if(error)throw error;
        }catch(error){failure('rating',error);}
      }
      const testi=document.getElementById('f_testi').value.trim();
      if(testi){
        try{
          const {error}=await sb.from('testimonials').upsert({resto_id:restoId,user_id:myUserId,text:testi,updated_at:new Date().toISOString()});
          if(error)throw error;
        }catch(error){failure('testimoni',error);}
      }
    }
    draftReady=false;clearAddRestoDraft();closeForm({skipDraft:true});
    editingId=null;
    formVisitPhotos.forEach(p=>URL.revokeObjectURL(p.previewUrl));
    formVisitPhotos=[];resetFormRatingPicker();
    document.getElementById('f_testi').value='';
    try{await loadAllRestos();}catch(error){failure('memuat ulang daftar resto',error);}
    if(failures.length)showToast('Resto tersimpan, tetapi beberapa data tambahan gagal: '+Array.from(new Set(failures)).join(', '));
    else showToast(editMode?'Perubahan resto berhasil disimpan':isAdmin?'Resto ditambahkan dan terverifikasi':'Resto terdaftar — menunggu verifikasi admin');
  }catch(error){
    status.textContent='Gagal menyimpan resto. Periksa jaringan lalu coba kembali.';
    showToast('Gagal menyimpan: '+error.message);
    console.error('Gagal menyimpan resto',error);
  }finally{
    isRestoSaving=false;
    btn.disabled=false;btn.textContent=editMode?'Simpan Perubahan':'Kirim Resto';
    if(coreSaved)status.classList.add('hidden');
  }
}
