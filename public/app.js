// ============================================================================
// JKT48 Hybrid Replay & DVR Studio - Frontend Controller
// ============================================================================

const state = {
  activeTab: 'replays',
  platform: 'ALL',
  selectedMember: '',
  searchQuery: '',
  fullOnly: true,
  members: [],
  replays: [],
  nowLive: [],
  recordings: [],
  oshiConfig: {
    autoRecordEnabled: true,
    oshiList: []
  },
  oshiSearchFilter: '',
  hlsInstance: null,
  currentPlayingLive: null
};

// DOM Elements
const els = {
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  brandHome: document.getElementById('brandHome'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  liveCountBadge: document.getElementById('liveCountBadge'),
  recCountBadge: document.getElementById('recCountBadge'),

  // Player
  playerSection: document.getElementById('playerSection'),
  playerPlatformBadge: document.getElementById('playerPlatformBadge'),
  playerTitle: document.getElementById('playerTitle'),
  playerQualitySelect: document.getElementById('playerQualitySelect'),
  playerRecordBtn: document.getElementById('playerRecordBtn'),
  playerExternalLink: document.getElementById('playerExternalLink'),
  closePlayerBtn: document.getElementById('closePlayerBtn'),
  ytPlayer: document.getElementById('ytPlayer'),
  hlsPlayer: document.getElementById('hlsPlayer'),
  playerFooterInfo: document.getElementById('playerFooterInfo'),

  // Replays Tab
  liveMiniBanner: document.getElementById('liveMiniBanner'),
  memberChipsContainer: document.getElementById('memberChipsContainer'),
  resetMemberBtn: document.getElementById('resetMemberBtn'),
  platformBtns: document.querySelectorAll('.seg-btn'),
  fullOnlyToggle: document.getElementById('fullOnlyToggle'),
  replayResultCounter: document.getElementById('replayResultCounter'),
  replaysGrid: document.getElementById('replaysGrid'),

  // Live Tab
  refreshLiveBtn: document.getElementById('refreshLiveBtn'),
  liveGrid: document.getElementById('liveGrid'),

  // Recordings & Oshi Tab
  recordingsList: document.getElementById('recordingsList'),
  autoRecordToggle: document.getElementById('autoRecordToggle'),
  oshiFilterInput: document.getElementById('oshiFilterInput'),
  oshiSelectedTags: document.getElementById('oshiSelectedTags'),
  oshiMemberChecklist: document.getElementById('oshiMemberChecklist'),

  toastContainer: document.getElementById('toastContainer')
};

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  els.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatSeconds(sec) {
  if (!sec || sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ============================================================================
// 1. TAB & NAVIGATION
// ============================================================================
function switchTab(tabName) {
  state.activeTab = tabName;
  els.navTabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  els.tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
  if (tabName === 'live') {
    loadNowLive(true);
  } else if (tabName === 'recordings') {
    loadRecordings();
  }
}

els.navTabs.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

els.brandHome.addEventListener('click', () => {
  state.selectedMember = '';
  state.searchQuery = '';
  els.searchInput.value = '';
  els.clearSearchBtn.classList.add('hidden');
  switchTab('replays');
  renderMemberChips();
  loadReplays();
});

// ============================================================================
// 2. BUILT-IN CINEMA PLAYER (YOUTUBE + HLS LIVE + LOCAL DVR)
// ============================================================================
function destroyHls() {
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  els.hlsPlayer.pause();
  els.hlsPlayer.removeAttribute('src');
  els.ytPlayer.src = 'about:blank';
}

function playYouTubeReplay(video) {
  destroyHls();
  state.currentPlayingLive = null;
  els.playerSection.classList.remove('hidden');

  const isIdn = video.platform === 'IDN';
  els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
  els.playerPlatformBadge.textContent = isIdn ? 'IDN REPLAY' : 'SHOWROOM REPLAY';
  els.playerTitle.textContent = video.title;

  els.playerQualitySelect.classList.add('hidden');
  els.playerRecordBtn.classList.add('hidden');

  els.playerExternalLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
  els.playerExternalLink.textContent = 'Buka di YouTube ↗';

  els.hlsPlayer.classList.add('hidden');
  els.ytPlayer.classList.remove('hidden');
  els.ytPlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0`;

  els.playerFooterInfo.innerHTML = `
    <span>Channel Arsip: <strong>${escapeHtml(video.channel || 'YouTube Archive')}</strong></span>
    <span>Diunggah: <strong>${escapeHtml(video.published || 'Baru saja')}</strong> • Durasi: <strong>${escapeHtml(video.duration || '-')}</strong></span>
  `;

  els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function playHlsStream({ title, platform, streamUrls, directPlaylistUrl, externalUrl, liveObj }) {
  destroyHls();
  state.currentPlayingLive = liveObj || null;
  els.playerSection.classList.remove('hidden');

  const isIdn = platform === 'IDN';
  els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
  els.playerPlatformBadge.textContent = directPlaylistUrl
    ? `${platform} LOCAL DVR`
    : `${platform} LIVE`;
  els.playerTitle.textContent = title;

  els.ytPlayer.classList.add('hidden');
  els.hlsPlayer.classList.remove('hidden');

  if (externalUrl) {
    els.playerExternalLink.href = externalUrl;
    els.playerExternalLink.textContent = 'Buka Sumber ↗';
    els.playerExternalLink.classList.remove('hidden');
  } else {
    els.playerExternalLink.classList.add('hidden');
  }

  if (liveObj && liveObj.bestStreamUrl) {
    els.playerRecordBtn.classList.remove('hidden');
    els.playerRecordBtn.onclick = () => triggerRecordLive(liveObj);
  } else {
    els.playerRecordBtn.classList.add('hidden');
  }

  const loadSource = m3u8Url => {
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false
      });
      state.hlsInstance = hls;
      hls.loadSource(m3u8Url);
      hls.attachMedia(els.hlsPlayer);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        els.hlsPlayer.play().catch(() => {});
      });
    } else if (els.hlsPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      els.hlsPlayer.src = m3u8Url;
      els.hlsPlayer.play().catch(() => {});
    }
  };

  if (directPlaylistUrl) {
    els.playerQualitySelect.classList.add('hidden');
    loadSource(directPlaylistUrl);
    els.playerFooterInfo.innerHTML = `<span>Memutar dari rekaman lokal di PC Anda (DVR)</span>`;
  } else if (Array.isArray(streamUrls) && streamUrls.length > 0) {
    if (streamUrls.length > 1) {
      els.playerQualitySelect.classList.remove('hidden');
      els.playerQualitySelect.innerHTML = streamUrls
        .map(
          (s, idx) =>
            `<option value="${ idx }">${escapeHtml(s.label || `${s.quality}p`)}</option>`
        )
        .join('');
      els.playerQualitySelect.onchange = e => {
        const chosen = streamUrls[Number(e.target.value)] || streamUrls[0];
        loadSource(`/api/hls-proxy?url=${encodeURIComponent(chosen.url)}`);
      };
    } else {
      els.playerQualitySelect.classList.add('hidden');
    }
    const firstUrl = streamUrls[0].url;
    loadSource(`/api/hls-proxy?url=${encodeURIComponent(firstUrl)}`);
    els.playerFooterInfo.innerHTML = `
      <span>Status: <strong>SEDANG LIVE (${escapeHtml(platform)})</strong></span>
      <span>Stream diputar melalui Local HLS Proxy</span>
    `;
  }

  els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

els.closePlayerBtn.addEventListener('click', () => {
  destroyHls();
  els.playerSection.classList.add('hidden');
});

// ============================================================================
// 3. MEMBERS & OSHI MANAGEMENT
// ============================================================================
async function loadMembers() {
  try {
    const res = await fetch('/api/members');
    const json = await res.json();
    if (json.ok) {
      state.members = json.data || [];
      renderMemberChips();
      renderOshiPanel();
    }
  } catch (err) {
    console.error('Gagal memuat daftar member:', err);
  }
}

function renderMemberChips() {
  const isFiltered = Boolean(state.selectedMember);
  els.resetMemberBtn.classList.toggle('hidden', !isFiltered);

  const chipsHtml = state.members
    .map(m => {
      const nick = m.nicknames?.[0] || m.name;
      const activeClass =
        state.selectedMember.toLowerCase() === nick.toLowerCase() ? 'active' : '';
      const isOshi = state.oshiConfig.oshiList.some(
        o => o.toLowerCase() === nick.toLowerCase()
      );
      const avatarContent = m.img
        ? `<img src="${escapeHtml(m.img)}" alt="${escapeHtml(nick)}" loading="lazy" />`
        : escapeHtml(nick.slice(0, 2).toUpperCase());

      return `
        <button class="member-chip ${activeClass}" data-nick="${escapeHtml(nick)}">
          <span class="member-chip-avatar">${avatarContent}</span>
          <span>${escapeHtml(nick)}${isOshi ? ' ⭐' : ''}</span>
        </button>
      `;
    })
    .join('');

  els.memberChipsContainer.innerHTML = chipsHtml;

  els.memberChipsContainer.querySelectorAll('.member-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const nick = btn.dataset.nick;
      if (state.selectedMember.toLowerCase() === nick.toLowerCase()) {
        state.selectedMember = '';
      } else {
        state.selectedMember = nick;
      }
      renderMemberChips();
      loadReplays();
    });
  });
}

els.resetMemberBtn.addEventListener('click', () => {
  state.selectedMember = '';
  renderMemberChips();
  loadReplays();
});

async function loadOshiConfig() {
  try {
    const res = await fetch('/api/oshi');
    const json = await res.json();
    if (json.ok && json.data) {
      state.oshiConfig = json.data;
      els.autoRecordToggle.checked = Boolean(state.oshiConfig.autoRecordEnabled);
      renderMemberChips();
      renderOshiPanel();
    }
  } catch (err) {
    console.error('Gagal memuat konfigurasi Oshi:', err);
  }
}

async function saveOshiConfig() {
  try {
    const res = await fetch('/api/oshi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.oshiConfig)
    });
    const json = await res.json();
    if (json.ok) {
      state.oshiConfig = json.data;
      renderMemberChips();
      renderOshiPanel();
      showToast('Pengaturan Auto-Record Oshi tersimpan!');
    }
  } catch (err) {
    showToast('Gagal menyimpan pengaturan Oshi');
  }
}

function renderOshiPanel() {
  const oshiList = state.oshiConfig.oshiList || [];

  if (oshiList.length === 0) {
    els.oshiSelectedTags.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">Belum ada Oshi dipilih untuk Auto-Record.</span>`;
  } else {
    els.oshiSelectedTags.innerHTML = oshiList
      .map(
        nick => `
        <span class="oshi-tag">
          ⭐ ${escapeHtml(nick)}
          <button type="button" data-remove-oshi="${escapeHtml(nick)}">&times;</button>
        </span>
      `
      )
      .join('');

    els.oshiSelectedTags.querySelectorAll('[data-remove-oshi]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.removeOshi;
        state.oshiConfig.oshiList = state.oshiConfig.oshiList.filter(
          o => o.toLowerCase() !== target.toLowerCase()
        );
        saveOshiConfig();
      });
    });
  }

  const filterQ = state.oshiSearchFilter.toLowerCase();
  const filteredMembers = state.members.filter(m => {
    const nick = (m.nicknames?.[0] || '').toLowerCase();
    return !filterQ || nick.includes(filterQ) || m.name.toLowerCase().includes(filterQ);
  });

  els.oshiMemberChecklist.innerHTML = filteredMembers
    .map(m => {
      const nick = m.nicknames?.[0] || m.name;
      const checked = oshiList.some(o => o.toLowerCase() === nick.toLowerCase());
      return `
        <label class="oshi-check-item">
          <span><strong>${escapeHtml(nick)}</strong> <small style="color:var(--text-muted)">(${escapeHtml(m.name)})</small></span>
          <input type="checkbox" data-oshi-nick="${escapeHtml(nick)}" ${checked ? 'checked' : ''} />
        </label>
      `;
    })
    .join('');

  els.oshiMemberChecklist.querySelectorAll('[data-oshi-nick]').forEach(chk => {
    chk.addEventListener('change', () => {
      const nick = chk.dataset.oshiNick;
      if (chk.checked) {
        if (!state.oshiConfig.oshiList.includes(nick)) {
          state.oshiConfig.oshiList.push(nick);
        }
      } else {
        state.oshiConfig.oshiList = state.oshiConfig.oshiList.filter(
          o => o.toLowerCase() !== nick.toLowerCase()
        );
      }
      saveOshiConfig();
    });
  });
}

