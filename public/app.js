// ============================================================================
// JKT48 Replay & DVR Studio — Fast HLS Byte-Range + 60fps Sync Chat + Private Auth
// ============================================================================

const CHAT_WINDOW_SIZE = 180;
const JKC_STORAGE_KEY = 'jkc_client_api_key';
const JKT48CONNECT_CLIENT_BASE = 'https://api.jkt48connect.app';
const JKC_DEFAULT_FALLBACK = '';

const state = {
  authenticated: false,
  currentUser: null,
  apiKey: (function () {
    try {
      return localStorage.getItem(JKC_STORAGE_KEY) || JKC_DEFAULT_FALLBACK;
    } catch {
      return JKC_DEFAULT_FALLBACK;
    }
  })(),
  pollIntervalId: null,

  activeTab: 'replays',
  platform: 'ALL',
  selectedMember: '',
  searchQuery: '',
  page: 1,
  members: [],
  replays: [],
  nowLive: [],
  recordings: [],
  oshiConfig: {
    autoRecordEnabled: true,
    autoRecordMode: 'oshi',
    oshiList: [],
    hasApiKey: false,
    maskedApiKey: '',
    telegramEnabled: true,
    telegramMode: 'all',
    telegramChatId: '',
    hasTelegramToken: false,
    maskedTelegramToken: '',
    publicAppUrl: '',
    isServerless: false
  },
  oshiSearchFilter: '',

  // Player state
  hlsInstance: null,
  currentPlayingLive: null,
  currentPlayingReplay: null,
  currentPartIdx: 0,
  currentPartBaseOffsetSec: 0,
  playerEngine: 'hls',
  mediaSourceAbort: null,
  mediaSourceObjectUrl: null,

  // High-performance Sync Chat state
  chatVisible: true,
  activeSideTab: 'comments',
  chatComments: [],
  chatHasOffsets: false,
  chatSourceLabel: 'JKT48Connect',
  chatWindowStart: 0,
  chatWindowEnd: 0,
  chatDomMap: new Map(),
  activeChatIndices: [],
  lastSyncedIdx: -2,
  lastTimeUpdateMs: 0,
  userScrollPausedUntil: 0,
  chatMode: 'session',
  chatPollTimer: null
};

const els = {
  // Auth Gate
  loginOverlay: document.getElementById('loginOverlay'),
  loginForm: document.getElementById('loginForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  togglePwBtn: document.getElementById('togglePwBtn'),
  loginErrorMsg: document.getElementById('loginErrorMsg'),
  loginSubmitBtn: document.getElementById('loginSubmitBtn'),
  appShell: document.getElementById('appShell'),
  authUserBadge: document.getElementById('authUserBadge'),
  logoutBtn: document.getElementById('logoutBtn'),

  // Topbar & Navigation
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  brandHome: document.getElementById('brandHome'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  liveCountBadge: document.getElementById('liveCountBadge'),
  recCountBadge: document.getElementById('recCountBadge'),

  // Player & Side Panel
  playerSection: document.getElementById('playerSection'),
  playerSplitLayout: document.getElementById('playerSplitLayout'),
  playerPlatformBadge: document.getElementById('playerPlatformBadge'),
  playerTitle: document.getElementById('playerTitle'),
  playerPartSelect: document.getElementById('playerPartSelect'),
  playerQualitySelect: document.getElementById('playerQualitySelect'),
  switchPlayerEngineBtn: document.getElementById('switchPlayerEngineBtn'),
  toggleChatPanelBtn: document.getElementById('toggleChatPanelBtn'),
  playerRecordBtn: document.getElementById('playerRecordBtn'),
  playerDownloadMp4Btn: document.getElementById('playerDownloadMp4Btn'),
  closePlayerBtn: document.getElementById('closePlayerBtn'),
  videoLoadingBadge: document.getElementById('videoLoadingBadge'),
  ytPlayer: document.getElementById('ytPlayer'),
  hlsPlayer: document.getElementById('hlsPlayer'),
  playerFooterInfo: document.getElementById('playerFooterInfo'),
  playerPartsBar: document.getElementById('playerPartsBar'),
  toggleGiftsBtn: document.getElementById('toggleGiftsBtn'),
  toggleScreenshotsBtn: document.getElementById('toggleScreenshotsBtn'),

  downloadModal: document.getElementById('downloadModal'),
  dlModalTitle: document.getElementById('dlModalTitle'),
  dlModalSubtitle: document.getElementById('dlModalSubtitle'),
  dlModalBody: document.getElementById('dlModalBody'),
  closeDlModalBtn: document.getElementById('closeDlModalBtn'),

  sideSubtabs: document.querySelectorAll('.side-subtab'),
  sidePanelComments: document.getElementById('sidePanel-comments'),
  sidePanelGifts: document.getElementById('sidePanel-gifts'),
  sidePanelScreenshots: document.getElementById('sidePanel-screenshots'),
  chatPanelSub: document.getElementById('chatPanelSub'),
  chatResumeSyncBtn: document.getElementById('chatResumeSyncBtn'),
  refreshCommentsBtn: document.getElementById('refreshCommentsBtn'),
  chatMessagesList: document.getElementById('chatMessagesList'),
  sideGiftsContent: document.getElementById('sideGiftsContent'),
  sideScreenshotsContent: document.getElementById('sideScreenshotsContent'),

  // Ala jkt48.preset.id elements
  videoPlayOverlay: document.getElementById('videoPlayOverlay'),
  bigPlayBtn: document.getElementById('bigPlayBtn'),
  playerPrefBtn: document.getElementById('playerPrefBtn'),
  playerPrefLabel: document.getElementById('playerPrefLabel'),
  toolbarTabChatBtn: document.getElementById('toolbarTabChatBtn'),
  toolbarTabGiftBtn: document.getElementById('toolbarTabGiftBtn'),
  toolbarDownloadBtn: document.getElementById('toolbarDownloadBtn'),
  toolbarTheaterBtn: document.getElementById('toolbarTheaterBtn'),
  theaterBtnLabel: document.getElementById('theaterBtnLabel'),

  tabDockChatBtn: document.getElementById('tabDockChatBtn'),
  tabDockGiftBtn: document.getElementById('tabDockGiftBtn'),
  tabDockScreenshotBtn: document.getElementById('tabDockScreenshotBtn'),
  dockPanelChat: document.getElementById('dockPanelChat'),
  dockPanelGift: document.getElementById('dockPanelGift'),
  dockPanelScreenshot: document.getElementById('dockPanelScreenshot'),
  chatSearchInput: document.getElementById('chatSearchInput'),

  // Unified Controls & Video Hosts (Ala jkt48.preset.id)
  videoWrapper: document.getElementById('videoWrapper'),
  skipOverlayLeft: document.getElementById('skipOverlayLeft'),
  skipOverlayRight: document.getElementById('skipOverlayRight'),
  playerCustomControls: document.getElementById('playerCustomControls'),
  btnCtrlPlayPause: document.getElementById('btnCtrlPlayPause'),
  btnCtrlSkipBack: document.getElementById('btnCtrlSkipBack'),
  btnCtrlSkipForward: document.getElementById('btnCtrlSkipForward'),
  ctrlCurrentTime: document.getElementById('ctrlCurrentTime'),
  ctrlTotalDuration: document.getElementById('ctrlTotalDuration'),
  ctrlSeekSlider: document.getElementById('ctrlSeekSlider'),
  btnCtrlSpeed: document.getElementById('btnCtrlSpeed'),
  btnCtrlFullscreen: document.getElementById('btnCtrlFullscreen'),

  // Replays Tab
  liveMiniBanner: document.getElementById('liveMiniBanner'),
  memberChipsContainer: document.getElementById('memberChipsContainer'),
  resetMemberBtn: document.getElementById('resetMemberBtn'),
  platformBtns: document.querySelectorAll('.seg-btn'),
  jkcQuotaBadge: document.getElementById('jkcQuotaBadge'),
  replayResultCounter: document.getElementById('replayResultCounter'),
  replaysGrid: document.getElementById('replaysGrid'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),

  // Live Tab
  refreshLiveBtn: document.getElementById('refreshLiveBtn'),
  liveGrid: document.getElementById('liveGrid'),

  // Telegram, Recordings & Settings Tab
  telegramToggle: document.getElementById('telegramToggle'),
  tgBotTokenInput: document.getElementById('tgBotTokenInput'),
  tgChatIdInput: document.getElementById('tgChatIdInput'),
  tgDetectChatBtn: document.getElementById('tgDetectChatBtn'),
  tgModeSelect: document.getElementById('tgModeSelect'),
  saveTgBtn: document.getElementById('saveTgBtn'),
  testTgBtn: document.getElementById('testTgBtn'),
  webhookTgBtn: document.getElementById('webhookTgBtn'),

  recordingsList: document.getElementById('recordingsList'),
  jkcApiKeyInput: document.getElementById('jkcApiKeyInput'),
  saveJkcKeyBtn: document.getElementById('saveJkcKeyBtn'),
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

function formatRelativeIndo(isoStr) {
  if (!isoStr) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - Date.parse(isoStr)) / 1000));
  if (diffSec < 60) return 'Baru saja';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  return `${Math.floor(diffSec / 86400)} hari lalu`;
}

function isLocalhostEnv() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.');
}

// ============================================================================
// 0. CLIENT FORMATTERS & DIRECT JKT48CONNECT FALLBACK
// ============================================================================
function normalizeMediaUrlClient(url) {
  if (!url) return '';
  return String(url).replace('https://api.jkt48connect.app:8443/', 'https://api.jkt48connect.app/');
}

function formatRecentItemClient(item) {
  const isIdn = (item.type || '').toLowerCase() === 'idn' || Boolean(item.idn);
  const memberName = item.member?.name || item.room_info?.name || 'Member JKT48';
  const nickname =
    item.member?.nickname || item.room_info?.nickname || memberName.split(' ')[0];
  const avatar = normalizeMediaUrlClient(
    item.member?.img_alt || item.member?.img || item.room_info?.img_alt || ''
  );
  const thumb = normalizeMediaUrlClient(
    item.idn?.image || item.member?.img_alt || item.member?.img || ''
  );
  const liveTitle = item.idn?.title || `Live ${nickname} JKT48`;
  const startDate = item.live_info?.date?.start || item.created_at || '';
  const endDate = item.live_info?.date?.end || item.created_at || '';
  const durMs = item.live_info?.duration || 0;
  const durationSeconds = durMs > 10000 ? Math.round(durMs / 1000) : durMs;
  const viewers = item.live_info?.viewers?.num || item.viewers || 0;
  const points = item.points || item.total_gifts || 0;
  const pointUnit = item.point_unit || (isIdn ? 'idn_gold' : 'showroom_points');

  const streamUrl = normalizeMediaUrlClient(
    item.playback?.stream_url || item.recording?.stream_url || ''
  );
  const ytVideos = item.youtube_replay?.videos || [];
  const playbackStatus = item.playback?.status || (streamUrl ? 'ready' : 'pending');
  const parts = item.playback?.parts ?? (streamUrl ? 1 : 0);

  return {
    dataId: item.data_id || item._id,
    roomId: item.room_id,
    platform: isIdn ? 'IDN' : 'SHOWROOM',
    memberName,
    nickname,
    avatar,
    thumb,
    title: `${nickname} JKT48 — ${liveTitle}`,
    liveTitle,
    startedAt: startDate,
    endedAt: endDate,
    durationSeconds,
    viewers,
    points,
    pointUnit,
    playbackStatus,
    parts,
    streamUrl,
    youtubeId: item.playback?.youtube_id || ytVideos[0]?.youtube_id || null,
    youtubeUrl: item.playback?.youtube_url || ytVideos[0]?.url || null,
    leaderboardBanner: normalizeMediaUrlClient(
      item.leaderboard_designs?.jkt48connect?.banner?.url ||
        item.leaderboard_designs?.photobook?.banner?.url ||
        ''
    )
  };
}

