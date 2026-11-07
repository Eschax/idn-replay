// ============================================================================
// JKT48 Replay & DVR Studio (100% Powered by JKT48Connect API + Local DVR)
// ============================================================================

const state = {
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
    hasApiKey: true,
    maskedApiKey: ''
  },
  oshiSearchFilter: '',
  hlsInstance: null,
  currentPlayingLive: null,
  currentPlayingReplay: null,
  currentPartIdx: 0,
  playerEngine: 'cinema',
  mediaSourceAbort: null,
  mediaSourceObjectUrl: null,
  chatVisible: true,
  activeSideTab: 'comments',
  chatComments: [],
  chatMode: 'session',
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
  ytPlayer: document.getElementById('ytPlayer'),
  hlsPlayer: document.getElementById('hlsPlayer'),
  playerFooterInfo: document.getElementById('playerFooterInfo'),

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
  refreshCommentsBtn: document.getElementById('refreshCommentsBtn'),
  chatMessagesList: document.getElementById('chatMessagesList'),
  sideGiftsContent: document.getElementById('sideGiftsContent'),
  sideScreenshotsContent: document.getElementById('sideScreenshotsContent'),

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

  // Recordings & Settings Tab
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

// ============================================================================
// 0. DIRECT BROWSER JKT48CONNECT CLIENT & MP4 DOWNLOAD HELPER
// ============================================================================
const JKC_CLIENT_KEY = 'jkc_82a84efebf4b67b73fa0c20b7096ea8de1e336c8';

function normalizeMediaUrlClient(url) {
  if (!url) return '';
  return String(url).replace('https://api.jkt48connect.app:8443/', 'https://api.jkt48connect.app/');
}

function isLocalhostEnv() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.');
}

function buildDownloadMp4Href(mp4Url, titleStr, partNum = 1) {
  const cleanUrl = normalizeMediaUrlClient(mp4Url);
  if (!cleanUrl) return '#';
  const safeName = `${String(titleStr || 'JKT48_Replay').replace(/[^a-zA-Z0-9_-]/g, '_')}_Part${partNum}`;
  if (isLocalhostEnv()) {
    return `/api/download-mp4?url=${encodeURIComponent(cleanUrl)}&name=${encodeURIComponent(safeName)}`;
  }
  return cleanUrl;
}

async function fetchJkcDirect(endpointPath, params = {}) {
  const u = new URL(endpointPath, 'https://api.jkt48connect.app');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  u.searchParams.set('api_key', JKC_CLIENT_KEY);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
    youtubeUrl: item.playback?.youtube_url || ytVideos[0]?.url || null
  };
}

function formatReplayDetailClient(d) {
  const base = formatRecentItemClient({ ...d, member: d.member || d.room_info });
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
        giftMap.get(key).num += g.num || 1;
      }
    }
    giftItems = [...giftMap.values()].sort((a, b) => b.point * b.num - a.point * a.num);
  }
  const fans = (d.fans || d.users || []).slice(0, 30).map((f, idx) => ({
    rank: f.rank || idx + 1,
    id: f.id,
    name: f.name || 'Fan',
    avatar: normalizeMediaUrlClient(
      f.avatar_url ||
        (f.avatar_id
          ? `https://image.showroom-cdn.com/showroom-prod/image/avatar/${f.avatar_id}.png`
          : '')
    ),
    score: f.gold ?? f.reported_gold ?? f.point ?? f.points ?? 0
  }));
  const ss = d.live_info?.screenshot;
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

async function getReplayDetailWithFallback(dataId) {
  try {
    const res = await fetch(`/api/replays/${encodeURIComponent(dataId)}`);
    const json = await res.json();
    if (json.ok && json.data) return json.data;
  } catch {}
  const raw = await fetchJkcDirect(`/api/recent/${encodeURIComponent(dataId)}`);
  return formatReplayDetailClient(raw);
}