els.autoRecordToggle.addEventListener('change', () => {
  state.oshiConfig.autoRecordEnabled = els.autoRecordToggle.checked;
  saveOshiConfig();
});

els.oshiFilterInput.addEventListener('input', e => {
  state.oshiSearchFilter = e.target.value;
  renderOshiPanel();
});

// ============================================================================
// 4. REPLAY INSTAN LOADER & RENDERER
// ============================================================================
async function loadReplays(force = false) {
  els.replaysGrid.innerHTML = `
    <div class="state-box">
      <h3>Sedang mengambil daftar Replay terbaru...</h3>
      <p>Menyinkronkan arsip cepat IDN Live &amp; Showroom tanpa tunggu 72 jam.</p>
    </div>
  `;

  try {
    const params = new URLSearchParams({
      q: state.searchQuery,
      member: state.selectedMember,
      platform: state.platform,
      fullOnly: state.fullOnly ? '1' : '0',
      refresh: force ? '1' : '0'
    });
    const res = await fetch(`/api/replays?${params.toString()}`);
    const json = await res.json();
    if (json.ok) {
      state.replays = json.data || [];
      renderReplaysGrid();
    }
  } catch (err) {
    els.replaysGrid.innerHTML = `
      <div class="state-box">
        <h3>Gagal memuat daftar Replay</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderReplaysGrid() {
  els.replayResultCounter.textContent = `${state.replays.length} Video Replay`;

  if (state.replays.length === 0) {
    els.replaysGrid.innerHTML = `
      <div class="state-box">
        <h3>Tidak ada video replay yang cocok</h3>
        <p>Coba ubah filter member, platform, atau matikan filter "&ge; 5 Menit".</p>
      </div>
    `;
    return;
  }

  els.replaysGrid.innerHTML = state.replays
    .map((v, idx) => {
      const isIdn = v.platform === 'IDN';
      return `
        <article class="video-card" data-replay-idx="${idx}">
          <div class="thumb-wrap">
            <span class="platform-pill ${isIdn ? 'idn' : 'sr'}">${isIdn ? 'IDN LIVE' : 'SHOWROOM'}</span>
            ${v.published ? `<span class="age-badge">${escapeHtml(v.published)}</span>` : ''}
            <img src="${escapeHtml(v.thumb)}" alt="${escapeHtml(v.title)}" loading="lazy" />
            ${v.duration ? `<span class="duration-badge">${escapeHtml(v.duration)}</span>` : ''}
          </div>
          <div class="card-body">
            <h3 class="card-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</h3>
            <div class="card-meta">
              <span>📺 ${escapeHtml(v.channel || 'Archive')}</span>
              <span>${escapeHtml(v.views || '')}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  els.replaysGrid.querySelectorAll('[data-replay-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const video = state.replays[Number(card.dataset.replayIdx)];
      if (video) playYouTubeReplay(video);
    });
  });
}