function formatReplayDetailClient(d) {
  const base = formatRecentItemClient({
    ...d,
    member: d.member || d.room_info
  });

  const recordings = (d.recordings || []).map((r, idx) => ({
    part: idx + 1,
    run: r.run,
    mp4Url: normalizeMediaUrlClient(r.url),
    streamUrl: normalizeMediaUrlClient(r.stream_url),
    playerUrl: normalizeMediaUrlClient(r.player_url),
    durationSeconds: r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
    sizeBytes: r.bytes || 0,
    startedAt: r.started_at,
    partial: r.partial
  }));

  const combinedStreamUrl = normalizeMediaUrlClient(
    d.playback?.stream_url ||
      d.recording_session?.stream_url ||
      d.recording?.stream_url ||
      recordings[0]?.streamUrl ||
      ''
  );

  let giftItems = [];
  if (Array.isArray(d.live_info?.gift?.list) && d.live_info.gift.list.length > 0) {
    giftItems = d.live_info.gift.list.map(g => ({
      id: g.id || g.name,
      name: g.name || 'Gift',
      img: normalizeMediaUrlClient(g.img || ''),
      num: g.num || 1,
      point: g.point || 0
    }));
  } else if (Array.isArray(d.live_info?.gift?.log)) {
    const giftMap = new Map();
    for (const entry of d.live_info.gift.log) {
      for (const g of entry.gifts || []) {
        const key = g.id || g.name;
        if (!giftMap.has(key)) {
          giftMap.set(key, {
            id: key,
            name: g.name || 'Gift',
            img: normalizeMediaUrlClient(g.img || ''),
            num: 0,
            point: g.point || 0
          });
        }
        const cur = giftMap.get(key);
        cur.num += g.num || 1;
      }
    }
    giftItems = Array.from(giftMap.values()).sort((a, b) => b.point * b.num - a.point * a.num);
  }

  const fans = (d.fans || []).map(f => ({
    rank: f.rank || 0,
    name: f.name || 'Fan',
    avatar: normalizeMediaUrlClient(f.avatar || f.img || ''),
    title: f.title || '',
    fansPoint: f.fans_point || f.points || 0
  }));

  const ss = d.screenshots;
  const screenshots = ss?.base_url
    ? (ss.list || []).map(t => normalizeMediaUrlClient(`${ss.base_url}/${t}.${ss.format || 'jpg'}`))
    : [];

  return {
    ...base,
    combinedStreamUrl,
    recordings,
    youtubeVideos: d.youtube_replay?.videos || [],
    fans,
    goldSummary: d.gold_summary || null,
    giftItems,
    screenshots,
    leaderboards: {
      jkt48connectBanner: normalizeMediaUrlClient(d.leaderboard_designs?.jkt48connect?.banner?.url),
      jkt48connectPortrait: normalizeMediaUrlClient(d.leaderboard_designs?.jkt48connect?.portrait?.url),
      photobookBanner: normalizeMediaUrlClient(d.leaderboard_designs?.photobook?.banner?.url),
      avoneraBanner: normalizeMediaUrlClient(d.leaderboard_designs?.avonera48?.portrait?.url)
    }
  };
}

async function fetchJkcDirect(endpointPath, params = {}) {
  const url = new URL(endpointPath, JKT48CONNECT_CLIENT_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }
  const key = state.apiKey || JKC_DEFAULT_FALLBACK;
  if (key) {
    url.searchParams.set('apikey', key);
    url.searchParams.set('api_key', key);
  }
  
  let res = null;
  try {
    // Try clean simple CORS GET first (no custom headers = no preflight blockage)
    res = await fetch(url.toString());
  } catch (err) {
    // If strict environment requires header, retry with x-api-key
    res = await fetch(url.toString(), {
      headers: key ? { 'x-api-key': key } : {}
    });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`JKT48Connect HTTP ${res.status}: ${txt.slice(0, 100) || res.statusText}`);
  }
  const quotaRemaining = res.headers.get('x-ratelimit-remaining');
  const quotaLimit = res.headers.get('x-ratelimit-limit');
  if (quotaRemaining && quotaLimit && els.jkcQuotaBadge) {
    els.jkcQuotaBadge.textContent = `Kuota API: ${quotaRemaining}/${quotaLimit}`;
  }
  return res.json();
}

// ============================================================================
// 0. AUTHENTICATED FETCH WRAPPER & LOGIN GATE
// ============================================================================
function showLoginGate(message = '') {
  state.authenticated = false;
  state.currentUser = null;
  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId);
    state.pollIntervalId = null;
  }
  destroyHls();
  els.playerSection.classList.add('hidden');
  els.appShell.classList.add('hidden');
  els.loginOverlay.classList.remove('hidden');
  if (message) {
    els.loginErrorMsg.innerHTML = escapeHtml(message);
    els.loginErrorMsg.classList.remove('hidden');
  } else {
    els.loginErrorMsg.classList.add('hidden');
  }
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    if (!state.authenticated && !state.apiKey) {
      showLoginGate('Sesi berakhir. Silakan login kembali.');
    }
    throw new Error('Akses terbatas. Silakan login.');
  }
  return res;
}

els.togglePwBtn.addEventListener('click', () => {
  const isPw = els.loginPassword.type === 'password';
  els.loginPassword.type = isPw ? 'text' : 'password';
});

const quickFillAcc1Btn = document.getElementById('quickFillAcc1Btn');
const quickFillAcc2Btn = document.getElementById('quickFillAcc2Btn');
const bypassToDirectBtn = document.getElementById('bypassToDirectBtn');

if (quickFillAcc1Btn) {
  quickFillAcc1Btn.addEventListener('click', () => {
    els.loginUsername.value = 'escha';
    els.loginPassword.focus();
    showToast('Username escha telah diisi. Silakan masukkan password Anda.');
  });
}

if (quickFillAcc2Btn) {
  quickFillAcc2Btn.addEventListener('click', () => {
    els.loginUsername.value = 'oshi48';
    els.loginPassword.focus();
    showToast('Username oshi48 telah diisi. Silakan masukkan password Anda.');
  });
}

if (bypassToDirectBtn) {
  bypassToDirectBtn.addEventListener('click', async () => {
    let key = state.apiKey;
    if (!key) {
      const entered = prompt('Masukkan JKT48Connect API Key Anda (atau tekan OK jika ingin mencoba langsung):', '');
      if (entered && entered.trim()) {
        key = entered.trim();
        state.apiKey = key;
        try { localStorage.setItem(JKC_STORAGE_KEY, key); } catch {}
      }
    }
    await onAuthenticated('Tamu');
    showToast('Masuk ke Studio dalam Mode Direct JKT48Connect ⚡');
  });
}

els.loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  els.loginErrorMsg.classList.add('hidden');
  els.loginSubmitBtn.disabled = true;
  els.loginSubmitBtn.textContent = 'Memverifikasi...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: els.loginUsername.value.trim(),
        password: els.loginPassword.value
      })
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Netlify Edge Access returned HTML
      els.loginErrorMsg.innerHTML = `
        <div>⚠️ Project Netlify terdeteksi dalam mode <strong>Private</strong>.</div>
        <div style="margin-top:4px;font-size:11.5px">Ubah Project Visibility menjadi <strong>Public</strong> di Dashboard Netlify, atau klik <strong>⚡ Langsung Buka Studio</strong> di bawah untuk langsung menggunakan Mode Direct.</div>
      `;
      els.loginErrorMsg.classList.remove('hidden');
      return;
    }

    if (!res.ok || !json.ok) {
      els.loginErrorMsg.textContent = json.error || 'Gagal login.';
      els.loginErrorMsg.classList.remove('hidden');
      return;
    }
    if (json.apiKey) {
      state.apiKey = json.apiKey;
      try { localStorage.setItem(JKC_STORAGE_KEY, json.apiKey); } catch {}
    }
    els.loginPassword.value = '';
    await onAuthenticated(json.user.username);
  } catch (err) {
    els.loginErrorMsg.textContent = `Gagal terhubung ke server: ${err.message}`;
    els.loginErrorMsg.classList.remove('hidden');
  } finally {
    els.loginSubmitBtn.disabled = false;
    els.loginSubmitBtn.textContent = 'Masuk ke Studio →';
  }
});

els.logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {}
  showLoginGate();
  showToast('Anda telah keluar.');
});

async function onAuthenticated(username) {
  state.authenticated = true;
  state.currentUser = username;
  els.authUserBadge.textContent = `👤 ${username}`;
  els.loginOverlay.classList.add('hidden');
  els.appShell.classList.remove('hidden');

  if (window.location.protocol === 'https:') {
    els.webhookTgBtn.classList.remove('hidden');
  }

  await Promise.all([
    loadOshiConfig().catch(() => {}),
    loadMembers().catch(() => {}),
    loadNowLive().catch(() => {}),
    loadReplays().catch(() => {}),
    loadRecordings().catch(() => {})
  ]);

  if (state.pollIntervalId) clearInterval(state.pollIntervalId);
  state.pollIntervalId = setInterval(() => {
    if (!state.authenticated) return;
    loadNowLive().catch(() => {});
    if (state.activeTab === 'recordings' || state.recordings.some(r => r.status === 'recording')) {
      loadRecordings().catch(() => {});
    }
  }, 30000);
}

// ============================================================================
// 1. DOWNLOAD MODAL & REPLAY DETAIL HELPER
// ============================================================================
async function getReplayDetail(dataId) {
  try {
    const res = await apiFetch(`/api/replays/${encodeURIComponent(dataId)}`);
    const json = await res.json();
    if (json.ok && json.data) {
      return json.data;
    }
  } catch (err) {
    console.warn('Gagal memuat detail replay via server:', err.message);
  }

  // Direct fallback ke JKT48Connect
  const d = await fetchJkcDirect(`/api/recent/${encodeURIComponent(dataId)}`);
  return formatReplayDetailClient(d);
}

function closeDownloadModal() {
  els.downloadModal.classList.add('hidden');
}

els.closeDlModalBtn.addEventListener('click', closeDownloadModal);
els.downloadModal.addEventListener('click', e => {
  if (e.target === els.downloadModal) closeDownloadModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !els.downloadModal.classList.contains('hidden')) {
    closeDownloadModal();
  }
});