async function openDownloadModal(item) {
  els.downloadModal.classList.remove('hidden');
  els.dlModalTitle.textContent = `⬇ Download: ${item.nickname || item.memberName}`;
  els.dlModalSubtitle.textContent = item.title || 'Memuat link rekaman...';
  els.dlModalBody.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:16px;text-align:center">Menyiapkan file rekaman...</div>`;

  try {
    const d = await getReplayDetailWithFallback(item.dataId);
    const recs = (d.recordings || []).filter(r => r.mp4Url);
    if (recs.length === 0) {
      els.dlModalBody.innerHTML = `
        <div style="color:var(--text-muted);font-size:13px;padding:16px;text-align:center">
          Rekaman MP4 belum tersedia untuk sesi ini (masih dalam pemrosesan server R2).
        </div>
      `;
      return;
    }

    const isLocal = isLocalhostEnv();
    els.dlModalBody.innerHTML = `
      <div style="font-size:12.5px;color:var(--text-muted);line-height:1.5">
        ${isLocal 
          ? 'Karena Anda membuka dari <strong>localhost</strong>, klik tombol di bawah untuk langsung mengunduh file video ke PC Anda.' 
          : 'File rekaman disimpan langsung di Cloudflare R2 JKT48Connect. Klik tombol di bawah untuk mengunduh:'}
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        ${recs.map((r, i) => {
          const directUrl = r.mp4Url + (r.mp4Url.includes('?') ? '&' : '?') + 'v=2';
          const localUrl = `/api/download-mp4?url=${encodeURIComponent(r.mp4Url)}&name=${encodeURIComponent(`${(d.nickname || 'JKT48').replace(/[^a-zA-Z0-9_-]/g, '_')}_Part${r.part}`)}`;
          const playerUrl = r.playerUrl || (r.run ? `https://api.jkt48connect.app/replay/${d.dataId}/${r.run}` : '');
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
                ${isLocal ? `
                  <a class="btn-action" href="${escapeHtml(localUrl)}" style="flex:1;text-align:center;text-decoration:none">
                    ⬇ Download Langsung (.mp4)
                  </a>
                ` : `
                  <a class="btn-action" href="${escapeHtml(directUrl)}" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none">
                    ⬇ Buka / Download MP4
                  </a>
                  ${playerUrl ? `
                    <a class="btn-action subtle" href="${escapeHtml(playerUrl)}" target="_blank" rel="noopener" style="text-decoration:none">
                      ↗ Halaman Unduh Resmi
                    </a>
                  ` : ''}
                `}
              </div>
              ${!isLocal ? `
                <div style="font-size:11px;color:var(--text-muted)">
                  💡 <em>Tips di HP / Browser: Jika video memutar bukannya mengunduh, tahan tombol di atas lalu pilih <strong>"Download link"</strong> (atau di player video klik ⋮ &rarr; Download).</em>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    els.dlModalBody.innerHTML = `<div style="color:var(--accent);font-size:13px;padding:16px">Gagal memuat link download: ${escapeHtml(err.message)}</div>`;
  }
}

async function triggerDirectDownloadForReplay(item) {
  openDownloadModal(item);
}

// ============================================================================
// 1. TAB & SIDE-PANEL NAVIGATION
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
// 2. SYNCHRONIZED COMMENTS & LIVE CHAT PANEL
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
  state.chatMode = opts.mode || 'session';
  els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px">Memuat komentar...</div>`;

  const fetchOnce = async () => {
    try {
      let comments = [];
      let sourceLabel = 'JKT48Connect';
      try {
        const params = new URLSearchParams(opts);
        const res = await fetch(`/api/comments?${params.toString()}`);
        const json = await res.json();
        if (Array.isArray(json.comments) && json.comments.length > 0) {
          comments = json.comments;
          sourceLabel = json.source || 'JKT48Connect';
        }
      } catch {}

      if (comments.length === 0 && opts.mode !== 'local') {
        const endpoint =
          opts.platform === 'IDN' && opts.dataId
            ? `/api/idn-comments/${encodeURIComponent(opts.dataId)}`
            : opts.roomId
              ? `/api/showroom-comments/${encodeURIComponent(opts.roomId)}`
              : '';
        if (endpoint) {
          const raw = await fetchJkcDirect(endpoint);
          const rawList = Array.isArray(raw?.comments) ? raw.comments : [];
          const startMs = opts.startedAt ? Date.parse(opts.startedAt) : 0;
          const firstStr = rawList[0]?.source_time || rawList[0]?.observed_at || '';
          const baseMs = startMs || (firstStr ? Date.parse(firstStr) : 0);
          comments = rawList.map(c => {
            const tStr = c.source_time || c.observed_at || '';
            const tMs = tStr ? Date.parse(tStr) : 0;
            return {
              id: c.id || String(c.sequence || Math.random()),
              user: c.user?.name || 'Fans',
              avatar: c.user?.avatar_url || '',
              text: c.comment || '',
              time: tStr,
              offsetSeconds: baseMs > 0 && tMs >= baseMs ? Math.round((tMs - baseMs) / 1000) : undefined
            };
          });
        }
      }

      state.chatComments = comments;
      renderChatMessages({ source: sourceLabel });
    } catch {
      els.chatMessagesList.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px">Gagal memuat komentar.</div>`;
    }
  };

  await fetchOnce();

  if (opts.isLive) {
    state.chatPollTimer = setInterval(fetchOnce, 4500);
  }

  els.refreshCommentsBtn.onclick = fetchOnce;
}

function renderChatMessages(meta = {}) {
  els.chatPanelSub.textContent = `${state.chatComments.length} komentar (${meta.source || 'JKT48Connect'})`;

  if (state.chatComments.length === 0) {
    els.chatMessagesList.innerHTML = `
      <div style="color:var(--text-muted);font-size:12.5px;padding:14px;line-height:1.5">
        Belum ada log komentar untuk sesi ini (buffer komentar JKT48Connect menyimpan hingga 24 jam terakhir, sedangkan rekaman DVR lokal menyimpan komentar secara permanen).
      </div>
    `;
    return;
  }

  els.chatMessagesList.innerHTML = state.chatComments
    .map((c, idx) => {
      const hasOffset = typeof c.offsetSeconds === 'number' && c.offsetSeconds >= 0;
      const timeBadge = hasOffset
        ? `<span class="chat-time-tag" data-seek-sec="${c.offsetSeconds}">[${formatSeconds(c.offsetSeconds)}]</span>`
        : c.time
          ? `<span style="color:var(--text-muted);font-size:10px;margin-right:5px">${escapeHtml(new Date(c.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</span>`
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
}

els.hlsPlayer.addEventListener('timeupdate', () => {
  if (!state.chatComments.length) return;
  const cur = els.hlsPlayer.currentTime;
  const nodes = els.chatMessagesList.querySelectorAll('.chat-msg');
  let lastActiveNode = null;
  nodes.forEach(node => {
    const offset = Number(node.dataset.offset);
    const isCurrent = offset >= 0 && offset <= cur && cur - offset <= 8;
    node.classList.toggle('active-sync', isCurrent);
    if (isCurrent) lastActiveNode = node;
  });
  if (lastActiveNode && state.activeSideTab === 'comments') {
    lastActiveNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// ============================================================================
// 3. CINEMA PLAYER (R2 HLS / MP4 + PART SELECTOR + GIFTS & SCREENSHOTS)
// ============================================================================
function destroyHls() {
  stopChatPolling();
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
  els.hlsPlayer.pause();
  els.hlsPlayer.removeAttribute('src');
  els.ytPlayer.src = 'about:blank';
  els.playerPartSelect.classList.add('hidden');
  els.playerDownloadMp4Btn.classList.add('hidden');
  els.switchPlayerEngineBtn.classList.add('hidden');
}

async function startMediaSourceStream(video, source, signal) {
  if (!window.MediaSource) {
    throw new Error('MediaSource not supported');
  }
  if (state.mediaSourceObjectUrl) {
    URL.revokeObjectURL(state.mediaSourceObjectUrl);
    state.mediaSourceObjectUrl = null;
  }
  const media = new MediaSource();
  state.mediaSourceObjectUrl = URL.createObjectURL(media);
  video.src = state.mediaSourceObjectUrl;

  await new Promise(resolve => media.addEventListener('sourceopen', resolve, { once: true }));
  const response = await fetch(source, { signal });
  if (!response.ok) throw Error('media_http_' + response.status);

  const reader = response.body.getReader();
  let chunk = new Uint8Array(), position = 0;
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

  let init = new Uint8Array(), buffer, pending;
  const append = bytes => new Promise((resolve, reject) => {
    const clean = () => {
      buffer.removeEventListener('updateend', done);
      buffer.removeEventListener('error', failed);
    };
    const done = () => { clean(); resolve(); };
    const failed = () => { clean(); reject(Error('media_append_failed')); };
    buffer.addEventListener('updateend', done);
    buffer.addEventListener('error', failed);
    buffer.appendBuffer(bytes);
  });

  while (!signal.aborted) {
    const head = await read(8);
    if (!head) break;
    const size = new DataView(head.buffer).getUint32(0);
    const kind = String.fromCharCode(...head.subarray(4));
    if (size < 8 || size > 33554432) throw Error('media_box_invalid');
    const body = await read(size - 8);
    if (!body) throw Error('media_truncated');
    const box = join(head, body);

    if (kind === 'ftyp') {
      init = box;
    } else if (kind === 'moov') {
      let codec;
      for (let i = 0; i < box.length - 8; i++) {
        if (String.fromCharCode(...box.subarray(i, i + 4)) === 'avcC') {
          codec = 'avc1.' + Array.from(box.subarray(i + 5, i + 8), b => b.toString(16).padStart(2, '0')).join('');
          break;
        }
      }
      if (!codec) throw Error('media_codec_missing');
      const audio = String.fromCharCode(...box).includes('mp4a');
      const mime = 'video/mp4; codecs="' + codec + (audio ? ',mp4a.40.2' : '') + '"';
      if (!MediaSource.isTypeSupported(mime)) {
        await reader.cancel();
        throw Error('mime_not_supported');
      }
      buffer = media.addSourceBuffer(mime);
      await append(join(init, box));
      for (let i = 0; i < box.length - 32; i++) {
        if (String.fromCharCode(...box.subarray(i, i + 4)) === 'mvhd') {
          const v = new DataView(box.buffer);
          const version = box[i + 4];
          const scale = v.getUint32(i + (version === 1 ? 24 : 16));
          const duration = version === 1 ? Number(v.getBigUint64(i + 28)) : v.getUint32(i + 20);
          if (scale && duration) media.duration = duration / scale;
          break;
        }
      }
    } else if (kind === 'moof') {
      pending = box;
    } else if (kind === 'mdat' && pending && buffer) {
      while (buffer.buffered.length && buffer.buffered.end(buffer.buffered.length - 1) - video.currentTime > 45 && !signal.aborted) {
        await new Promise(r => setTimeout(r, 250));
      }
      if (signal.aborted) break;
      if (video.currentTime > 120 && buffer.buffered.length && buffer.buffered.start(0) < video.currentTime - 90) {
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

function attachHlsOrMp4ToVideo(url) {
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  if (!url) return;
  if (url.includes('.mp4')) {
    els.hlsPlayer.src = url;
    els.hlsPlayer.play().catch(() => {});
    return;
  }
  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    state.hlsInstance = hls;
    hls.loadSource(url);
    hls.attachMedia(els.hlsPlayer);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      els.hlsPlayer.play().catch(() => {});
    });
  } else if (els.hlsPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    els.hlsPlayer.src = url;
    els.hlsPlayer.play().catch(() => {});
  }
}

async function openAndPlayJkcReplay(item, defaultSideTab = 'comments') {
  showToast(`Memuat stream & detail ${item.nickname}...`);
  try {
    const d = await getReplayDetailWithFallback(item.dataId);
    destroyHls();
    state.currentPlayingReplay = d;
    state.currentPartIdx = 0;
    els.playerSection.classList.remove('hidden');
    switchSideTab(defaultSideTab);

    const isIdn = d.platform === 'IDN';
    els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
    els.playerPlatformBadge.textContent = `${d.platform} REPLAY`;
    els.playerTitle.textContent = d.title;
    els.playerQualitySelect.classList.add('hidden');
    els.playerRecordBtn.classList.add('hidden');

    // Render Side Panel Subtab 2: Top Gifter, Gifts & Daftar Download MP4
    renderSideGiftsAndFans(d);
    // Render Side Panel Subtab 3: Screenshots & Leaderboard
    renderSideScreenshotsAndLeaderboard(d);

    // Load Komentar untuk sesi ini (dengan perhitungan offset dari waktu mulai rekaman pertama)
    const refStart = d.recordings?.[0]?.startedAt || d.startedAt || '';
    loadCommentsForPlayer({
      mode: 'session',
      platform: d.platform,
      roomId: d.roomId || '',
      dataId: d.dataId || '',
      startedAt: refStart
    });

    const recs = d.recordings || [];

    // Setup tombol download modal
    els.playerDownloadMp4Btn.classList.remove('hidden');
    els.playerDownloadMp4Btn.onclick = () => openDownloadModal(d);

    // Setup tombol ganti engine player (Cinema / Official)
    els.switchPlayerEngineBtn.classList.remove('hidden');
    const updateSwitchEngineLabel = () => {
      els.switchPlayerEngineBtn.textContent =
        state.playerEngine === 'cinema' ? '🎬 Mode Player Asli' : '⚡ Mode Cinema (Sync Chat)';
    };
    updateSwitchEngineLabel();
    els.switchPlayerEngineBtn.onclick = () => {
      state.playerEngine = state.playerEngine === 'cinema' ? 'official' : 'cinema';
      updateSwitchEngineLabel();
      playPart(state.currentPartIdx);
    };

    // Setup pemilih bagian jika multi-part
    if (recs.length > 1) {
      els.playerPartSelect.classList.remove('hidden');
      els.playerPartSelect.innerHTML = recs
        .map(
          (r, i) =>
            `<option value="${i}">Bagian ${r.part} (${formatSeconds(r.durationSeconds)}${r.sizeBytes ? ' • ' + formatBytes(r.sizeBytes) : ''})</option>`
        )
        .join('');
      els.playerPartSelect.onchange = e => {
        const idx = Number(e.target.value) || 0;
        playPart(idx);
      };
    } else {
      els.playerPartSelect.classList.add('hidden');
    }

    async function playPart(idx) {
      state.currentPartIdx = idx;
      if (recs.length > 1) {
        els.playerPartSelect.value = String(idx);
      }
      const chosen = recs[idx] || recs[0];
      if (!chosen) {
        if (d.youtubeId) {
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

      if (state.playerEngine === 'official' && playerUrl) {
        if (state.mediaSourceAbort) {
          state.mediaSourceAbort.abort();
          state.mediaSourceAbort = null;
        }
        els.hlsPlayer.pause();
        els.hlsPlayer.classList.add('hidden');
        els.ytPlayer.classList.remove('hidden');
        els.ytPlayer.src = playerUrl;
        return;
      }

      // Default: Mode Cinema Player (MediaSource chunked streaming reader)
      els.ytPlayer.classList.add('hidden');
      els.ytPlayer.src = 'about:blank';
      els.hlsPlayer.classList.remove('hidden');

      if (state.mediaSourceAbort) {
        state.mediaSourceAbort.abort();
        state.mediaSourceAbort = null;
      }
      const abortCtrl = new AbortController();
      state.mediaSourceAbort = abortCtrl;

      const mp4Url = chosen.mp4Url
        ? chosen.mp4Url + (chosen.mp4Url.includes('?') ? '&' : '?') + 'v=2'
        : '';

      els.hlsPlayer.onended = () => {
        if (state.currentPartIdx + 1 < recs.length) {
          showToast(`Lanjut memutar Bagian ${recs[state.currentPartIdx + 1].part}...`);
          playPart(state.currentPartIdx + 1);
        }
      };

      try {
        if (!mp4Url) throw new Error('No MP4 URL');
        await startMediaSourceStream(els.hlsPlayer, mp4Url, abortCtrl.signal);
        els.hlsPlayer.play().catch(() => {});
      } catch (err) {
        if (abortCtrl.signal.aborted) return;
        console.warn('Cinema player fallback ke official embed:', err);
        if (playerUrl) {
          state.playerEngine = 'official';
          updateSwitchEngineLabel();
          els.hlsPlayer.classList.add('hidden');
          els.ytPlayer.classList.remove('hidden');
          els.ytPlayer.src = playerUrl;
        } else if (mp4Url) {
          els.hlsPlayer.src = mp4Url;
          els.hlsPlayer.play().catch(() => {});
        }
      }
    }

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

    els.playerFooterInfo.innerHTML = `
      <span>📅 Waktu Live: <strong>${escapeHtml(dateLabel)}</strong> • Durasi: <strong>${formatSeconds(d.durationSeconds)}</strong></span>
      <span>👁 Penonton: <strong>${Number(d.viewers || 0).toLocaleString('id-ID')}</strong> • 🎁 Total ${d.pointUnit === 'idn_gold' ? 'Gold' : 'Poin'}: <strong>${Number(d.goldSummary?.total_gold || d.points || 0).toLocaleString('id-ID')}</strong></span>
    `;

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
// 4. MEMBERS & OSHI / AUTO-RECORD CONFIGURATION
// ============================================================================
async function loadMembers() {
  try {
    let list = [];
    try {
      const res = await fetch('/api/members');
      const json = await res.json();
      if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
        list = json.data;
      }
    } catch {}

    if (list.length === 0) {
      const raw = await fetchJkcDirect('/api/member', { group: 'jkt48' });
      const arr = Array.isArray(raw) ? raw : raw?.members || [];
      list = arr
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
    }

    state.members = list;
    renderMemberChips();
    renderOshiPanel();
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
      state.page = 1;
      renderMemberChips();
      loadReplays();
    });
  });
}

els.resetMemberBtn.addEventListener('click', () => {
  state.selectedMember = '';
  state.page = 1;
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

// ============================================================================
// 5. REPLAY LIVE (100% FROM JKT48CONNECT /api/recent)
// ============================================================================
async function loadReplays(force = false) {
  els.replaysGrid.innerHTML = `
    <div class="state-box">
      <h3>Sedang mengambil daftar Replay dari JKT48Connect...</h3>
      <p>Memuat rekaman R2 IDN Live &amp; Showroom beserta rekap gift dan komentar.</p>
    </div>
  `;

  try {
    const params = new URLSearchParams({
      page: String(state.page),
      perpage: '24',
      q: state.searchQuery,
      member: state.selectedMember,
      platform: state.platform,
      refresh: force ? '1' : '0'
    });
    let items = [];
    try {
      const res = await fetch(`/api/replays?${params.toString()}`);
      const json = await res.json();
      if (json.quota && json.quota.limit) {
        els.jkcQuotaBadge.textContent = `Kuota API: ${json.quota.remaining}/${json.quota.limit}`;
      }
      if (Array.isArray(json.data) && json.data.length > 0) {
        items = json.data;
      }
    } catch {}

    // Fallback langsung dari browser ke api.jkt48connect.app jika di Netlify IP cloud diblokir
    if (items.length === 0) {
      const typeParam =
        state.platform === 'IDN' ? 'idn' : state.platform === 'SHOWROOM' ? 'showroom' : 'all';
      const hasFilter = Boolean(state.selectedMember.trim() || state.searchQuery.trim());
      const raw = await fetchJkcDirect('/api/recent', {
        page: state.page,
        perpage: hasFilter ? 60 : 24,
        group: 'jkt48',
        type: typeParam,
        sort: 'date',
        order: '-1'
      });
      const rawList = Array.isArray(raw?.recents) ? raw.recents : Array.isArray(raw) ? raw : [];
      items = rawList.map(formatRecentItemClient);
      if (state.selectedMember.trim()) {
        const mLower = state.selectedMember.trim().toLowerCase();
        items = items.filter(
          it =>
            it.nickname.toLowerCase().includes(mLower) ||
            it.memberName.toLowerCase().includes(mLower) ||
            it.title.toLowerCase().includes(mLower)
        );
      }
      if (state.searchQuery.trim()) {
        const qLower = state.searchQuery.trim().toLowerCase();
        items = items.filter(
          it =>
            it.title.toLowerCase().includes(qLower) ||
            it.memberName.toLowerCase().includes(qLower) ||
            it.nickname.toLowerCase().includes(qLower)
        );
      }
    }

    state.replays = items;
    renderReplaysGrid();

    const hasFilter = Boolean(state.selectedMember || state.searchQuery);
    els.prevPageBtn.classList.toggle('hidden', state.page <= 1 || hasFilter);
    els.nextPageBtn.classList.toggle('hidden', state.replays.length < 20 || hasFilter);
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
              ${isReady ? '▶ Replay Siap' : '⏳ Diproses'}
            </span>
            <img src="${escapeHtml(item.thumb || item.avatar)}" alt="${escapeHtml(item.title)}" loading="lazy" />
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

  els.replaysGrid.querySelectorAll('[data-play-idx]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.replays[Number(btn.dataset.playIdx)];
      if (item) openAndPlayJkcReplay(item, 'comments');
    });
  });

  els.replaysGrid.querySelectorAll('[data-dl-idx]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.replays[Number(btn.dataset.dlIdx)];
      if (item) triggerDirectDownloadForReplay(item);
    });
  });

  els.replaysGrid.querySelectorAll('[data-gift-idx]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = state.replays[Number(btn.dataset.giftIdx)];
      if (item) openAndPlayJkcReplay(item, 'gifts');
    });
  });

  els.replaysGrid.querySelectorAll('[data-replay-idx]').forEach(card => {
    card.addEventListener('click', () => {
      const item = state.replays[Number(card.dataset.replayIdx)];
      if (item) openAndPlayJkcReplay(item, 'comments');
    });
  });
}

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
// 6. SEDANG LIVE MONITOR & TRIGGER RECORD
// ============================================================================
async function loadNowLive(force = false) {
  try {
    let list = null;
    try {
      const res = await fetch(`/api/now-live?refresh=${force ? '1' : '0'}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
        list = json.data;
      }
    } catch {}

    if (!list) {
      try {
        const raw = await fetchJkcDirect('/api/now_live', { group: 'jkt48' });
        const arr = Array.isArray(raw) ? raw : raw?.data || [];
        list = arr.map(item => {
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
            platform: isIdn ? 'IDN' : 'SHOWROOM',
            img: normalizeMediaUrlClient(item.img || item.img_alt || ''),
            avatar: normalizeMediaUrlClient(item.img_alt || item.img || ''),
            startedAt: item.started_at,
            streamUrls,
            bestStreamUrl: streamUrls[0]?.url || '',
            isRecording: false
          };
        });
      } catch {
        list = [];
      }
    }

    state.nowLive = list || [];
    els.liveCountBadge.textContent = state.nowLive.length;
    renderLiveMiniBanner();
    renderLiveGrid();
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
        <p>Semua rekaman yang baru saja selesai bisa langsung ditonton di tab <strong>Replay Live</strong>.</p>
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
// 7. LOCAL DVR RECORDINGS MANAGER
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
        <p>Sistem Auto-Record akan otomatis merekam member pilihan Anda saat mereka mulai live.</p>
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
// 8. INITIALIZATION & PERIODIC POLLING
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