// Filter Toolbar Events
els.platformBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.platform = btn.dataset.platform;
    els.platformBtns.forEach(b => b.classList.toggle('active', b === btn));
    loadReplays();
  });
});

els.fullOnlyToggle.addEventListener('change', () => {
  state.fullOnly = els.fullOnlyToggle.checked;
  loadReplays();
});

els.searchForm.addEventListener('submit', e => {
  e.preventDefault();
  state.searchQuery = els.searchInput.value.trim();
  els.clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
  switchTab('replays');
  loadReplays();
});

els.clearSearchBtn.addEventListener('click', () => {
  els.searchInput.value = '';
  state.searchQuery = '';
  els.clearSearchBtn.classList.add('hidden');
  loadReplays();
});

els.refreshBtn.addEventListener('click', () => {
  showToast('Memperbarui data live & replay...');
  loadNowLive(true);
  loadReplays(true);
  loadRecordings();
});

// ============================================================================
// 5. SEDANG LIVE MONITOR & TRIGGER RECORD
// ============================================================================
async function loadNowLive(force = false) {
  try {
    const res = await fetch(`/api/now-live?refresh=${force ? '1' : '0'}`);
    const json = await res.json();
    if (json.ok) {
      state.nowLive = json.data || [];
      els.liveCountBadge.textContent = state.nowLive.length;
      renderLiveMiniBanner();
      renderLiveGrid();
    }
  } catch (err) {
    console.error('Gagal memuat now-live:', err);
  }
}