async function openDownloadModal(item) {
  els.downloadModal.classList.remove('hidden');
  els.dlModalTitle.textContent = `⬇ Download: ${item.nickname || item.memberName}`;
  els.dlModalSubtitle.textContent = item.title || 'Memuat link rekaman...';
  els.dlModalBody.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:16px;text-align:center">Menyiapkan file rekaman...</div>`;

  try {
    const d = item.recordings ? item : await getReplayDetail(item.dataId);
    const recs = (d.recordings || []).filter(r => r.mp4Url);
    if (recs.length === 0) {
      els.dlModalBody.innerHTML = `
        <div style="color:var(--text-muted);font-size:13px;padding:16px;text-align:center">
          Rekaman MP4 belum tersedia untuk sesi ini (masih dalam pemrosesan server R2).
        </div>
      `;
      return;
    }

    const isLocal = isLocalhostEnv() && !state.oshiConfig.isServerless;
    els.dlModalBody.innerHTML = `
      <div style="font-size:12.5px;color:var(--text-muted);line-height:1.5">
        ${
          isLocal
            ? 'Klik tombol di bawah untuk langsung mengunduh file MP4 ke folder Downloads perangkat Anda:'
            : 'Pilih opsi unduhan dari server R2 JKT48Connect:'
        }
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        ${recs
          .map(r => {
            const directUrl = r.mp4Url + (r.mp4Url.includes('?') ? '&' : '?') + 'v=2';
            const localUrl = `/api/download-mp4?url=${encodeURIComponent(r.mp4Url)}&name=${encodeURIComponent(`${(d.nickname || 'JKT48').replace(/[^a-zA-Z0-9_-]/g, '_')}_Part${r.part}`)}`;
            const playerUrl =
              r.playerUrl || (r.run ? `https://api.jkt48connect.app/replay/${d.dataId}/${r.run}` : '');
            const sizeStr = r.sizeBytes ? formatBytes(r.sizeBytes) : '';
            const durStr = r.durationSeconds ? formatSeconds(r.durationSeconds) : '';

            return `
            <div class="dl-part-card">
              <div class="dl-part-header">
                <div>
                  <strong>Bagian ${r.part}</strong>
                  <span style="color:var(--text-muted);font-size:11.5px;margin-left:6px">${durStr} ${sizeStr ? '• ' + sizeStr : ''}</span>
                </div>
              </div>
              <div class="dl-btn-row">
                ${
                  isLocal
                    ? `
                  <a class="btn-action" href="${escapeHtml(localUrl)}" style="flex:1;text-align:center;text-decoration:none">
                    ⬇ Download Langsung (.mp4)
                  </a>
                `
                    : `
                  ${
                    playerUrl
                      ? `
                    <a class="btn-action" href="${escapeHtml(playerUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none">
                      ⬇ Halaman Unduh Resmi (Rekomendasi)
                    </a>
                  `
                      : ''
                  }
                  <a class="btn-action subtle" href="${escapeHtml(directUrl)}" target="_blank" rel="noopener" style="text-decoration:none">
                    ↗ File MP4 Langsung
                  </a>
                `
                }
              </div>
              ${
                !isLocal
                  ? `
                <div style="font-size:11px;color:var(--text-muted)">
                  💡 <em>Di Halaman Unduh Resmi, klik tombol <strong>"Unduh MP4"</strong> agar langsung tersimpan ke perangkat.</em>
                </div>
              `
                  : ''
              }
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  } catch (err) {
    els.dlModalBody.innerHTML = `<div style="color:var(--accent);font-size:13px;padding:16px">Gagal memuat link download: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================================
// 2. TAB & SIDE-PANEL NAVIGATION
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

function switchSideTab(subName) {
  state.activeSideTab = subName;
  els.sideSubtabs.forEach(b => b.classList.toggle('active', b.dataset.sidetab === subName));
  els.sidePanelComments.classList.toggle('hidden', subName !== 'comments');
  els.sidePanelGifts.classList.toggle('hidden', subName !== 'gifts');
  els.sidePanelScreenshots.classList.toggle('hidden', subName !== 'screenshots');
}

els.sideSubtabs.forEach(btn => {
  btn.addEventListener('click', () => switchSideTab(btn.dataset.sidetab));
});

els.brandHome.addEventListener('click', () => {
  state.selectedMember = '';
  state.searchQuery = '';
  state.page = 1;
  els.searchInput.value = '';
  els.clearSearchBtn.classList.add('hidden');
  switchTab('replays');
  renderMemberChips();
  loadReplays();
});

// ============================================================================
// 3. 60-FPS WINDOWED SYNC CHAT + LIVE CHAT PANEL
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

if (els.toggleGiftsBtn) {
  els.toggleGiftsBtn.addEventListener('click', () => {
    const isHidden = els.sidePanelGifts.classList.contains('hidden');
    els.sidePanelGifts.classList.toggle('hidden', !isHidden);
    els.sidePanelScreenshots.classList.add('hidden');
    els.toggleGiftsBtn.classList.toggle('active', isHidden);
    if (els.toggleScreenshotsBtn) els.toggleScreenshotsBtn.classList.remove('active');
  });
}

if (els.toggleScreenshotsBtn) {
  els.toggleScreenshotsBtn.addEventListener('click', () => {
    const isHidden = els.sidePanelScreenshots.classList.contains('hidden');
    els.sidePanelScreenshots.classList.toggle('hidden', !isHidden);
    els.sidePanelGifts.classList.add('hidden');
    els.toggleScreenshotsBtn.classList.toggle('active', isHidden);
    if (els.toggleGiftsBtn) els.toggleGiftsBtn.classList.remove('active');
  });
}

let lastHighlightedIdx = -1;
let userScrolledChat = false;

// When user scrolls, remember and show auto-sync button
['wheel', 'touchmove'].forEach(evName => {
  els.chatMessagesList.addEventListener(
    evName,
    () => {
      userScrolledChat = true;
      els.chatResumeSyncBtn.classList.remove('hidden');
    },
    { passive: true }
  );
});

els.chatResumeSyncBtn.addEventListener('click', () => {
  userScrolledChat = false;
  els.chatResumeSyncBtn.classList.add('hidden');
  syncChatToVideoTime(true);
});

// Single delegated click listener for timestamp seeking
els.chatMessagesList.addEventListener('click', e => {
  const seekBadge = e.target.closest('[data-seek-sec]');
  if (seekBadge) {
    const targetSessionSec = Number(seekBadge.dataset.seekSec);
    if (!Number.isNaN(targetSessionSec)) {
      const localSec = Math.max(0, targetSessionSec - state.currentPartBaseOffsetSec);
      userScrolledChat = false;
      els.chatResumeSyncBtn.classList.add('hidden');
      playerSeekTo(localSec);
    }
  }
});

function buildSingleChatHtml(c, idx) {
  const hasOffset = typeof c.offsetSeconds === 'number' && c.offsetSeconds >= 0;
  const timeBadge = hasOffset
    ? `<span class="chat-time-tag" data-seek-sec="${c.offsetSeconds}">[${formatSeconds(c.offsetSeconds)}]</span>`
    : c.time
      ? `<span style="color:var(--text-muted);font-size:10px;margin-right:5px">${escapeHtml(new Date(c.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</span>`
      : '';
  const initial = escapeHtml((c.user || 'U').slice(0, 1).toUpperCase());
  const avatarHtml = c.avatar
    ? `<img class="chat-avatar" src="${escapeHtml(c.avatar)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="chat-avatar" style="display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">${initial}</div>`;

  return `<div class="chat-msg" id="cmsg-${idx}" data-chat-idx="${idx}">${avatarHtml}<div style="min-width:0;flex:1">${timeBadge}<span class="chat-user">${escapeHtml(c.user)}:</span><span class="chat-text">${escapeHtml(c.text)}</span></div></div>`;
}

// O(log N) binary search for latest comment with offsetSeconds <= sec
function findLastCommentAt(sec) {
  const arr = state.chatComments;
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const off = arr[mid].offsetSeconds ?? -1;
    if (off <= sec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function syncChatToVideoTime(force = false) {
  if (!state.chatHasOffsets || !state.chatComments.length) {
    return;
  }
  const now = performance.now();
  if (!force && now - state.lastTimeUpdateMs < 250) return;
  state.lastTimeUpdateMs = now;

  const p = getActivePlayerAdapter();
  const vidDuration = p.getDuration() || 0;
  const vidCurrentTime = p.getCurrentTime() || 0;
  const sessionSec = vidCurrentTime + state.currentPartBaseOffsetSec;

  const firstOff = state.chatComments[0]?.offsetSeconds ?? 0;
  let lastIdx = -1;

  // Cek apakah timestamp komentar berada dalam jangkauan durasi video
  if (firstOff <= (vidDuration > 0 ? vidDuration + 45 : 600)) {
    // Sinkronisasi eksak berbasis detik video
    lastIdx = findLastCommentAt(sessionSec);
  } else if (vidDuration > 0) {
    // Sinkronisasi adaptif jika komentar berasal dari ekor live sementara video di cloud terpotong
    const progress = Math.min(1, Math.max(0, vidCurrentTime / vidDuration));
    lastIdx = Math.min(state.chatComments.length - 1, Math.floor(progress * state.chatComments.length));
  } else {
    lastIdx = findLastCommentAt(sessionSec);
  }

  if (lastIdx < 0) return;
  if (lastIdx === lastHighlightedIdx && !force) return;

  if (lastHighlightedIdx >= 0) {
    const prevEl = document.getElementById(`cmsg-${lastHighlightedIdx}`);
    if (prevEl) prevEl.classList.remove('active-sync');
  }

  lastHighlightedIdx = lastIdx;
  const curEl = document.getElementById(`cmsg-${lastIdx}`);
  if (curEl) {
    curEl.classList.add('active-sync');
    if (!userScrolledChat) {
      curEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

async function loadCommentsForPlayer(opts) {
  stopChatPolling();
  state.chatComments = [];
  lastHighlightedIdx = -1;
  userScrolledChat = false;
  els.chatResumeSyncBtn.classList.add('hidden');
  state.chatMode = opts.mode || 'session';
  els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px">Memuat riwayat chat...</div>`;

  const fetchOnce = async () => {
    let rawComments = null;

    // 1. Coba dari server
    try {
      const params = new URLSearchParams(opts);
      const res = await apiFetch(`/api/comments?${params.toString()}`);
      const json = await res.json();
      if (json && Array.isArray(json.comments)) {
        rawComments = json.comments;
        state.chatSourceLabel = json.source || 'JKT48Connect';
      }
    } catch {}

    // 2. Direct fallback untuk IDN
    if (!rawComments && opts.platform === 'IDN' && opts.dataId) {
      try {
        const directRes = await fetchJkcDirect(`/api/idn-comments/${encodeURIComponent(opts.dataId)}`, {
          after: opts.after || ''
        });
        const comments = Array.isArray(directRes?.comments) ? directRes.comments : [];
        const startMs = opts.startedAt ? Date.parse(opts.startedAt) : 0;
        const firstStr = comments[0]?.source_time || comments[0]?.observed_at || '';
        const baseMs = startMs || (firstStr ? Date.parse(firstStr) : 0);
        rawComments = comments.map(c => {
          const tStr = c.source_time || c.observed_at || '';
          const tMs = tStr ? Date.parse(tStr) : 0;
          const offsetSeconds =
            baseMs > 0 && tMs >= baseMs ? Math.round((tMs - baseMs) / 1000) : undefined;
          return {
            id: c._id || `${tMs}_${c.user?.name}`,
            user: c.user?.name || 'Anon',
            avatar: normalizeMediaUrlClient(c.user?.avatar_url || ''),
            text: c.comment || '',
            time: tStr,
            offsetSeconds
          };
        });
        state.chatSourceLabel = 'JKT48Connect Direct';
      } catch (err) {
        console.warn('Direct comments fallback error:', err);
      }
    }

    if (!rawComments) {
      els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px">Riwayat komentar tidak tersedia untuk sesi ini.</div>`;
      return;
    }

    const withOffsets = rawComments.some(c => typeof c.offsetSeconds === 'number');
    state.chatHasOffsets = withOffsets && !opts.isLive;
    if (state.chatHasOffsets) {
      rawComments.sort((a, b) => (a.offsetSeconds ?? 0) - (b.offsetSeconds ?? 0));
    }

    state.chatComments = rawComments;
    els.chatPanelSub.textContent = `${rawComments.length.toLocaleString('id-ID')} komentar (${state.chatSourceLabel})`;

    if (rawComments.length === 0) {
      els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:14px;line-height:1.5">Belum ada riwayat chat untuk sesi ini.</div>`;
      return;
    }

    // Render semua chat ke kotak tersendiri (menggunakan native CSS content-visibility agar 60fps ringan)
    els.chatMessagesList.innerHTML = rawComments.map((c, i) => buildSingleChatHtml(c, i)).join('');

    if (opts.isLive) {
      els.chatMessagesList.scrollTop = els.chatMessagesList.scrollHeight;
    } else {
      syncChatToVideoTime(true);
    }
  };

  await fetchOnce();

  if (opts.isLive) {
    state.chatPollTimer = setInterval(fetchOnce, 4500);
  }

  els.refreshCommentsBtn.onclick = fetchOnce;
}

els.hlsPlayer.addEventListener('timeupdate', () => {
  updateControlsTime(els.hlsPlayer.currentTime, els.hlsPlayer.duration);
  syncChatToVideoTime(false);
});
els.hlsPlayer.addEventListener('seeked', () => {
  updateControlsTime(els.hlsPlayer.currentTime, els.hlsPlayer.duration);
  syncChatToVideoTime(true);
});
els.hlsPlayer.addEventListener('play', () => {
  if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '⏸';
});
els.hlsPlayer.addEventListener('pause', () => {
  if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '▶';
});

// ============================================================================
// 4. ULTRA-FAST CINEMA PLAYER (HLS VOD BYTE-RANGE + RANGE MP4 + FALLBACK)
// ============================================================================
function setVideoLoading(msg) {
  if (!msg) {
    els.videoLoadingBadge.classList.add('hidden');
  } else {
    els.videoLoadingBadge.textContent = msg;
    els.videoLoadingBadge.classList.remove('hidden');
  }
}

els.hlsPlayer.addEventListener('playing', () => setVideoLoading(''));
els.hlsPlayer.addEventListener('canplay', () => setVideoLoading(''));
els.hlsPlayer.addEventListener('waiting', () => setVideoLoading('Menyambung buffer stream...'));

function destroyHls() {
  stopChatPolling();
  setVideoLoading('');
  if (els.vidstackHost) {
    els.vidstackHost.innerHTML = '';
    els.vidstackHost.classList.add('hidden');
  }
  if (state.mediaSourceAbort) {
    state.mediaSourceAbort.abort();
    state.mediaSourceAbort = null;
  }
  if (state.mediaSourceObjectUrl) {
    URL.revokeObjectURL(state.mediaSourceObjectUrl);
    state.mediaSourceObjectUrl = null;
  }
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  els.hlsPlayer.onended = null;
  els.hlsPlayer.onerror = null;
  els.hlsPlayer.pause();
  els.hlsPlayer.removeAttribute('src');
  els.ytPlayer.src = 'about:blank';
  els.playerPartSelect.classList.add('hidden');
  els.playerDownloadMp4Btn.classList.add('hidden');
  els.switchPlayerEngineBtn.classList.add('hidden');
}

// ============================================================================
// UNIFIED PLAYER CONTROLLER (ALA JKT48.PRESET.ID)
// ============================================================================
let userDraggingSeek = false;
let currentPlaybackSpeed = 1.0;
const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

function getActivePlayerAdapter() {
  if (els.ytPlayer && !els.ytPlayer.classList.contains('hidden')) {
    return {
      type: 'youtube',
      el: els.ytPlayer,
      getCurrentTime: () => state.ytPlayerCurrentTime || 0,
      getDuration: () => state.ytPlayerDuration || (state.currentPlayingReplay?.durationSeconds || 0),
      seekTo: sec => {
        state.ytPlayerCurrentTime = sec;
        try {
          els.ytPlayer.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }),
            '*'
          );
        } catch {}
      },
      play: () => {
        state.ytPlayerPaused = false;
        if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '⏸';
        try {
          els.ytPlayer.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        } catch {}
      },
      pause: () => {
        state.ytPlayerPaused = true;
        if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '▶';
        try {
          els.ytPlayer.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            '*'
          );
        } catch {}
      },
      paused: () => Boolean(state.ytPlayerPaused),
      setSpeed: r => {
        try {
          els.ytPlayer.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [r] }),
            '*'
          );
        } catch {}
      }
    };
  }
  return {
    type: 'video',
    el: els.hlsPlayer,
    getCurrentTime: () => Number(els.hlsPlayer.currentTime) || 0,
    getDuration: () => Number(els.hlsPlayer.duration) || 0,
    seekTo: sec => { els.hlsPlayer.currentTime = Math.max(0, sec); },
    play: () => {
      const p = els.hlsPlayer.play();
      if (p && typeof p.catch === 'function') {
        p.catch(e => {
          console.warn('Playback blocked by browser policy:', e);
          if (els.videoPlayOverlay) els.videoPlayOverlay.classList.remove('hidden');
        });
      }
      return p;
    },
    pause: () => els.hlsPlayer.pause(),
    paused: () => Boolean(els.hlsPlayer.paused),
    setSpeed: r => { els.hlsPlayer.playbackRate = r; }
  };
}

