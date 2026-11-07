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
  toggleChatPanelBtn: document.getElementById('toggleChatPanelBtn'),
  playerRecordBtn: document.getElementById('playerRecordBtn'),
  playerDownloadMp4Btn: document.getElementById('playerDownloadMp4Btn'),
  closePlayerBtn: document.getElementById('closePlayerBtn'),
  ytPlayer: document.getElementById('ytPlayer'),
  hlsPlayer: document.getElementById('hlsPlayer'),
  playerFooterInfo: document.getElementById('playerFooterInfo'),

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
      const params = new URLSearchParams(opts);
      const res = await fetch(`/api/comments?${params.toString()}`);
      const json = await res.json();
      state.chatComments = json.comments || [];
      renderChatMessages(json);
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
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  els.hlsPlayer.pause();
  els.hlsPlayer.removeAttribute('src');
  els.ytPlayer.src = 'about:blank';
  els.playerPartSelect.classList.add('hidden');
  els.playerDownloadMp4Btn.classList.add('hidden');
}

function attachHlsOrMp4ToVideo(url) {
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  if (url.endsWith('.mp4')) {
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
    const res = await fetch(`/api/replays/${encodeURIComponent(item.dataId)}`);
    const json = await res.json();
    if (!json.ok || !json.data) {
      showToast(`Gagal memuat detail: ${json.error || 'Unknown error'}`);
      return;
    }

    const d = json.data;
    destroyHls();
    els.playerSection.classList.remove('hidden');
    switchSideTab(defaultSideTab);

    const isIdn = d.platform === 'IDN';
    els.playerPlatformBadge.className = `platform-pill ${isIdn ? 'idn' : 'sr'}`;
    els.playerPlatformBadge.textContent = `${d.platform} REPLAY`;
    els.playerTitle.textContent = d.title;
    els.playerQualitySelect.classList.add('hidden');
    els.playerRecordBtn.classList.add('hidden');

    // Render Side Panel Subtab 2: Top Gifter & Gifts
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

    // Tentukan sumber video (R2 HLS m3u8 / R2 MP4 / YouTube Unlisted)
    const recs = d.recordings || [];
    const mainM3u8 = d.combinedStreamUrl || item.streamUrl || recs[0]?.streamUrl || '';
    const firstMp4 = recs[0]?.mp4Url || '';

    if (firstMp4) {
      els.playerDownloadMp4Btn.href = firstMp4;
      els.playerDownloadMp4Btn.classList.remove('hidden');
    }

    // Jika ada beberapa bagian (parts), tampilkan pemilih bagian
    if (recs.length > 1) {
      els.playerPartSelect.classList.remove('hidden');
      els.playerPartSelect.innerHTML =
        `<option value="combined">Semua Bagian (Gabungan)</option>` +
        recs
          .map(
            (r, i) =>
              `<option value="${i}">Bagian ${r.part} (${formatSeconds(r.durationSeconds)})</option>`
          )
          .join('');
      els.playerPartSelect.onchange = e => {
        const val = e.target.value;
        if (val === 'combined' && mainM3u8) {
          attachHlsOrMp4ToVideo(mainM3u8);
        } else {
          const chosen = recs[Number(val)] || recs[0];
          if (chosen.mp4Url) els.playerDownloadMp4Btn.href = chosen.mp4Url;
          attachHlsOrMp4ToVideo(chosen.streamUrl || chosen.mp4Url);
        }
      };
    }

    if (mainM3u8 || firstMp4) {
      els.ytPlayer.classList.add('hidden');
      els.hlsPlayer.classList.remove('hidden');
      attachHlsOrMp4ToVideo(mainM3u8 || firstMp4);
    } else if (d.youtubeId) {
      els.hlsPlayer.classList.add('hidden');
      els.ytPlayer.classList.remove('hidden');
      els.ytPlayer.src = `https://www.youtube.com/embed/${encodeURIComponent(d.youtubeId)}?autoplay=1&rel=0`;
    } else {
      els.hlsPlayer.classList.add('hidden');
      els.ytPlayer.classList.add('hidden');
      showToast('Video replay sesi ini masih sedang diproses oleh server R2 JKT48Connect.');
    }

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

  els.sideGiftsContent.innerHTML = `
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
    const res = await fetch(`/api/replays?${params.toString()}`);
    const json = await res.json();
    if (json.quota && json.quota.limit) {
      els.jkcQuotaBadge.textContent = `Kuota API: ${json.quota.remaining}/${json.quota.limit}`;
    }
    state.replays = json.data || [];
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
              <button class="btn-action" data-play-idx="${idx}" style="flex:1">▶ Tonton + Chat</button>
              <button class="btn-action subtle" data-gift-idx="${idx}" title="Lihat Top Gifter & Screenshot">🎁 Rekap</button>
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