function renderLiveMiniBanner() {
  if (state.nowLive.length === 0) {
    els.liveMiniBanner.classList.add('hidden');
    return;
  }
  els.liveMiniBanner.classList.remove('hidden');
  const pills = state.nowLive
    .map(
      (item, idx) => `
      <button class="live-pill-btn" data-mini-live-idx="${idx}">
        <img src="${escapeHtml(item.avatar || item.img)}" alt="${escapeHtml(item.name)}" />
        <span>${escapeHtml(item.name)}</span>
        <span class="platform-pill ${item.platform === 'IDN' ? 'idn' : 'sr'}" style="position:static;font-size:9.5px;padding:1px 5px">${item.platform}</span>
      </button>
    `
    )
    .join('');

  els.liveMiniBanner.innerHTML = `
    <div class="live-mini-left">
      <span class="live-dot-pulse"></span>
      <strong style="font-size:13px">${state.nowLive.length} Member Sedang Live Sekarang:</strong>
      <div class="live-mini-avatars">${pills}</div>
    </div>
    <button class="btn-action subtle" id="goToLiveTabBtn" style="padding:5px 11px;font-size:12px">Buka Monitor Live &rarr;</button>
  `;

  els.liveMiniBanner.querySelectorAll('[data-mini-live-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.nowLive[Number(btn.dataset.miniLiveIdx)];
      if (item) {
        playHlsStream({
          title: `${item.name} (${item.slug || 'Live Stream'})`,
          platform: item.platform,
          streamUrls: item.streamUrls,
          externalUrl:
            item.platform === 'IDN'
              ? `https://www.idn.app/${item.urlKey}/live/${item.slug}`
              : `https://www.showroom-live.com/r/${item.urlKey}`,
          liveObj: item
        });
      }
    });
  });

  const goBtn = document.getElementById('goToLiveTabBtn');
  if (goBtn) goBtn.addEventListener('click', () => switchTab('live'));
}