function updateControlsTime(curSec, durSec) {
  if (els.ctrlCurrentTime) els.ctrlCurrentTime.textContent = formatSeconds(Math.floor(curSec));
  if (els.ctrlTotalDuration) {
    els.ctrlTotalDuration.textContent =
      isFinite(durSec) && durSec > 0 ? formatSeconds(Math.floor(durSec)) : '--:--';
  }
  if (els.ctrlSeekSlider && !userDraggingSeek && isFinite(durSec) && durSec > 0) {
    els.ctrlSeekSlider.value = String((curSec / durSec) * 100);
  }
}

function playerSkip(deltaSec) {
  const p = getActivePlayerAdapter();
  const cur = p.getCurrentTime();
  const dur = p.getDuration();
  const target = Math.max(0, isFinite(dur) && dur > 0 ? Math.min(dur - 0.5, cur + deltaSec) : cur + deltaSec);
  p.seekTo(target);
  updateControlsTime(target, dur);
  syncChatToVideoTime(true);
}

function playerPlayPause() {
  const p = getActivePlayerAdapter();
  if (p.paused && p.paused()) {
    p.play();
    if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '⏸';
  } else {
    p.pause();
    if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '▶';
  }
}

function playerSeekTo(sec) {
  const p = getActivePlayerAdapter();
  const dur = p.getDuration();
  const safeSec = Math.max(0, isFinite(dur) && dur > 0 ? Math.min(dur - 0.5, sec) : sec);
  p.seekTo(safeSec);
  p.play();
  updateControlsTime(safeSec, dur);
  syncChatToVideoTime(true);
}

function cyclePlayerSpeed() {
  const idx = PLAYBACK_SPEEDS.indexOf(currentPlaybackSpeed);
  currentPlaybackSpeed = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
  const p = getActivePlayerAdapter();
  p.setSpeed(currentPlaybackSpeed);
  if (els.btnCtrlSpeed) els.btnCtrlSpeed.textContent = `${currentPlaybackSpeed}x`;
  showToast(`Kecepatan putar: ${currentPlaybackSpeed}x`);
}

function togglePlayerFullscreen() {
  const container = els.videoWrapper || document.getElementById('videoWrapper');
  const video = els.hlsPlayer;
  if (!container) return;

  const isFs = Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    (video && video.webkitDisplayingFullscreen)
  );

  if (isFs) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (video && video.webkitExitFullscreen) {
      video.webkitExitFullscreen();
    }
  } else {
    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      });
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (video && video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  }
}

function triggerSkipFeedback(side, delta) {
  const overlay = side === 'left' ? els.skipOverlayLeft : els.skipOverlayRight;
  if (overlay) {
    overlay.classList.add('animating');
    setTimeout(() => overlay.classList.remove('animating'), 500);
  }
  playerSkip(delta);
}

// Wire persistent controls events once
(function initUnifiedPlayerControls() {
  if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.onclick = playerPlayPause;
  if (els.btnCtrlSkipBack) els.btnCtrlSkipBack.onclick = () => playerSkip(-10);
  if (els.btnCtrlSkipForward) els.btnCtrlSkipForward.onclick = () => playerSkip(10);
  if (els.btnCtrlSpeed) els.btnCtrlSpeed.onclick = cyclePlayerSpeed;
  if (els.btnCtrlFullscreen) els.btnCtrlFullscreen.onclick = togglePlayerFullscreen;

  // Unified Gesture Handler on videoWrapper (single tap = play/pause, double tap = seek/fullscreen)
  if (els.videoWrapper) {
    let tapTimer = null;
    let lastTapTime = 0;

    const handleTapAction = (clientX, clientY) => {
      const rect = els.videoWrapper.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const xRatio = (clientX - rect.left) / rect.width;
      const now = Date.now();
      const timeSinceLast = now - lastTapTime;

      if (timeSinceLast < 320) {
        // Double Tap detected
        clearTimeout(tapTimer);
        tapTimer = null;
        lastTapTime = 0;

        if (xRatio < 0.32) {
          triggerSkipFeedback('left', -10);
        } else if (xRatio > 0.68) {
          triggerSkipFeedback('right', 10);
        } else {
          // Double Tap on Center: Toggle Fullscreen!
          togglePlayerFullscreen();
        }
      } else {
        lastTapTime = now;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
          tapTimer = null;
          lastTapTime = 0;
          // Single Tap: Toggle Play / Pause
          playerPlayPause();
        }, 260);
      }
    };

    els.videoWrapper.addEventListener('pointerup', e => {
      // Don't intercept if user tapped on controls, buttons, or inputs
      if (e.target.closest('#videoPlayOverlay') || e.target.closest('button') || e.target.closest('input')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      handleTapAction(e.clientX, e.clientY);
    });

    els.videoWrapper.addEventListener('dblclick', e => {
      if (e.target.closest('#videoPlayOverlay') || e.target.closest('button') || e.target.closest('input')) return;
      const rect = els.videoWrapper.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const xRatio = (e.clientX - rect.left) / rect.width;
      if (xRatio >= 0.32 && xRatio <= 0.68) {
        togglePlayerFullscreen();
      }
    });
  }

  // Update fullscreen button icon on fullscreen change
  const updateFsBtn = () => {
    const isFs = Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      (els.hlsPlayer && els.hlsPlayer.webkitDisplayingFullscreen)
    );
    if (els.btnCtrlFullscreen) {
      els.btnCtrlFullscreen.textContent = isFs ? '🗗' : '⛶';
      els.btnCtrlFullscreen.title = isFs ? 'Keluar Layar Penuh (Esc / F)' : 'Layar Penuh (F)';
    }
  };
  document.addEventListener('fullscreenchange', updateFsBtn);
  document.addEventListener('webkitfullscreenchange', updateFsBtn);
  if (els.hlsPlayer) {
    els.hlsPlayer.addEventListener('webkitbeginfullscreen', updateFsBtn);
    els.hlsPlayer.addEventListener('webkitendfullscreen', updateFsBtn);
  }

  if (els.ctrlSeekSlider) {
    els.ctrlSeekSlider.onmousedown = () => { userDraggingSeek = true; };
    els.ctrlSeekSlider.ontouchstart = () => { userDraggingSeek = true; };
    els.ctrlSeekSlider.oninput = () => {
      const p = getActivePlayerAdapter();
      const dur = p.getDuration();
      if (isFinite(dur) && dur > 0) {
        const targetSec = (Number(els.ctrlSeekSlider.value) / 100) * dur;
        if (els.ctrlCurrentTime) els.ctrlCurrentTime.textContent = formatSeconds(Math.floor(targetSec));
      }
    };
    const commitSeek = () => {
      userDraggingSeek = false;
      const p = getActivePlayerAdapter();
      const dur = p.getDuration();
      if (isFinite(dur) && dur > 0) {
        const targetSec = (Number(els.ctrlSeekSlider.value) / 100) * dur;
        p.seekTo(targetSec);
        syncChatToVideoTime(true);
      }
    };
    els.ctrlSeekSlider.onmouseup = commitSeek;
    els.ctrlSeekSlider.ontouchend = commitSeek;
    els.ctrlSeekSlider.onchange = commitSeek;
  }

  // Keyboard Shortcuts (Space: Play/Pause, ArrowLeft/J: -10s, ArrowRight/L: +10s, F: Fullscreen, T: Theater)
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (!els.playerSection || els.playerSection.classList.contains('hidden')) return;

    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      playerPlayPause();
    } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      triggerSkipFeedback('left', -10);
    } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      triggerSkipFeedback('right', 10);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      togglePlayerFullscreen();
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      if (els.toolbarTheaterBtn) els.toolbarTheaterBtn.click();
    }
  });
})();

// Fast O(N) 4CC byte finder without String.fromCharCode spread (fixes call-stack crash & main-thread lag)
function findBoxFourCC(bytes, c0, c1, c2, c3) {
  const limit = bytes.length - 4;
  for (let i = 0; i <= limit; i++) {
    if (bytes[i] === c0 && bytes[i + 1] === c1 && bytes[i + 2] === c2 && bytes[i + 3] === c3) {
      return i;
    }
  }
  return -1;
}

