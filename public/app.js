// ============================================================================
// JKT48 Hybrid Replay & DVR Studio - Frontend Controller (with Chat & JKT48Connect)
// ============================================================================

const state = {
  activeTab: 'replays',
  platform: 'ALL',
  selectedMember: '',
  searchQuery: '',
  fullOnly: true,
  members: [],
  replays: [],
  jkcRecents: [],
  nowLive: [],
  recordings: [],
  oshiConfig: {
    autoRecordEnabled: true,
    autoRecordMode: 'oshi',
    oshiList: [],
    hasApiKey: false,
    maskedApiKey: ''
  },
  oshiSearchFilter: '',
  hlsInstance: null,
  currentPlayingLive: null,
  chatVisible: true,
  chatComments: [],
  chatMode: 'none', // 'youtube' | 'live' | 'local'
  chatPollTimer: null
};

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

  // Player & Chat Panel
  playerSection: document.getElementById('playerSection'),
  playerSplitLayout: document.getElementById('playerSplitLayout'),
  playerPlatformBadge: document.getElementById('playerPlatformBadge'),
  playerTitle: document.getElementById('playerTitle'),
  playerPartSelect: document.getElementById('playerPartSelect'),
  playerQualitySelect: document.getElementById('playerQualitySelect'),
  toggleChatPanelBtn: document.getElementById('toggleChatPanelBtn'),
  playerRecordBtn: document.getElementById('playerRecordBtn'),
  playerExternalLink: document.getElementById('playerExternalLink'),
  closePlayerBtn: document.getElementById('closePlayerBtn'),
  ytPlayer: document.getElementById('ytPlayer'),
  hlsPlayer: document.getElementById('hlsPlayer'),
  playerFooterInfo: document.getElementById('playerFooterInfo'),
  chatPanel: document.getElementById('chatPanel'),
  chatPanelTitle: document.getElementById('chatPanelTitle'),
  chatPanelSub: document.getElementById('chatPanelSub'),
  refreshCommentsBtn: document.getElementById('refreshCommentsBtn'),
  chatMessagesList: document.getElementById('chatMessagesList'),

  // Replays Tab
  liveMiniBanner: document.getElementById('liveMiniBanner'),
  memberChipsContainer: document.getElementById('memberChipsContainer'),
  resetMemberBtn: document.getElementById('resetMemberBtn'),
  platformBtns: document.querySelectorAll('.seg-btn'),
  fullOnlyToggle: document.getElementById('fullOnlyToggle'),
  replayResultCounter: document.getElementById('replayResultCounter'),
  replaysGrid: document.getElementById('replaysGrid'),

  // JKT48Connect Tab
  jkcApiKeyInput: document.getElementById('jkcApiKeyInput'),
  saveJkcKeyBtn: document.getElementById('saveJkcKeyBtn'),
  jkcQuotaBanner: document.getElementById('jkcQuotaBanner'),
  jkcRecentGrid: document.getElementById('jkcRecentGrid'),
  recentDetailModal: document.getElementById('recentDetailModal'),
  modalRecentTitle: document.getElementById('modalRecentTitle'),
  modalRecentBody: document.getElementById('modalRecentBody'),
  closeRecentModalBtn: document.getElementById('closeRecentModalBtn'),

  // Live Tab
  refreshLiveBtn: document.getElementById('refreshLiveBtn'),
  liveGrid: document.getElementById('liveGrid'),

  // Recordings & Auto-Record Tab
  recordingsList: document.getElementById('recordingsList'),
  autoRecordToggle: document.getElementById('autoRecordToggle'),
  modeAllRadio: document.getElementById('modeAllRadio'),
  modeOshiRadio: document.getElementById('modeOshiRadio'),
  oshiSelectionSection: document.getElementById('oshiSelectionSection'),
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
  } else if (tabName === 'jkt48connect') {
    loadJkcRecent();
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
// 2. LIVE & REPLAY COMMENTS ENGINE (SYNCHRONIZED WITH PLAYER)
// ============================================================================
function stopChatPolling() {
  if (state.chatPollTimer) {
    clearInterval(state.chatPollTimer);
    state.chatPollTimer = null;
  }
}

els.toggleChatPanelBtn.addEventListener('click', () => {
  state.chatVisible = !state.chatVisible;
  els.playerSplitLayout.classList.toggle('chat-hidden', !state.chatVisible);
});

async function loadCommentsForPlayer(opts) {
  stopChatPolling();
  state.chatComments = [];
  state.chatMode = opts.mode;
  els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px">Memuat komentar...</div>`;

  const fetchOnce = async () => {
    try {
      const params = new URLSearchParams(opts);
      const res = await fetch(`/api/comments?${params.toString()}`);
      const json = await res.json();
      state.chatComments = json.comments || [];
      renderChatMessages(json);
    } catch (err) {
      els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px">Gagal memuat komentar.</div>`;
    }
  };

  await fetchOnce();

  if (opts.mode === 'live') {
    state.chatPollTimer = setInterval(fetchOnce, 4500);
  }

  els.refreshCommentsBtn.onclick = fetchOnce;
}

function renderChatMessages(meta = {}) {
  if (state.chatMode === 'local') {
    els.chatPanelTitle.textContent = '💬 Replay Komentar (Sinkron)';
    els.chatPanelSub.textContent = `${state.chatComments.length} komentar terekam • Klik waktu untuk lompat`;
  } else if (state.chatMode === 'live') {
    els.chatPanelTitle.textContent = '🔴 Live Chat Stream';
    els.chatPanelSub.textContent = meta.needApiKey
      ? 'Isi API Key JKT48Connect untuk chat IDN'
      : `${state.chatComments.length} komentar terbaru (${meta.source || 'live'})`;
  } else {
    els.chatPanelTitle.textContent = '💬 Komentar Penonton';
    els.chatPanelSub.textContent = `${state.chatComments.length} komentar`;
  }

  if (state.chatComments.length === 0) {
    const extraHint = meta.needApiKey
      ? `<br/><br/>💡 Untuk membaca live chat <strong>IDN Live</strong>, masukkan API Key gratis dari <code>api.jkt48connect.app</code> di tab <strong>Rekap JKT48Connect</strong>.`
      : '';
    els.chatMessagesList.innerHTML = `
      <div style="color:var(--text-muted);font-size:12.5px;padding:14px;line-height:1.5">
        Belum ada komentar yang tercatat pada tayangan ini.${extraHint}
      </div>
    `;
    return;
  }

  els.chatMessagesList.innerHTML = state.chatComments
    .map((c, idx) => {
      const hasOffset = typeof c.offsetSeconds === 'number';
      const timeBadge = hasOffset
        ? `<span class="chat-time-tag" data-seek-sec="${c.offsetSeconds}">[${formatSeconds(c.offsetSeconds)}]</span>`
        : c.time && c.time.length < 20
          ? `<span style="color:var(--text-muted);font-size:10.5px;margin-right:5px">${escapeHtml(c.time)}</span>`
          : '';
      const avatarHtml = c.avatar
        ? `<img class="chat-avatar" src="${escapeHtml(c.avatar)}" alt="" loading="lazy" />`
        : `<div class="chat-avatar" style="display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">${escapeHtml((c.user || 'U').slice(0, 1).toUpperCase())}</div>`;

      return `
        <div class="chat-msg" data-chat-idx="${idx}" data-offset="${hasOffset ? c.offsetSeconds : -1}">
          ${avatarHtml}
          <div style="min-width:0;flex:1">
            ${timeBadge}
            <span class="chat-user">${escapeHtml(c.user)}:</span>
            <span class="chat-text">${escapeHtml(c.text)}</span>
          </div>
        </div>
      `;
    })
    .join('');

  els.chatMessagesList.querySelectorAll('[data-seek-sec]').forEach(badge => {
    badge.addEventListener('click', () => {
      const sec = Number(badge.dataset.seekSec);
      if (!els.hlsPlayer.classList.contains('hidden')) {
        els.hlsPlayer.currentTime = sec;
        els.hlsPlayer.play().catch(() => {});
      }
    });
  });

  if (state.chatMode === 'live') {
    els.chatMessagesList.scrollTop = els.chatMessagesList.scrollHeight;
  }
}

// Sinkronisasi highlight komentar saat video DVR lokal diputar
els.hlsPlayer.addEventListener('timeupdate', () => {
  if (state.chatMode !== 'local' || !state.chatComments.length) return;
  const cur = els.hlsPlayer.currentTime;
  const nodes = els.chatMessagesList.querySelectorAll('.chat-msg');
  let lastActiveNode = null;
  nodes.forEach(node => {
    const offset = Number(node.dataset.offset);
    const isCurrent = offset >= 0 && offset <= cur && cur - offset <= 8;
    node.classList.toggle('active-sync', isCurrent);
    if (isCurrent) lastActiveNode = node;
  });
  if (lastActiveNode) {
    lastActiveNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// ============================================================================
// 3. BUILT-IN CINEMA PLAYER (YOUTUBE + HLS LIVE + JKT48CONNECT + LOCAL DVR)
// ============================================================================
function destroyHls() {
  stopChatPolling();
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  els.hlsPlayer.pause();
  els.hlsPlayer.removeAttribute('src');
  els.ytPlayer.src = 'about:blank';
  els.playerPartSelect.classList.add('hidden');
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
  els.playerExternalLink.classList.remove('hidden');

  els.hlsPlayer.classList.add('hidden');
  els.ytPlayer.classList.remove('hidden');
  els.ytPlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0`;

  els.playerFooterInfo.innerHTML = `
    <span>Sumber: <strong>${escapeHtml(video.channel || 'YouTube Archive')}</strong></span>
    <span>Diunggah: <strong>${escapeHtml(video.published || 'Baru saja')}</strong> • Durasi: <strong>${escapeHtml(video.duration || '-')}</strong></span>
  `;

  loadCommentsForPlayer({ mode: 'youtube', videoId: video.videoId });
  els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function playHlsStream({ title, platform, streamUrls, directPlaylistUrl, externalUrl, liveObj, recId }) {
  destroyHls();
  state.currentPlayingLive = liveObj || null;
  els.playerSection.classList.remove('hidden');

  const isIdn = platform === 'IDN';
  els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
  els.playerPlatformBadge.textContent = directPlaylistUrl
    ? `${platform} REPLAY / DVR`
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
    if (state.hlsInstance) {
      state.hlsInstance.destroy();
      state.hlsInstance = null;
    }
    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
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
    els.playerFooterInfo.innerHTML = `<span>Memutar tayangan HLS / DVR</span>`;
  } else if (Array.isArray(streamUrls) && streamUrls.length > 0) {
    if (streamUrls.length > 1) {
      els.playerQualitySelect.classList.remove('hidden');
      els.playerQualitySelect.innerHTML = streamUrls
        .map(
          (s, idx) =>
            `<option value="${idx}">${escapeHtml(s.label || `${s.quality}p`)}</option>`
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
      <span>Stream &amp; Komentar Real-Time Aktif</span>
    `;
  }

  if (recId) {
    loadCommentsForPlayer({ mode: 'local', recId });
  } else if (liveObj) {
    loadCommentsForPlayer({
      mode: 'live',
      platform: liveObj.platform,
      roomId: liveObj.roomId || '',
      dataId: liveObj.dataId || ''
    });
  }

  els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

els.closePlayerBtn.addEventListener('click', () => {
  destroyHls();
  els.playerSection.classList.add('hidden');
});

// ============================================================================
// 4. MEMBERS & AUTO-RECORD CONFIGURATION
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
      els.modeAllRadio.checked = state.oshiConfig.autoRecordMode === 'all';
      els.modeOshiRadio.checked = state.oshiConfig.autoRecordMode !== 'all';
      els.oshiSelectionSection.style.opacity =
        state.oshiConfig.autoRecordMode === 'all' ? '0.45' : '1';
      if (state.oshiConfig.maskedApiKey) {
        els.jkcApiKeyInput.placeholder = `Key Aktif: ${state.oshiConfig.maskedApiKey}`;
      }
      renderMemberChips();
      renderOshiPanel();
    }
  } catch (err) {
    console.error('Gagal memuat konfigurasi Oshi:', err);
  }
}

async function saveOshiConfig(extraPayload = {}) {
  try {
    const payload = {
      autoRecordEnabled: state.oshiConfig.autoRecordEnabled,
      autoRecordMode: state.oshiConfig.autoRecordMode,
      oshiList: state.oshiConfig.oshiList,
      ...extraPayload
    };
    const res = await fetch('/api/oshi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.ok) {
      state.oshiConfig = json.data;
      els.oshiSelectionSection.style.opacity =
        state.oshiConfig.autoRecordMode === 'all' ? '0.45' : '1';
      if (state.oshiConfig.maskedApiKey) {
        els.jkcApiKeyInput.placeholder = `Key Aktif: ${state.oshiConfig.maskedApiKey}`;
      }
      renderMemberChips();
      renderOshiPanel();
      showToast('Pengaturan tersimpan!');
    }
  } catch (err) {
    showToast('Gagal menyimpan pengaturan');
  }
}

function renderOshiPanel() {
  const oshiList = state.oshiConfig.oshiList || [];

  if (oshiList.length === 0) {
    els.oshiSelectedTags.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">Belum ada Oshi spesifik dipilih.</span>`;
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

[els.modeAllRadio, els.modeOshiRadio].forEach(radio => {
  radio.addEventListener('change', () => {
    state.oshiConfig.autoRecordMode = els.modeAllRadio.checked ? 'all' : 'oshi';
    saveOshiConfig();
  });
});

els.oshiFilterInput.addEventListener('input', e => {
  state.oshiSearchFilter = e.target.value;
  renderOshiPanel();
});

// ============================================================================
// 5. JKT48CONNECT API INTEGRATION (RECENT, UNLISTED REPLAY, GIFTS, SCREENSHOTS)
// ============================================================================
els.saveJkcKeyBtn.addEventListener('click', async () => {
  const val = els.jkcApiKeyInput.value.trim();
  await saveOshiConfig({ jkt48ConnectApiKey: val });
  els.jkcApiKeyInput.value = '';
  loadJkcRecent();
});

async function loadJkcRecent() {
  els.jkcRecentGrid.innerHTML = `
    <div class="state-box">
      <h3>Memuat rekap live &amp; replay dari JKT48Connect API...</h3>
      <p>Mengambil data <code>/api/recent</code> beserta link stream replay, gift, dan screenshot.</p>
    </div>
  `;

  try {
    const res = await fetch('/api/jkt48connect/recent?page=1&perpage=16');
    const json = await res.json();

    if (json.needApiKey) {
      els.jkcQuotaBanner.classList.add('hidden');
      els.jkcRecentGrid.innerHTML = `
        <div class="state-box">
          <h3>🔑 Masukkan API Key JKT48Connect Gratis Anda</h3>
          <p style="max-width:620px;margin:8px auto 16px">
            Sesuai dokumentasi <code>https://api.jkt48connect.app/docs</code>, endpoint <code>/api/recent</code>,
            replay unlisted IDN/Showroom, rekap gift/gold, dan live chat IDN menggunakan API Key gratis (format <code>jkc_...</code>, kuota gratis 1.000 request/bulan).
          </p>
          <a href="https://api.jkt48connect.app/dashboard/keys" target="_blank" rel="noopener" class="btn-action">
            Buat API Key Gratis di JKT48Connect ↗
          </a>
        </div>
      `;
      return;
    }

    if (json.quota && json.quota.limit) {
      els.jkcQuotaBanner.classList.remove('hidden');
      els.jkcQuotaBanner.innerHTML = `
        <span>✅ Terhubung ke <strong>api.jkt48connect.app</strong></span>
        <span>Sisa Kuota Bulan Ini: <strong>${escapeHtml(json.quota.remaining)} / ${escapeHtml(json.quota.limit)}</strong> (${escapeHtml(json.quota.period || '')})</span>
      `;
    }

    const recents = Array.isArray(json.data?.recents)
      ? json.data.recents
      : Array.isArray(json.data)
        ? json.data
        : [];
    state.jkcRecents = recents;

    if (recents.length === 0) {
      els.jkcRecentGrid.innerHTML = `
        <div class="state-box">
          <h3>Tidak ada data recent atau API Key tidak valid</h3>
          <p>${escapeHtml(json.data?.message || 'Periksa kembali API Key Anda.')}</p>
        </div>
      `;
      return;
    }

    els.jkcRecentGrid.innerHTML = recents
      .map((item, idx) => {
        const isIdn = (item.type || '').toLowerCase() === 'idn' || Boolean(item.idn);
        const memberName =
          item.member?.name || item.member?.nickname || item.name || 'Member JKT48';
        const thumb =
          item.member?.img_alt ||
          item.member?.img ||
          item.idn?.image ||
          item.img ||
          '';
        const startDate = item.live_info?.date?.start || item.created_at || '';
        const durMs = item.live_info?.duration || 0;
        const durSec = durMs > 10000 ? Math.round(durMs / 1000) : durMs;
        const viewers = item.live_info?.viewers?.num || item.viewers || 0;
        const hasReplay = Boolean(
          item.playback?.stream_url ||
            item.recording?.stream_url ||
            item.youtube_replay?.videos?.length
        );

        return `
          <article class="video-card">
            <div class="thumb-wrap">
              <span class="platform-pill ${isIdn ? 'idn' : 'sr'}">${isIdn ? 'IDN' : 'SHOWROOM'}</span>
              ${hasReplay ? `<span class="age-badge" style="background:#059669">▶ Replay Ready</span>` : ''}
              <img src="${escapeHtml(thumb)}" alt="${escapeHtml(memberName)}" loading="lazy" />
              ${durSec ? `<span class="duration-badge">${formatSeconds(durSec)}</span>` : ''}
            </div>
            <div class="card-body">
              <h3 class="card-title">${escapeHtml(memberName)} ${item.idn?.title ? `— ${escapeHtml(item.idn.title)}` : ''}</h3>
              <div class="card-meta">
                <span>📅 ${startDate ? new Date(startDate).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                <span>👁 ${Number(viewers).toLocaleString('id-ID')}</span>
              </div>
              <div class="card-actions">
                <button class="btn-action" data-jkc-play="${idx}" style="flex:1">▶ Putar Replay</button>
                <button class="btn-action subtle" data-jkc-detail="${idx}">🎁 Gift &amp; Foto</button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    els.jkcRecentGrid.querySelectorAll('[data-jkc-play]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = state.jkcRecents[Number(btn.dataset.jkcPlay)];
        if (item) playJkcRecentReplay(item);
      });
    });

    els.jkcRecentGrid.querySelectorAll('[data-jkc-detail]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = state.jkcRecents[Number(btn.dataset.jkcDetail)];
        if (item) openJkcRecentDetailModal(item);
      });
    });
  } catch (err) {
    els.jkcRecentGrid.innerHTML = `
      <div class="state-box">
        <h3>Gagal memuat dari JKT48Connect</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

async function playJkcRecentReplay(recentItem) {
  const dataId = recentItem.data_id || recentItem._id;
  showToast('Mengambil detail stream replay dari JKT48Connect...');
  try {
    const res = await fetch(`/api/jkt48connect/recent/${encodeURIComponent(dataId)}`);
    const json = await res.json();
    const detail = json.data || recentItem;
    const isIdn = (detail.type || '').toLowerCase() === 'idn' || Boolean(detail.idn);
    const platform = isIdn ? 'IDN' : 'SHOWROOM';
    const memberName = detail.member?.name || detail.member?.nickname || 'Member JKT48';

    // Prioritas 1: playback.stream_url atau recording_session.stream_url atau recording.stream_url (HLS .m3u8)
    const m3u8Stream =
      detail.playback?.stream_url ||
      detail.recording_session?.stream_url ||
      detail.recording?.stream_url ||
      detail.recordings?.[0]?.stream_url;

    // Prioritas 2: youtube_replay.videos[] (termasuk video Unlisted yang belum 72 jam!)
    const ytVideos = detail.youtube_replay?.videos || [];

    if (m3u8Stream) {
      playHlsStream({
        title: `${memberName} — Replay JKT48Connect`,
        platform,
        directPlaylistUrl: m3u8Stream,
        externalUrl: ytVideos[0]?.url || ytVideos[0]?.youtube_url || ''
      });
      if (ytVideos[0]?.youtube_id) {
        loadCommentsForPlayer({ mode: 'youtube', videoId: ytVideos[0].youtube_id });
      }
      return;
    }

    if (ytVideos.length > 0 && ytVideos[0].youtube_id) {
      playYouTubeReplay({
        videoId: ytVideos[0].youtube_id,
        title: ytVideos[0].title || `${memberName} Replay`,
        platform,
        channel: 'JKT48Connect Unlisted Replay',
        published: detail.live_info?.date?.start
          ? new Date(detail.live_info.date.start).toLocaleDateString('id-ID')
          : ''
      });
      return;
    }

    // Fallback: otomatis cari di indeks Replay Instan berdasarkan nama member
    showToast('Stream belum tersedia di detail sesi, mencari di arsip cepat...');
    state.selectedMember = detail.member?.nickname || memberName.split(' ')[0];
    switchTab('replays');
    renderMemberChips();
    loadReplays();
  } catch (err) {
    showToast(`Gagal memutar replay: ${err.message}`);
  }
}

async function openJkcRecentDetailModal(recentItem) {
  const dataId = recentItem.data_id || recentItem._id;
  els.recentDetailModal.classList.remove('hidden');
  els.modalRecentTitle.textContent = `Memuat detail ${dataId}...`;
  els.modalRecentBody.innerHTML = `<p style="color:var(--text-muted)">Mengambil rincian gift, leaderboard, dan screenshot...</p>`;

  try {
    const res = await fetch(`/api/jkt48connect/recent/${encodeURIComponent(dataId)}`);
    const json = await res.json();
    const d = json.data || recentItem;
    const memberName = d.member?.name || d.member?.nickname || 'Member JKT48';
    els.modalRecentTitle.textContent = `Rekap Live: ${memberName} (${d.type?.toUpperCase() || ''})`;

    const gifts = d.live_info?.gift?.list || [];
    const ss = d.live_info?.screenshot;
    const ssUrls = ss?.base_url
      ? (ss.list || []).slice(0, 12).map(t => `${ss.base_url}/${t}.${ss.format || 'jpg'}`)
      : [];
    const lbBanner =
      d.leaderboard_designs?.jkt48connect?.banner?.url ||
      d.leaderboard_designs?.photobook?.banner?.url ||
      '';

    els.modalRecentBody.innerHTML = `
      ${
        lbBanner
          ? `<div>
              <h4 style="margin-bottom:8px">🏆 Kartu Rekap &amp; Leaderboard</h4>
              <img src="${escapeHtml(lbBanner)}" alt="Leaderboard" style="width:100%;border-radius:10px;border:1px solid var(--border)" loading="lazy" />
            </div>`
          : ''
      }
      <div>
        <h4 style="margin-bottom:8px">🎁 Daftar Gift Teramati (${gifts.length})</h4>
        ${
          gifts.length
            ? `<div class="gift-grid">
                ${gifts
                  .slice(0, 18)
                  .map(
                    g => `
                    <div class="gift-item">
                      ${g.img ? `<img src="${escapeHtml(g.img)}" alt="${escapeHtml(g.name)}" loading="lazy" />` : ''}
                      <div>
                        <strong>${escapeHtml(g.name || 'Gift')}</strong>
                        <div style="color:var(--text-muted)">${g.num || 1}x • ${g.point || 0} pts</div>
                      </div>
                    </div>
                  `
                  )
                  .join('')}
              </div>`
            : `<p style="color:var(--text-muted);font-size:13px">Rincian item gift belum tersedia untuk sesi ini.</p>`
        }
      </div>
      <div>
        <h4 style="margin-bottom:8px">📸 Screenshot Momen Live (${ssUrls.length})</h4>
        ${
          ssUrls.length
            ? `<div class="screenshot-strip">
                ${ssUrls.map(u => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="Screenshot" loading="lazy" /></a>`).join('')}
              </div>`
            : `<p style="color:var(--text-muted);font-size:13px">Screenshot tidak tersedia.</p>`
        }
      </div>
    `;
  } catch (err) {
    els.modalRecentBody.innerHTML = `<p style="color:#f87171">Gagal memuat detail: ${escapeHtml(err.message)}</p>`;
  }
}

els.closeRecentModalBtn.addEventListener('click', () => {
  els.recentDetailModal.classList.add('hidden');
});

els.recentDetailModal.addEventListener('click', e => {
  if (e.target === els.recentDetailModal) {
    els.recentDetailModal.classList.add('hidden');
  }
});

// ============================================================================
// 6. REPLAY INSTAN LOADER & RENDERER
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
              <span>💬 Putar + Komentar</span>
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
  showToast('Memperbarui data live, replay & rekaman...');
  loadNowLive(true);
  loadReplays(true);
  loadRecordings();
  if (state.activeTab === 'jkt48connect') loadJkcRecent();
});

// ============================================================================
// 7. SEDANG LIVE MONITOR & TRIGGER RECORD
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
        <p>Anda bisa mengaktifkan <strong>Auto-Record Semua Member</strong> di tab Auto-Record DVR agar otomatis merekam begitu ada member yang live.</p>
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
              <span>💬 Live Chat</span>
            </div>
            <div class="card-actions">
              <button class="btn-action" data-play-live="${idx}" style="flex:1">▶ Tonton + Chat</button>
              <button class="btn-action ${item.isRecording ? 'recording-active' : 'record'}" data-rec-live="${idx}">
                ${item.isRecording ? '● Direkam' : '⏺ Rekam'}
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
    showToast(`Memulai perekaman video + chat ${liveItem.name}...`);
    const res = await fetch('/api/record/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberName: liveItem.name,
        memberKey: liveItem.urlKey || liveItem.name,
        platform: liveItem.platform,
        streamUrl: liveItem.bestStreamUrl,
        avatar: liveItem.avatar || liveItem.img,
        roomId: liveItem.roomId,
        dataId: liveItem.dataId
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
// 8. LOCAL DVR RECORDINGS MANAGER (VIDEO + SYNCHRONIZED CHAT)
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
        <p>Pilih <strong>"Rekam Otomatis SEMUA Member"</strong> di panel kanan agar setiap member yang live otomatis terekam beserta komentarnya tanpa perlu klik manual.</p>
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
                ${escapeHtml(dateStr)} WIB • Durasi: <strong>${formatSeconds(rec.durationSeconds)}</strong> • Ukuran: <strong>${formatBytes(rec.sizeBytes)}</strong> • 💬 <strong>${rec.commentCount || 0} Komentar</strong>
              </div>
            </div>
          </div>

          <div class="rec-actions">
            <button class="btn-action" data-play-rec="${idx}">▶ Putar + Replay Chat</button>
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
          directPlaylistUrl: rec.playlistUrl,
          recId: rec.id
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
// 9. INITIALIZATION & PERIODIC POLLING
// ============================================================================
(async function init() {
  await Promise.all([loadOshiConfig(), loadMembers(), loadNowLive(), loadReplays(), loadRecordings()]);

  setInterval(() => {
    loadNowLive();
    if (state.activeTab === 'recordings' || state.recordings.some(r => r.status === 'recording')) {
      loadRecordings();
    }
  }, 30000);
})();