function renderLiveGrid() {
  if (state.nowLive.length === 0) {
    els.liveGrid.innerHTML = `
      <div class="state-box">
        <h3>Tidak ada member JKT48 yang sedang live saat ini</h3>
        <p>Anda bisa menonton Replay Instan di tab sebelah, atau mengaktifkan Auto-Record Oshi agar otomatis merekam saat member mulai live.</p>
      </div>
    `;
    return;
  }

  els.liveGrid.innerHTML = state.nowLive
    .map((item, idx) => {
      const isIdn = item.platform === 'IDN';
      return `
        <article class="video-card">
          <div class="thumb-wrap" data-play-live="${idx}">
            <span class="platform-pill ${isIdn ? 'idn' : 'sr'}">${item.platform} LIVE</span>
            <span class="age-badge">🔴 LIVE</span>
            <img src="${escapeHtml(item.img || item.avatar)}" alt="${escapeHtml(item.name)}" />
          </div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(item.name)}</h3>
            <div class="card-meta">
              <span>Mulai: ${item.startedAt ? new Date(item.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB' : 'Baru saja'}</span>
              <span>${escapeHtml(item.streamUrls?.[0]?.label || 'HD')}</span>
            </div>
            <div class="card-actions">
              <button class="btn-action" data-play-live="${idx}" style="flex:1">▶ Tonton Live</button>
              <button class="btn-action ${item.isRecording ? 'recording-active' : 'record'}" data-rec-live="${idx}">
                ${item.isRecording ? '● Sedang Direkam' : '⏺ Rekam'}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  els.liveGrid.querySelectorAll('[data-play-live]').forEach(el => {
    el.addEventListener('click', () => {
      const item = state.nowLive[Number(el.dataset.playLive)];
      if (item) {
        playHlsStream({
          title: `${item.name} (${item.slug || 'Live Stream'})`,
          platform: item.platform,
          streamUrls: item.streamUrls,
          externalUrl:
            item.platform === 'IDN'
              ? `https://www.idn.app/${item.urlKey}/live/${item.slug}`
              : `https://www.showroom-live.com/r/${item.urlKey}`,
          liveObj: item
        });
      }
    });
  });

  els.liveGrid.querySelectorAll('[data-rec-live]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.nowLive[Number(btn.dataset.recLive)];
      if (item) triggerRecordLive(item);
    });
  });
}