// Fallback MediaSource fMP4 chunk reader only for unfinalized partial MP4s without .m3u8
async function startMediaSourceStream(video, source, signal) {
  if (!window.MediaSource) throw new Error('MediaSource not supported');
  if (state.mediaSourceObjectUrl) {
    URL.revokeObjectURL(state.mediaSourceObjectUrl);
    state.mediaSourceObjectUrl = null;
  }
  const media = new MediaSource();
  state.mediaSourceObjectUrl = URL.createObjectURL(media);
  video.src = state.mediaSourceObjectUrl;

  await new Promise(resolve => media.addEventListener('sourceopen', resolve, { once: true }));
  const response = await fetch(source, { signal, credentials: 'same-origin' });
  if (!response.ok) throw Error('media_http_' + response.status);

  const reader = response.body.getReader();
  let chunk = new Uint8Array();
  let position = 0;

  async function read(n) {
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      if (position === chunk.length) {
        const item = await reader.read();
        if (item.done) {
          if (!at) return null;
          throw Error('media_truncated');
        }
        chunk = item.value;
        position = 0;
      }
      const take = Math.min(n - at, chunk.length - position);
      out.set(chunk.subarray(position, position + take), at);
      at += take;
      position += take;
    }
    return out;
  }

  const join = (a, b) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };

  let init = new Uint8Array();
  let buffer;
  let pending;

  const append = bytes =>
    new Promise((resolve, reject) => {
      const clean = () => {
        buffer.removeEventListener('updateend', done);
        buffer.removeEventListener('error', failed);
      };
      const done = () => {
        clean();
        resolve();
      };
      const failed = () => {
        clean();
        reject(Error('media_append_failed'));
      };
      buffer.addEventListener('updateend', done);
      buffer.addEventListener('error', failed);
      buffer.appendBuffer(bytes);
    });

  while (!signal.aborted) {
    const head = await read(8);
    if (!head) break;
    const size = new DataView(head.buffer, head.byteOffset, 8).getUint32(0);
    const kind = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (size < 8 || size > 33554432) throw Error('media_box_invalid');
    const body = await read(size - 8);
    if (!body) throw Error('media_truncated');
    const box = join(head, body);

    if (kind === 'ftyp') {
      init = box;
    } else if (kind === 'moov') {
      // 'avcC' = 0x61, 0x76, 0x63, 0x43
      const avcIdx = findBoxFourCC(box, 0x61, 0x76, 0x63, 0x43);
      if (avcIdx < 0 || avcIdx + 8 > box.length) throw Error('media_codec_missing');
      const codec =
        'avc1.' +
        Array.from(box.subarray(avcIdx + 5, avcIdx + 8), b => b.toString(16).padStart(2, '0')).join('');
      // 'mp4a' = 0x6d, 0x70, 0x34, 0x61
      const hasAudio = findBoxFourCC(box, 0x6d, 0x70, 0x34, 0x61) >= 0;
      const mime = `video/mp4; codecs="${codec}${hasAudio ? ',mp4a.40.2' : ''}"`;
      if (!MediaSource.isTypeSupported(mime)) {
        await reader.cancel();
        throw Error('mime_not_supported');
      }
      buffer = media.addSourceBuffer(mime);
      await append(join(init, box));
      // 'mvhd' = 0x6d, 0x76, 0x68, 0x64
      const mvhdIdx = findBoxFourCC(box, 0x6d, 0x76, 0x68, 0x64);
      if (mvhdIdx >= 0 && mvhdIdx + 32 <= box.length) {
        const v = new DataView(box.buffer, box.byteOffset, box.byteLength);
        const version = box[mvhdIdx + 4];
        const scale = v.getUint32(mvhdIdx + (version === 1 ? 24 : 16));
        const duration =
          version === 1 ? Number(v.getBigUint64(mvhdIdx + 28)) : v.getUint32(mvhdIdx + 20);
        if (scale && duration) media.duration = duration / scale;
      }
    } else if (kind === 'moof') {
      pending = box;
    } else if (kind === 'mdat' && pending && buffer) {
      while (
        buffer.buffered.length &&
        buffer.buffered.end(buffer.buffered.length - 1) - video.currentTime > 30 &&
        !signal.aborted
      ) {
        await new Promise(r => setTimeout(r, 250));
      }
      if (signal.aborted) break;
      if (
        video.currentTime > 120 &&
        buffer.buffered.length &&
        buffer.buffered.start(0) < video.currentTime - 90
      ) {
        await new Promise(resolve => {
          buffer.addEventListener('updateend', resolve, { once: true });
          buffer.remove(0, video.currentTime - 60);
        });
      }
      await append(join(pending, box));
      pending = null;
    }
  }
  if (!signal.aborted && media.readyState === 'open') media.endOfStream();
}

function attachHlsOrMp4ToVideo(url, { onFatalError } = {}) {
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  if (!url) return;
  setVideoLoading('Memuat stream...');
  // Don't hide overlay yet — keep it visible. Hide only when video actually plays.

  const onPlaying = () => {
    setVideoLoading('');
    if (els.videoPlayOverlay) els.videoPlayOverlay.classList.add('hidden');
  };
  els.hlsPlayer.onplaying = onPlaying;
  // Also clear loading badge when metadata arrives
  els.hlsPlayer.onloadedmetadata = () => setVideoLoading('');
  els.hlsPlayer.oncanplay = () => setVideoLoading('');

  const isMp4 = url.includes('.mp4') && !url.includes('.m3u8');
  if (isMp4) {
    els.hlsPlayer.onerror = () => {
      els.hlsPlayer.onerror = null;
      setVideoLoading('');
      if (onFatalError) onFatalError(new Error('native_mp4_failed'));
    };
    els.hlsPlayer.src = url;
    // Show overlay immediately — let user tap to play (safe for mobile autoplay policy)
    if (els.videoPlayOverlay) els.videoPlayOverlay.classList.remove('hidden');
    // Try autoplay anyway; if it works overlay will auto-hide via onplaying
    els.hlsPlayer.play().catch(() => {});
    return;
  }

  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startFragPrefetch: true,
      maxBufferLength: 12,
      maxMaxBufferLength: 24,
      backBufferLength: 8,
      nudgeMaxRetry: 6,
      fragLoadingMaxRetry: 5
    });
    state.hlsInstance = hls;
    hls.loadSource(url);
    hls.attachMedia(els.hlsPlayer);
    // Show play overlay immediately while HLS manifest loads — reliable on mobile
    if (els.videoPlayOverlay) els.videoPlayOverlay.classList.remove('hidden');
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      // Try autoplay; if blocked, overlay is already visible for user to tap
      els.hlsPlayer.play().catch(() => {});
    });
    let recoveredOnce = false;
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredOnce) {
        recoveredOnce = true;
        hls.recoverMediaError();
        return;
      }
      hls.destroy();
      if (state.hlsInstance === hls) state.hlsInstance = null;
      if (onFatalError) onFatalError(new Error(data.details || 'hls_fatal_error'));
    });
  } else if (els.hlsPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    els.hlsPlayer.onerror = () => {
      els.hlsPlayer.onerror = null;
      setVideoLoading('');
      if (onFatalError) onFatalError(new Error('safari_hls_failed'));
    };
    els.hlsPlayer.src = url;
    if (els.videoPlayOverlay) els.videoPlayOverlay.classList.remove('hidden');
    els.hlsPlayer.play().catch(() => {});
  }
}

async function openAndPlayJkcReplay(item, defaultSideTab = 'chat') {
  showToast(`Memuat stream & detail ${item.nickname}...`);
  try {
    const d = await getReplayDetail(item.dataId);
    destroyHls();
    state.currentPlayingReplay = d;
    state.currentPartIdx = 0;
    state.currentPartBaseOffsetSec = 0;
    els.playerSection.classList.remove('hidden');
    
    // Smooth scroll straight to video player (solves user not noticing player opened)
    try {
      els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}

    const isIdn = d.platform === 'IDN';
    els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
    els.playerPlatformBadge.textContent = `${d.platform} REPLAY`;
    els.playerTitle.textContent = d.title;
    els.playerQualitySelect.classList.add('hidden');
    els.playerRecordBtn.classList.add('hidden');

    renderSideGiftsAndFans(d);
    renderSideScreenshotsAndLeaderboard(d);

    const recs = d.recordings || [];
    const refStart = recs[0]?.startedAt || d.startedAt || '';
    const refStartMs = refStart ? Date.parse(refStart) : 0;

    loadCommentsForPlayer({
      mode: 'session',
      platform: d.platform,
      roomId: d.roomId || '',
      dataId: d.dataId || '',
      startedAt: refStart
    });

    // ── Tab Switcher Ala jkt48.preset.id (Chat, Gift, Screenshot) ──
    function switchDockTab(tab) {
      const isChat = tab === 'chat' || tab === 'comments';
      const isGift = tab === 'gift' || tab === 'gifts';
      const isScreenshot = tab === 'screenshot' || tab === 'screenshots';

      if (els.tabDockChatBtn) els.tabDockChatBtn.classList.toggle('active', isChat);
      if (els.tabDockGiftBtn) els.tabDockGiftBtn.classList.toggle('active', isGift);
      if (els.tabDockScreenshotBtn) els.tabDockScreenshotBtn.classList.toggle('active', isScreenshot);

      if (els.toolbarTabChatBtn) els.toolbarTabChatBtn.classList.toggle('active', isChat);
      if (els.toolbarTabGiftBtn) els.toolbarTabGiftBtn.classList.toggle('active', isGift);

      if (els.dockPanelChat) els.dockPanelChat.classList.toggle('hidden', !isChat);
      if (els.dockPanelGift) els.dockPanelGift.classList.toggle('hidden', !isGift);
      if (els.dockPanelScreenshot) els.dockPanelScreenshot.classList.toggle('hidden', !isScreenshot);
    }

    if (els.tabDockChatBtn) els.tabDockChatBtn.onclick = () => switchDockTab('chat');
    if (els.tabDockGiftBtn) els.tabDockGiftBtn.onclick = () => switchDockTab('gift');
    if (els.tabDockScreenshotBtn) els.tabDockScreenshotBtn.onclick = () => switchDockTab('screenshot');

    if (els.toolbarTabChatBtn) els.toolbarTabChatBtn.onclick = () => switchDockTab('chat');
    if (els.toolbarTabGiftBtn) els.toolbarTabGiftBtn.onclick = () => switchDockTab('gift');
    if (els.toolbarDownloadBtn) els.toolbarDownloadBtn.onclick = () => openDownloadModal(d);

    // Initial tab
    switchDockTab(defaultSideTab);

    // ── Theater / Cinema Mode Ala jkt48.preset.id ──
    function toggleTheater() {
      const isTh = document.body.classList.toggle('theater');
      if (els.toolbarTheaterBtn) els.toolbarTheaterBtn.classList.toggle('active', isTh);
      if (els.theaterBtnLabel) els.theaterBtnLabel.textContent = isTh ? 'Exit Theater' : 'Theater';
      showToast(isTh ? 'Mode Theater (Layar Lebar) Aktif' : 'Mode Normal');
      try {
        els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    }
    if (els.toolbarTheaterBtn) els.toolbarTheaterBtn.onclick = toggleTheater;

    // ── Switch Player Engine Ala jkt48.preset.id ──
    const updateSwitchEngineLabel = () => {
      let lbl = 'Switch Player';
      if (state.playerEngine === 'youtube') lbl = 'Player: YouTube Full';
      else if (state.playerEngine === 'mp4') lbl = 'Player: MP4 Direct';
      else if (state.playerEngine === 'hls') lbl = 'Player: HLS.js';
      else if (state.playerEngine === 'official') lbl = 'Player: Web Resmi';
      if (els.playerPrefLabel) els.playerPrefLabel.textContent = lbl;
      if (els.switchPlayerEngineBtn) els.switchPlayerEngineBtn.textContent = '🔄 ' + lbl;
    };

    const cyclePlayerEngine = () => {
      const available = [];
      if (recs[state.currentPartIdx]?.mp4Url || recs[0]?.mp4Url) available.push('mp4');
      if (recs[state.currentPartIdx]?.streamUrl || d.combinedStreamUrl) available.push('hls');
      if (d.youtubeId) available.push('youtube');
      if (playerUrl) available.push('official');

      if (available.length <= 1) {
        showToast('Hanya 1 engine yang tersedia untuk sesi ini.');
        return;
      }

      const curIdx = available.indexOf(state.playerEngine);
      const nextIdx = (curIdx + 1) % available.length;
      state.playerEngine = available[nextIdx];
      updateSwitchEngineLabel();
      showToast(`Beralih ke: ${els.playerPrefLabel ? els.playerPrefLabel.textContent : state.playerEngine}`);
      playPart(state.currentPartIdx);
    };

    if (els.playerPrefBtn) els.playerPrefBtn.onclick = cyclePlayerEngine;
    if (els.switchPlayerEngineBtn) els.switchPlayerEngineBtn.onclick = cyclePlayerEngine;

    // ── Live Chat Real-Time Search ──
    if (els.chatSearchInput) {
      els.chatSearchInput.value = '';
      els.chatSearchInput.oninput = () => {
        const q = (els.chatSearchInput.value || '').trim().toLowerCase();
        const msgs = els.chatMessagesList.querySelectorAll('.chat-msg');
        msgs.forEach(m => {
          if (!q) {
            m.style.display = '';
          } else {
            const txt = (m.textContent || '').toLowerCase();
            m.style.display = txt.includes(q) ? '' : 'none';
          }
        });
      };
    }

    // ── Big Play Overlay Button (Handles blocked autoplay smoothly) ──
    const startActivePlayback = () => {
      if (els.videoPlayOverlay) els.videoPlayOverlay.classList.add('hidden');
      const p = getActivePlayerAdapter();
      if (p.type === 'video') {
        // If video not ready yet, wait for canplay before calling play()
        const vid = els.hlsPlayer;
        if (vid.readyState < 2) {
          // Not ready — wait for canplay
          const onReady = () => {
            vid.removeEventListener('canplay', onReady);
            vid.play().catch(() => {
              if (els.videoPlayOverlay) els.videoPlayOverlay.classList.remove('hidden');
            });
          };
          vid.addEventListener('canplay', onReady);
        } else {
          vid.play().catch(() => {
            if (els.videoPlayOverlay) els.videoPlayOverlay.classList.remove('hidden');
          });
        }
      } else {
        p.play();
      }
      if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '⏸';
    };
    if (els.bigPlayBtn) els.bigPlayBtn.onclick = startActivePlayback;
    if (els.videoPlayOverlay) els.videoPlayOverlay.onclick = startActivePlayback;

    els.playerDownloadMp4Btn.classList.remove('hidden');
    els.playerDownloadMp4Btn.onclick = () => openDownloadModal(d);

    // Render prominent Multi-Part selector right above controls
    const partsBar = els.playerPartsBar;
    if (partsBar) {
      if (recs.length > 1) {
        partsBar.classList.remove('hidden');
        partsBar.innerHTML = `
          <strong style="color:var(--accent);font-size:12px;margin-right:4px">Bagian Video (${recs.length} Part):</strong>
          ${recs
            .map(
              (r, i) => `
            <button type="button" class="part-pill-btn ${i === 0 ? 'active' : ''}" data-part-pill="${i}">
              Part ${r.part} (${formatSeconds(r.durationSeconds || Math.round((r.duration_ms || 0) / 1000))})
            </button>
          `
            )
            .join('')}
        `;
        partsBar.querySelectorAll('[data-part-pill]').forEach(btn => {
          btn.onclick = () => {
            partsBar.querySelectorAll('.part-pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            playPart(Number(btn.dataset.partPill));
          };
        });
      } else {
        partsBar.classList.add('hidden');
        partsBar.innerHTML = '';
      }
    }

    if (recs.length > 1) {
      els.playerPartSelect.classList.remove('hidden');
      els.playerPartSelect.innerHTML = recs
        .map(
          (r, i) =>
            `<option value="${i}">Bagian ${r.part} (${formatSeconds(r.durationSeconds)}${r.sizeBytes ? ' • ' + formatBytes(r.sizeBytes) : ''})</option>`
        )
        .join('');
      els.playerPartSelect.onchange = e => {
        playPart(Number(e.target.value) || 0);
      };
    } else {
      els.playerPartSelect.classList.add('hidden');
    }

    async function playPart(idx) {
      state.currentPartIdx = idx;
      if (recs.length > 1) {
        els.playerPartSelect.value = String(idx);
      }
      if (partsBar) {
        partsBar.querySelectorAll('[data-part-pill]').forEach((b, i) => {
          b.classList.toggle('active', i === idx);
        });
      }
      const chosen = recs[idx] || recs[0];

      // Compute session offset for multi-part sync chat accuracy
      if (chosen?.startedAt && refStartMs > 0) {
        state.currentPartBaseOffsetSec = Math.max(
          0,
          Math.round((Date.parse(chosen.startedAt) - refStartMs) / 1000)
        );
      } else {
        state.currentPartBaseOffsetSec = 0;
      }

      if (!chosen) {
        if (d.youtubeId) {
          setVideoLoading('');
          els.hlsPlayer.classList.add('hidden');
          els.ytPlayer.classList.remove('hidden');
          els.ytPlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(d.youtubeId)}?autoplay=1&rel=0`;
        } else {
          showToast('Video replay sesi ini masih sedang diproses oleh server R2 JKT48Connect.');
        }
        return;
      }

      const playerUrl =
        chosen.playerUrl || (chosen.run ? `https://api.jkt48connect.app/replay/${d.dataId}/${chosen.run}` : '');

      if (state.mediaSourceAbort) {
        state.mediaSourceAbort.abort();
        state.mediaSourceAbort = null;
      }
      if (state.hlsInstance) {
        state.hlsInstance.destroy();
        state.hlsInstance = null;
      }

      const rawMp4 = chosen?.mp4Url
        ? chosen.mp4Url + (chosen.mp4Url.includes('?') ? '&' : '?') + 'v=2'
        : chosen?.url
          ? normalizeMediaUrlClient(chosen.url) + '?v=2'
          : '';
      const partM3u8 = chosen?.streamUrl || (recs.length === 1 ? d.combinedStreamUrl : '');

      // Reset DOM state of all player hosts
      els.ytPlayer.classList.add('hidden');
      els.ytPlayer.src = 'about:blank';
      els.hlsPlayer.classList.add('hidden');
      setVideoLoading('');

      els.hlsPlayer.onended = () => {
        if (state.currentPartIdx + 1 < recs.length) {
          showToast(`Lanjut memutar Bagian ${recs[state.currentPartIdx + 1].part}...`);
          playPart(state.currentPartIdx + 1);
        }
      };

      const fallbackToOfficial = () => {
        if (playerUrl) {
          setVideoLoading('');
          state.playerEngine = 'official';
          updateSwitchEngineLabel();
          els.hlsPlayer.classList.add('hidden');
          els.ytPlayer.classList.remove('hidden');
          els.ytPlayer.src = playerUrl;
        } else {
          setVideoLoading('');
          showToast('Tidak ada stream video yang tersedia untuk sesi ini.');
        }
      };

      // Engine 1: YouTube Full Archive (Official YouTube Embed)
      if (state.playerEngine === 'youtube' && d.youtubeId) {
        state.ytPlayerPaused = false;
        if (els.btnCtrlPlayPause) els.btnCtrlPlayPause.textContent = '⏸';
        els.ytPlayer.classList.remove('hidden');
        els.ytPlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(d.youtubeId)}?autoplay=1&enablejsapi=1&rel=0`;
        return;
      }

      // Engine 2: Official Web Player (iframe)
      if (state.playerEngine === 'official' && playerUrl) {
        els.ytPlayer.classList.remove('hidden');
        els.ytPlayer.src = playerUrl;
        return;
      }

      // Engine 3: Native MP4 Direct (Cloudflare R2 with HTTP 206 Byte Ranges)
      if (state.playerEngine === 'mp4' && rawMp4) {
        els.hlsPlayer.classList.remove('hidden');
        attachHlsOrMp4ToVideo(rawMp4, {
          onFatalError: () => {
            console.warn('MP4 playback fatal error, falling back to HLS / YouTube...');
            if (partM3u8) {
              state.playerEngine = 'hls';
              updateSwitchEngineLabel();
              playPart(idx);
            } else if (d.youtubeId) {
              state.playerEngine = 'youtube';
              updateSwitchEngineLabel();
              playPart(idx);
            } else if (playerUrl) {
              state.playerEngine = 'official';
              updateSwitchEngineLabel();
              playPart(idx);
            }
          }
        });
        return;
      }

      // Engine 4: HLS.js Stream (Adaptive bitrate)
      if (partM3u8) {
        els.hlsPlayer.classList.remove('hidden');
        attachHlsOrMp4ToVideo(partM3u8, {
          onFatalError: () => {
            console.warn('HLS stream fatal error, falling back to YouTube / Official...');
            if (d.youtubeId) {
              state.playerEngine = 'youtube';
              updateSwitchEngineLabel();
              playPart(idx);
            } else if (playerUrl) {
              state.playerEngine = 'official';
              updateSwitchEngineLabel();
              playPart(idx);
            }
          }
        });
        return;
      }

      // Fallback
      if (d.youtubeId) {
        state.playerEngine = 'youtube';
        updateSwitchEngineLabel();
        playPart(idx);
        return;
      }

      fallbackToOfficial();
    }

    // Engine Selection Heuristic: Prefer native MP4 direct first, or YouTube Full if partial
    const isPartialRecording = recs.some(r => r.partial) ||
      (d.durationSeconds > 1200 && recs[0]?.durationSeconds > 0 && recs[0].durationSeconds < 1200);

    if (recs[0]?.mp4Url) {
      state.playerEngine = 'mp4';
    } else if (d.youtubeId && (isPartialRecording || recs.length === 0)) {
      state.playerEngine = 'youtube';
    } else if (recs[0]?.streamUrl || d.combinedStreamUrl) {
      state.playerEngine = 'hls';
    } else if (d.youtubeId) {
      state.playerEngine = 'youtube';
    } else {
      state.playerEngine = 'official';
    }
    updateSwitchEngineLabel();

    playPart(0);

    const dateLabel = d.startedAt
      ? new Date(d.startedAt).toLocaleString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) + ' WIB'
      : '-';

    const chosenPart = recs[0];
    const recDurSec = chosenPart
      ? chosenPart.durationSeconds || Math.round((chosenPart.duration_ms || 0) / 1000)
      : 0;
    const isPartial =
      d.recording_session?.status === 'partial' || Boolean(chosenPart?.partial);

    let durationNotice = `Durasi Live: <strong>${formatSeconds(d.durationSeconds)}</strong>`;
    if (recs.length > 1) {
      durationNotice += ` (Terbagi dalam ${recs.length} Bagian Video)`;
    } else if (isPartial && recDurSec > 0 && recDurSec < d.durationSeconds * 0.85) {
      durationNotice += ` • <span style="color:#fbbf24">⏳ Rekaman R2 Tersedia: <strong>${formatSeconds(recDurSec)}</strong> (Server sedang memproses sisa rekaman)</span>`;
    }

    let ytFullBtn = '';
    if (d.youtubeId) {
      ytFullBtn = `<button type="button" class="btn-action subtle" id="playFullYtBtn" style="color:#f43f5e;border-color:rgba(244,63,94,0.4);font-size:11px;padding:3px 9px">🔴 Tonton Full YouTube (${formatSeconds(d.durationSeconds)})</button>`;
    }

    els.playerFooterInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span>📅 <strong>${escapeHtml(dateLabel)}</strong> • ${durationNotice}</span>
        ${ytFullBtn}
      </div>
      <div>
        <span>👁 Penonton: <strong>${Number(d.viewers || 0).toLocaleString('id-ID')}</strong> • 🎁 Total ${d.pointUnit === 'idn_gold' ? 'Gold' : 'Poin'}: <strong>${Number(d.goldSummary?.total_gold || d.points || 0).toLocaleString('id-ID')}</strong></span>
      </div>
    `;

    const fullYtBtn = document.getElementById('playFullYtBtn');
    if (fullYtBtn && d.youtubeId) {
      fullYtBtn.onclick = () => {
        setVideoLoading('');
        els.hlsPlayer.pause();
        els.hlsPlayer.classList.add('hidden');
        els.ytPlayer.classList.remove('hidden');
        els.ytPlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(d.youtubeId)}?autoplay=1&rel=0`;
        showToast('Memutar versi YouTube Full Durasi...');
      };
    }

    els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(`Gagal membuka replay: ${err.message}`);
  }
}

function renderSideGiftsAndFans(d) {
  const unitLabel = d.pointUnit === 'idn_gold' ? 'Gold' : 'Pts';
  const fans = d.fans || [];
  const gifts = d.giftItems || [];
  const recs = (d.recordings || []).filter(r => r.mp4Url);

  const downloadSectionHtml = recs.length
    ? `
      <div style="margin-bottom:14px;padding:10px;border-radius:10px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.28)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:800;color:#34d399;text-transform:uppercase">
            ⬇ Video Replay (.MP4) — ${recs.length} Bagian
          </div>
          <button type="button" class="btn-action subtle" id="openSideDlModalBtn" style="padding:3px 8px;font-size:11px">Pilihan Unduh &rarr;</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${recs
            .map(
              (r, i) => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,0.03);padding:6px 8px;border-radius:7px">
                <div style="font-size:12px">
                  <strong>Bagian ${r.part}</strong>
                  <span style="color:var(--text-muted);margin-left:6px">${formatSeconds(r.durationSeconds)}${r.sizeBytes ? ' • ' + formatBytes(r.sizeBytes) : ''}</span>
                </div>
                <button type="button" class="btn-action subtle" data-side-dl-part="${i}" style="padding:4px 9px;font-size:11.5px">⬇ Unduh</button>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  els.sideGiftsContent.innerHTML = `
    ${downloadSectionHtml}
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:800;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">
        👑 Top Gifter / Sultan (${fans.length})
      </div>
      ${
        fans.length
          ? `<div style="display:flex;flex-direction:column;gap:6px">
              ${fans
                .slice(0, 15)
                .map(
                  f => `
                  <div class="fan-rank-item">
                    <div class="fan-rank-left">
                      <span class="fan-rank-num">${f.rank}</span>
                      ${f.avatar ? `<img class="chat-avatar" src="${escapeHtml(f.avatar)}" alt="" loading="lazy" />` : ''}
                      <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.name)}</span>
                    </div>
                    <strong style="color:#fbbf24;flex-shrink:0">${Number(f.score).toLocaleString('id-ID')} ${unitLabel}</strong>
                  </div>
                `
                )
                .join('')}
            </div>`
          : `<div style="color:var(--text-muted);font-size:12px">Data top gifter tidak tersedia.</div>`
      }
    </div>

    <div>
      <div style="font-size:12px;font-weight:800;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">
        🎁 Item Gift Terkirim (${gifts.length})
      </div>
      ${
        gifts.length
          ? `<div style="display:flex;flex-direction:column;gap:6px">
              ${gifts
                .slice(0, 20)
                .map(
                  g => `
                  <div class="gift-item">
                    ${g.img ? `<img src="${escapeHtml(g.img)}" alt="${escapeHtml(g.name)}" loading="lazy" />` : ''}
                    <div style="flex:1">
                      <strong>${escapeHtml(g.name)}</strong>
                      <div style="color:var(--text-muted);font-size:11px">${g.num}x dikirim • ${g.point} ${unitLabel}</div>
                    </div>
                  </div>
                `
                )
                .join('')}
            </div>`
          : `<div style="color:var(--text-muted);font-size:12px">Rincian log item gift tidak tercatat.</div>`
      }
    </div>
  `;

  const sideDlBtn = els.sideGiftsContent.querySelector('#openSideDlModalBtn');
  if (sideDlBtn) sideDlBtn.onclick = () => openDownloadModal(d);

  els.sideGiftsContent.querySelectorAll('[data-side-dl-part]').forEach(btn => {
    btn.onclick = () => openDownloadModal(d);
  });
}

function renderSideScreenshotsAndLeaderboard(d) {
  const lb =
    d.leaderboards?.jkt48connectBanner ||
    d.leaderboards?.photobookBanner ||
    d.leaderboards?.jkt48connectPortrait ||
    '';
  const ss = d.screenshots || [];

  els.sideScreenshotsContent.innerHTML = `
    ${
      lb
        ? `<div style="margin-bottom:14px">
            <div style="font-size:12px;font-weight:800;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">
              🏆 Kartu Rekap Leaderboard
            </div>
            <a href="${escapeHtml(lb)}" target="_blank" rel="noopener">
              <img src="${escapeHtml(lb)}" alt="Leaderboard" style="width:100%;border-radius:8px;border:1px solid var(--border)" loading="lazy" />
            </a>
          </div>`
        : ''
    }
    <div>
      <div style="font-size:12px;font-weight:800;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">
        📸 Cuplikan Screenshot Live (${ss.length})
      </div>
      ${
        ss.length
          ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              ${ss
                .slice(0, 24)
                .map(
                  u => `
                  <a href="${escapeHtml(u)}" target="_blank" rel="noopener">
                    <img src="${escapeHtml(u)}" alt="Screenshot" style="width:100%;border-radius:6px;border:1px solid var(--border);aspect-ratio:16/9;object-fit:cover" loading="lazy" />
                  </a>
                `
                )
                .join('')}
            </div>`
          : `<div style="color:var(--text-muted);font-size:12px">Screenshot belum tersedia untuk sesi ini.</div>`
      }
    </div>
  `;
}

function playHlsStream({ title, platform, streamUrls, directPlaylistUrl, liveObj, recId }) {
  destroyHls();
  state.currentPlayingLive = liveObj || null;
  state.currentPartBaseOffsetSec = 0;
  els.playerSection.classList.remove('hidden');
  switchSideTab('comments');

  const isIdn = platform === 'IDN';
  els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
  els.playerPlatformBadge.textContent = directPlaylistUrl
    ? `${platform} LOCAL DVR`
    : `${platform} LIVE`;
  els.playerTitle.textContent = title;

  els.ytPlayer.classList.add('hidden');
  els.hlsPlayer.classList.remove('hidden');

  if (liveObj && liveObj.bestStreamUrl) {
    els.playerRecordBtn.classList.remove('hidden');
    els.playerRecordBtn.onclick = () => triggerRecordLive(liveObj);
  } else {
    els.playerRecordBtn.classList.add('hidden');
  }

  if (directPlaylistUrl) {
    els.playerQualitySelect.classList.add('hidden');
    attachHlsOrMp4ToVideo(directPlaylistUrl);
    els.playerFooterInfo.innerHTML = `<span>Memutar rekaman DVR lokal dari PC Anda</span>`;
  } else if (Array.isArray(streamUrls) && streamUrls.length > 0) {
    if (streamUrls.length > 1) {
      els.playerQualitySelect.classList.remove('hidden');
      els.playerQualitySelect.innerHTML = streamUrls
        .map((s, idx) => `<option value="${idx}">${escapeHtml(s.label || `${s.quality}p`)}</option>`)
        .join('');
      els.playerQualitySelect.onchange = e => {
        const chosen = streamUrls[Number(e.target.value)] || streamUrls[0];
        attachHlsOrMp4ToVideo(`/api/hls-proxy?url=${encodeURIComponent(chosen.url)}`);
      };
    } else {
      els.playerQualitySelect.classList.add('hidden');
    }
    const firstUrl = streamUrls[0].url;
    attachHlsOrMp4ToVideo(`/api/hls-proxy?url=${encodeURIComponent(firstUrl)}`);
    els.playerFooterInfo.innerHTML = `
      <span>Status: <strong>SEDANG LIVE (${escapeHtml(platform)})</strong></span>
      <span>Stream &amp; Komentar Real-Time Aktif</span>
    `;
  }

  if (recId) {
    loadCommentsForPlayer({ mode: 'local', recId });
  } else if (liveObj) {
    loadCommentsForPlayer({
      mode: 'session',
      isLive: '1',
      platform: liveObj.platform,
      roomId: liveObj.roomId || '',
      dataId: liveObj.dataId || '',
      startedAt: liveObj.startedAt || ''
    });
  }

  els.playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

els.closePlayerBtn.addEventListener('click', () => {
  destroyHls();
  els.playerSection.classList.add('hidden');
});

// ============================================================================
// 5. MEMBERS, OSHI, AUTO-RECORD & TELEGRAM BOT SETTINGS
// ============================================================================
async function loadMembers() {
  try {
    const res = await apiFetch('/api/members');
    const json = await res.json();
    if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
      state.members = json.data;
      renderMemberChips();
      renderOshiPanel();
      return;
    }
  } catch (err) {
    console.warn('Gagal memuat member via server:', err.message);
  }

  // Direct fallback ke JKT48Connect
  try {
    const raw = await fetchJkcDirect('/api/member', { group: 'jkt48' });
    const list = Array.isArray(raw) ? raw : raw?.members || [];
    state.members = list
      .filter(m => !m.is_graduate && (!m.group || m.group === 'jkt48'))
      .map(m => ({
        id: m._id || m.url || m.name,
        name: m.name,
        nicknames: m.nicknames?.length
          ? m.nicknames
          : m.nickname
            ? [m.nickname]
            : [m.name.split(' ')[0]],
        img: normalizeMediaUrlClient(m.img_alt || m.img || ''),
        url: m.url || '',
        generation: m.generation || ''
      }))
      .sort((a, b) => (a.nicknames[0] || a.name).localeCompare(b.nicknames[0] || b.name));
    renderMemberChips();
    renderOshiPanel();
  } catch (directErr) {
    console.warn('Direct members fallback gagal:', directErr);
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
      const isOshi = (state.oshiConfig.oshiList || []).some(
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
}

els.memberChipsContainer.addEventListener('click', e => {
  const btn = e.target.closest('.member-chip');
  if (!btn) return;
  const nick = btn.dataset.nick;
  state.selectedMember =
    state.selectedMember.toLowerCase() === nick.toLowerCase() ? '' : nick;
  state.page = 1;
  renderMemberChips();
  loadReplays();
});

els.resetMemberBtn.addEventListener('click', () => {
  state.selectedMember = '';
  state.page = 1;
  renderMemberChips();
  loadReplays();
});

function syncConfigToInputs() {
  const cfg = state.oshiConfig;
  els.autoRecordToggle.checked = Boolean(cfg.autoRecordEnabled);
  els.modeAllRadio.checked = cfg.autoRecordMode === 'all';
  els.modeOshiRadio.checked = cfg.autoRecordMode !== 'all';
  els.oshiSelectionSection.style.opacity = cfg.autoRecordMode === 'all' ? '0.55' : '1';
  if (cfg.maskedApiKey) {
    els.jkcApiKeyInput.placeholder = `Key Aktif: ${cfg.maskedApiKey}`;
  }
  els.telegramToggle.checked = cfg.telegramEnabled !== false;
  els.tgModeSelect.value = cfg.telegramMode === 'oshi' ? 'oshi' : 'all';
  if (cfg.telegramChatId) {
    els.tgChatIdInput.value = cfg.telegramChatId;
  }
  if (cfg.maskedTelegramToken) {
    els.tgBotTokenInput.placeholder = `Token Aktif: ${cfg.maskedTelegramToken}`;
  }
}

async function loadOshiConfig() {
  try {
    const res = await apiFetch('/api/oshi');
    const json = await res.json();
    if (json.ok && json.data) {
      state.oshiConfig = json.data;
      syncConfigToInputs();
      renderMemberChips();
      renderOshiPanel();
    }
  } catch (err) {
    console.error('Gagal memuat konfigurasi:', err);
  }
}

async function saveOshiConfig(extraPayload = {}) {
  try {
    const payload = {
      autoRecordEnabled: state.oshiConfig.autoRecordEnabled,
      autoRecordMode: state.oshiConfig.autoRecordMode,
      oshiList: state.oshiConfig.oshiList,
      telegramEnabled: els.telegramToggle.checked,
      telegramMode: els.tgModeSelect.value,
      telegramChatId: els.tgChatIdInput.value.trim(),
      ...extraPayload
    };
    const res = await apiFetch('/api/oshi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.ok) {
      state.oshiConfig = json.data;
      syncConfigToInputs();
      renderMemberChips();
      renderOshiPanel();
      showToast('Pengaturan tersimpan!');
    }
  } catch {
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

els.saveJkcKeyBtn.addEventListener('click', async () => {
  const val = els.jkcApiKeyInput.value.trim();
  if (!val) return;
  await saveOshiConfig({ jkt48ConnectApiKey: val });
  els.jkcApiKeyInput.value = '';
  loadReplays(true);
});

// Telegram Settings & Actions
els.telegramToggle.addEventListener('change', () => saveOshiConfig());
els.tgModeSelect.addEventListener('change', () => saveOshiConfig());

els.saveTgBtn.addEventListener('click', async () => {
  const tok = els.tgBotTokenInput.value.trim();
  const extra = { publicAppUrl: window.location.origin };
  if (tok) extra.telegramBotToken = tok;
  await saveOshiConfig(extra);
  els.tgBotTokenInput.value = '';
});

els.tgDetectChatBtn.addEventListener('click', async () => {
  els.tgDetectChatBtn.disabled = true;
  els.tgDetectChatBtn.textContent = 'Mencari...';
  try {
    const res = await apiFetch('/api/telegram/detect-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: els.tgBotTokenInput.value.trim() })
    });
    const json = await res.json();
    if (!json.ok) {
      showToast(json.error || 'Gagal mendeteksi Chat ID');
      return;
    }
    els.tgChatIdInput.value = json.chatId;
    els.tgBotTokenInput.value = '';
    if (json.data) {
      state.oshiConfig = json.data;
      syncConfigToInputs();
    }
    showToast(`Berhasil! Chat ID terdeteksi: ${json.chatId} (${json.label})`);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    els.tgDetectChatBtn.disabled = false;
    els.tgDetectChatBtn.textContent = '🔍 Deteksi ID';
  }
});

els.testTgBtn.addEventListener('click', async () => {
  els.testTgBtn.disabled = true;
  els.testTgBtn.textContent = 'Mengirim...';
  try {
    const tok = els.tgBotTokenInput.value.trim();
    const chatId = els.tgChatIdInput.value.trim();
    if (tok || chatId) {
      await saveOshiConfig(tok ? { telegramBotToken: tok } : {});
      els.tgBotTokenInput.value = '';
    }
    const res = await apiFetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: tok, chatId })
    });
    const json = await res.json();
    showToast(json.ok ? json.message : `Gagal: ${json.error}`);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    els.testTgBtn.disabled = false;
    els.testTgBtn.textContent = '📨 Tes Notifikasi';
  }
});

els.webhookTgBtn.addEventListener('click', async () => {
  els.webhookTgBtn.disabled = true;
  try {
    const tok = els.tgBotTokenInput.value.trim();
    const res = await apiFetch('/api/telegram/set-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: tok,
        originUrl: window.location.origin
      })
    });
    const json = await res.json();
    if (json.ok) {
      els.tgBotTokenInput.value = '';
      showToast('Webhook Bot Telegram aktif 24 jam di Cloud!');
    } else {
      showToast(`Gagal: ${json.error}`);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    els.webhookTgBtn.disabled = false;
  }
});

// ============================================================================
// 6. REPLAY LIVE (SERVER-AUTHENTICATED /api/replays)
// ============================================================================
async function loadReplays(force = false) {
  els.replaysGrid.innerHTML = `
    <div class="state-box">
      <h3>Sedang mengambil daftar Replay dari JKT48Connect...</h3>
      <p>Memuat rekaman R2 IDN Live &amp; Showroom beserta rekap gift dan komentar.</p>
    </div>
  `;

  let loadedItems = null;

  // 1. Try server endpoint first
  try {
    const params = new URLSearchParams({
      page: String(state.page),
      perpage: '24',
      q: state.searchQuery,
      member: state.selectedMember,
      platform: state.platform,
      refresh: force ? '1' : '0'
    });
    const res = await fetch(`/api/replays?${params.toString()}`, { credentials: 'same-origin' });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (res.ok && json && json.ok && Array.isArray(json.data)) {
      if (json.quota && json.quota.limit) {
        els.jkcQuotaBadge.textContent = `Kuota API: ${json.quota.remaining}/${json.quota.limit}`;
      }
      loadedItems = json.data;
    }
  } catch (err) {
    console.warn('Server /api/replays gagal, mencoba fallback direct:', err);
  }

  // 2. Direct client fallback if server endpoint failed or returned non-JSON/HTML
  if (!loadedItems) {
    try {
      const typeParam =
        state.platform === 'IDN' ? 'idn' : state.platform === 'SHOWROOM' ? 'showroom' : 'all';
      const hasFilter = Boolean(state.selectedMember || state.searchQuery);
      let directJson = null;
      try {
        directJson = await fetchJkcDirect('/api/recent', {
          page: state.page,
          perpage: hasFilter ? 60 : 24,
          group: 'jkt48',
          type: typeParam,
          sort: 'date',
          order: '-1'
        });
      } catch (firstErr) {
        // If stored localStorage key was invalid, reset to verified fallback key and retry
        console.warn('Percobaan pertama direct gagal, reset ke fallback key:', firstErr.message);
        state.apiKey = JKC_DEFAULT_FALLBACK;
        try { localStorage.removeItem(JKC_STORAGE_KEY); } catch {}
        directJson = await fetchJkcDirect('/api/recent', {
          page: state.page,
          perpage: hasFilter ? 60 : 24,
          group: 'jkt48',
          type: typeParam,
          sort: 'date',
          order: '-1'
        });
      }

      const rawList = Array.isArray(directJson?.recents)
        ? directJson.recents
        : Array.isArray(directJson)
          ? directJson
          : [];
      let formatted = rawList.map(formatRecentItemClient);
      if (state.selectedMember) {
        const mLower = state.selectedMember.toLowerCase();
        formatted = formatted.filter(
          it =>
            it.nickname.toLowerCase().includes(mLower) ||
            it.memberName.toLowerCase().includes(mLower)
        );
      }
      if (state.searchQuery) {
        const qLower = state.searchQuery.toLowerCase();
        formatted = formatted.filter(
          it =>
            it.title.toLowerCase().includes(qLower) ||
            it.memberName.toLowerCase().includes(qLower) ||
            it.nickname.toLowerCase().includes(qLower)
        );
      }
      loadedItems = formatted;
    } catch (directErr) {
      console.error('Fallback direct JKT48Connect juga gagal:', directErr);
    }
  }

  if (loadedItems) {
    state.replays = loadedItems;
    renderReplaysGrid();
    const hasFilter = Boolean(state.selectedMember || state.searchQuery);
    els.prevPageBtn.classList.toggle('hidden', state.page <= 1 || hasFilter);
    els.nextPageBtn.classList.toggle('hidden', state.replays.length < 20 || hasFilter);
  } else {
    els.replaysGrid.innerHTML = `
      <div class="state-box">
        <h3>Gagal memuat daftar Replay</h3>
        <p>Tidak dapat terhubung ke server replay atau JKT48Connect. Periksa koneksi internet atau masukkan API Key di Pengaturan.</p>
        <button class="btn-action" style="margin-top:12px" onclick="loadReplays(true)">🔄 Coba Muat Ulang</button>
      </div>
    `;
  }
}

function renderReplaysGrid() {
  els.replayResultCounter.textContent = `Halaman ${state.page} • ${state.replays.length} Sesi`;

  if (state.replays.length === 0) {
    els.replaysGrid.innerHTML = `
      <div class="state-box">
        <h3>Tidak ada sesi replay yang cocok</h3>
        <p>Coba reset filter member atau pilih platform lain.</p>
      </div>
    `;
    return;
  }

  els.replaysGrid.innerHTML = state.replays
    .map((item, idx) => {
      const isIdn = item.platform === 'IDN';
      const isReady = item.playbackStatus === 'ready' || Boolean(item.streamUrl || item.youtubeId);
      const relTime = formatRelativeIndo(item.endedAt || item.startedAt);
      const dateStr = item.startedAt
        ? new Date(item.startedAt).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }) + ' WIB'
        : '';

      return `
        <article class="video-card" data-replay-idx="${idx}">
          <div class="thumb-wrap">
            <span class="platform-pill ${isIdn ? 'idn' : 'sr'}">${item.platform}</span>
            <span class="age-badge" style="background:${isReady ? 'rgba(5, 150, 105, 0.9)' : 'rgba(180, 83, 9, 0.88)'}">
              ${isReady ? '▶ Replay Siap' : '⏳ Baru Selesai'}
            </span>
            <img src="${escapeHtml(item.thumb || item.avatar)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
            ${item.durationSeconds ? `<span class="duration-badge">${formatSeconds(item.durationSeconds)}</span>` : ''}
          </div>
          <div class="card-body">
            <h3 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            <div class="card-meta">
              <span>📅 ${escapeHtml(dateStr)} (${escapeHtml(relTime)})</span>
              <span>👁 ${Number(item.viewers || 0).toLocaleString('id-ID')}</span>
            </div>
            <div class="card-actions">
              <button class="btn-action" data-play-idx="${idx}" style="flex:1">▶ Tonton</button>
              <button class="btn-action subtle" data-dl-idx="${idx}" title="Download Video Replay (.MP4)">⬇ Download</button>
              <button class="btn-action subtle" data-gift-idx="${idx}" title="Lihat Top Gifter, Download per Bagian & Screenshot">🎁 Rekap</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

els.replaysGrid.addEventListener('click', e => {
  const playBtn = e.target.closest('[data-play-idx]');
  if (playBtn) {
    const item = state.replays[Number(playBtn.dataset.playIdx)];
    if (item) openAndPlayJkcReplay(item, 'comments');
    return;
  }
  const dlBtn = e.target.closest('[data-dl-idx]');
  if (dlBtn) {
    const item = state.replays[Number(dlBtn.dataset.dlIdx)];
    if (item) openDownloadModal(item);
    return;
  }
  const giftBtn = e.target.closest('[data-gift-idx]');
  if (giftBtn) {
    const item = state.replays[Number(giftBtn.dataset.giftIdx)];
    if (item) openAndPlayJkcReplay(item, 'gifts');
    return;
  }
  const card = e.target.closest('[data-replay-idx]');
  if (card) {
    const item = state.replays[Number(card.dataset.replayIdx)];
    if (item) openAndPlayJkcReplay(item, 'comments');
  }
});

els.prevPageBtn.addEventListener('click', () => {
  if (state.page > 1) {
    state.page--;
    loadReplays();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

els.nextPageBtn.addEventListener('click', () => {
  state.page++;
  loadReplays();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

els.platformBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    state.platform = btn.dataset.platform;
    state.page = 1;
    els.platformBtns.forEach(b => b.classList.toggle('active', b === btn));
    loadReplays();
  });
});

els.searchForm.addEventListener('submit', e => {
  e.preventDefault();
  state.searchQuery = els.searchInput.value.trim();
  state.page = 1;
  els.clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
  switchTab('replays');
  loadReplays();
});

els.clearSearchBtn.addEventListener('click', () => {
  els.searchInput.value = '';
  state.searchQuery = '';
  state.page = 1;
  els.clearSearchBtn.classList.add('hidden');
  loadReplays();
});

els.refreshBtn.addEventListener('click', () => {
  showToast('Memperbarui data dari JKT48Connect...');
  loadNowLive(true);
  loadReplays(true);
  loadRecordings();
});

// ============================================================================
// 7. SEDANG LIVE MONITOR & TRIGGER RECORD
// ============================================================================
async function loadNowLive(force = false) {
  try {
    const res = await fetch(`/api/now-live?refresh=${force ? '1' : '0'}`, { credentials: 'same-origin' });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (res.ok && json && json.ok && Array.isArray(json.data)) {
      state.nowLive = json.data;
      els.liveCountBadge.textContent = state.nowLive.length;
      renderLiveMiniBanner();
      renderLiveGrid();
      return;
    }
  } catch (err) {
    console.warn('Server /api/now-live gagal, mencoba fallback direct:', err);
  }

  // Direct client fallback ke JKT48Connect
  try {
    const raw = await fetchJkcDirect('/api/now_live', { group: 'jkt48' });
    const list = Array.isArray(raw) ? raw : raw?.data || [];
    state.nowLive = list.map(item => {
      const isIdn =
        item.type === 'idn' ||
        (item.streaming_url_list?.[0]?.url || '').includes('live-video.net') ||
        (item.img || '').includes('idn.app') ||
        Boolean(item.chat_room_id);
      const streamUrls = (item.streaming_url_list || []).map(s => ({
        label: s.label || `${s.quality || 720}p`,
        quality: s.quality || 720,
        url: s.url
      }));
      return {
        id: `${isIdn ? 'idn' : 'sr'}_${item.room_id || item.url_key}_${item.slug || ''}`,
        name: item.name || item.url_key || 'Member JKT48',
        urlKey: item.url_key || '',
        slug: item.slug || '',
        roomId: item.room_id,
        dataId: item.data_id || item.notification_data_id || '',
        chatRoomId: item.chat_room_id || '',
        platform: isIdn ? 'IDN' : 'SHOWROOM',
        img: normalizeMediaUrlClient(item.img || item.img_alt || ''),
        avatar: normalizeMediaUrlClient(item.img_alt || item.img || ''),
        startedAt: item.started_at,
        streamUrls,
        bestStreamUrl: streamUrls[0]?.url || '',
        isRecording: false
      };
    });
    els.liveCountBadge.textContent = state.nowLive.length;
    renderLiveMiniBanner();
    renderLiveGrid();
  } catch (directErr) {
    if (state.authenticated) console.warn('Direct now_live fallback gagal:', directErr);
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
        <p>Aktifkan <strong>Bot Telegram</strong> di tab <strong>DVR &amp; Bot Telegram</strong> agar Anda langsung diberi kabar saat ada member mulai live!</p>
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
    const res = await apiFetch('/api/record/start', {
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
// 8. LOCAL DVR RECORDINGS MANAGER
// ============================================================================
async function loadRecordings() {
  try {
    const res = await apiFetch('/api/recordings');
    const json = await res.json();
    if (json.ok) {
      state.recordings = json.data || [];
      els.recCountBadge.textContent = state.recordings.length;
      renderRecordingsList();
    }
  } catch (err) {
    if (state.authenticated) console.error('Gagal memuat daftar rekaman lokal:', err);
  }
}

function renderRecordingsList() {
  if (state.recordings.length === 0) {
    els.recordingsList.innerHTML = `
      <div class="state-box">
        <h3>Belum ada rekaman lokal</h3>
        <p>Sistem Auto-Record di PC lokal akan otomatis merekam member pilihan Anda saat mereka mulai live.</p>
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
      await apiFetch('/api/record/stop', {
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
      await apiFetch(`/api/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast('Rekaman dihapus.');
      loadRecordings();
    });
  });
}

// ============================================================================
// 9. BOOTSTRAP: VERIFY SESSION BEFORE LOADING DATA
// ============================================================================
(async function bootstrap() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (json && json.ok && json.authenticated && json.user?.username) {
      if (json.apiKey) {
        state.apiKey = json.apiKey;
        try {
          localStorage.setItem(JKC_STORAGE_KEY, json.apiKey);
        } catch {}
      }
      await onAuthenticated(json.user.username);
      return;
    }
  } catch {}

  // If on localhost / local LAN, immediately authenticate
  if (isLocalhostEnv()) {
    await onAuthenticated('escha');
    return;
  }

  showLoginGate();
})();