async function triggerRecordLive(liveItem) {
  if (!liveItem.bestStreamUrl) {
    showToast('URL stream tidak tersedia untuk direkam');
    return;
  }
  try {
    showToast(`Memulai perekaman ${liveItem.name}...`);
    const res = await fetch('/api/record/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberName: liveItem.name,
        memberKey: liveItem.urlKey || liveItem.name,
        platform: liveItem.platform,
        streamUrl: liveItem.bestStreamUrl,
        avatar: liveItem.avatar || liveItem.img,
        roomId: liveItem.roomId
      })
    });
    const json = await res.json();
    if (json.ok) {
      showToast(`Rekaman ${liveItem.name} berjalan di latar belakang!`);
      loadNowLive(true);
      loadRecordings();
    } else {
      showToast(`Gagal merekam: ${json.error}`);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

els.refreshLiveBtn.addEventListener('click', () => {
  showToast('Memeriksa member yang sedang live...');
  loadNowLive(true);
});

// ============================================================================
// 6. LOCAL DVR RECORDINGS MANAGER
// ============================================================================
async function loadRecordings() {
  try {
    const res = await fetch('/api/recordings');
    const json = await res.json();
    if (json.ok) {
      state.recordings = json.data || [];
      els.recCountBadge.textContent = state.recordings.length;
      renderRecordingsList();
    }
  } catch (err) {
    console.error('Gagal memuat daftar rekaman lokal:', err);
  }
}

function renderRecordingsList() {
  if (state.recordings.length === 0) {
    els.recordingsList.innerHTML = `
      <div class="state-box">
        <h3>Belum ada rekaman lokal</h3>
        <p>Klik tombol <strong>"Rekam"</strong> pada member yang sedang live, atau pilih Oshi di panel sebelah kanan agar sistem otomatis merekam tanpa tunggu 72 jam.</p>
      </div>
    `;
    return;
  }

  els.recordingsList.innerHTML = state.recordings
    .map((rec, idx) => {
      const isRec = rec.status === 'recording';
      const dateStr = new Date(rec.startedAt).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="rec-item">
          <div class="rec-info">
            ${
              rec.avatar
                ? `<img class="rec-avatar" src="${escapeHtml(rec.avatar)}" alt="${escapeHtml(rec.memberName)}" />`
                : `<div class="rec-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:800">48</div>`
            }
            <div>
              <div class="rec-title">
                <span>${escapeHtml(rec.memberName)}</span>
                <span class="platform-pill ${rec.platform === 'IDN' ? 'idn' : 'sr'}">${escapeHtml(rec.platform)}</span>
                ${
                  isRec
                    ? `<span style="color:#34d399;font-size:12px">● Merekam (${rec.segmentCount} segmen)</span>`
                    : `<span style="color:var(--text-muted);font-size:12px">✓ Selesai</span>`
                }
              </div>
              <div class="rec-sub">
                ${escapeHtml(dateStr)} WIB • Durasi: <strong>${formatSeconds(rec.durationSeconds)}</strong> • Ukuran: <strong>${formatBytes(rec.sizeBytes)}</strong>
              </div>
            </div>
          </div>

          <div class="rec-actions">
            <button class="btn-action" data-play-rec="${idx}">▶ Putar DVR</button>
            ${
              isRec
                ? `<button class="btn-action record" data-stop-rec="${escapeHtml(rec.id)}">⏹ Stop</button>`
                : ''
            }
            <a class="btn-action subtle" href="${escapeHtml(rec.downloadUrl)}" download>⬇ Download (.ts)</a>
            <button class="btn-action subtle" data-del-rec="${escapeHtml(rec.id)}" title="Hapus rekaman">🗑</button>
          </div>
        </div>
      `;
    })
    .join('');

  els.recordingsList.querySelectorAll('[data-play-rec]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rec = state.recordings[Number(btn.dataset.playRec)];
      if (rec) {
        playHlsStream({
          title: `Rekaman Lokal: ${rec.memberName} (${new Date(rec.startedAt).toLocaleDateString('id-ID')})`,
          platform: rec.platform,
          directPlaylistUrl: rec.playlistUrl
        });
      }
    });
  });

  els.recordingsList.querySelectorAll('[data-stop-rec]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.stopRec;
      await fetch('/api/record/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      showToast('Rekaman dihentikan.');
      loadRecordings();
      loadNowLive(true);
    });
  });

  els.recordingsList.querySelectorAll('[data-del-rec]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delRec;
      if (!confirm('Hapus rekaman lokal ini dari PC?')) return;
      await fetch(`/api/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast('Rekaman dihapus.');
      loadRecordings();
    });
  });
}

// ============================================================================
// 7. INITIALIZATION & PERIODIC POLLING
// ============================================================================
(async function init() {
  await Promise.all([loadOshiConfig(), loadMembers(), loadNowLive(), loadReplays(), loadRecordings()]);

  // Poll status live & rekaman setiap 30 detik
  setInterval(() => {
    loadNowLive();
    if (state.activeTab === 'recordings' || state.recordings.some(r => r.status === 'recording')) {
      loadRecordings();
    }
  }, 30000);
})();

