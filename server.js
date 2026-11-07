const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
);
const PORT = process.env.PORT || 3048;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'jkt48-data') : path.join(__dirname, 'data');
const RECORDINGS_DIR = IS_SERVERLESS ? path.join('/tmp', 'jkt48-recordings') : path.join(__dirname, 'recordings');

for (const dir of [DATA_DIR, RECORDINGS_DIR]) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

const OSHI_CONFIG_FILE = path.join(DATA_DIR, 'oshi_config.json');
const RECORDINGS_META_FILE = path.join(DATA_DIR, 'recordings.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const JKT48CONNECT_BASE = 'https://api.jkt48connect.app';
const DEFAULT_JKC_API_KEY =
  process.env.JKT48CONNECT_API_KEY || 'jkc_82a84efebf4b67b73fa0c20b7096ea8de1e336c8';

// ============================================================================
// 1. STATE & PERSISTENCE
// ============================================================================
function loadJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`[WARN] Gagal membaca ${filePath}:`, err.message);
  }
  return fallback;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[WARN] Gagal menyimpan ${filePath}:`, err.message);
  }
}

let appConfig = loadJson(OSHI_CONFIG_FILE, {
  autoRecordEnabled: true,
  autoRecordMode: 'oshi',
  oshiList: ['Aralie', 'Delynn', 'Erine', 'Lily', 'Michie', 'Trisha'],
  jkt48ConnectApiKey: DEFAULT_JKC_API_KEY
});

if (!appConfig.jkt48ConnectApiKey) {
  appConfig.jkt48ConnectApiKey = DEFAULT_JKC_API_KEY;
}
if (!appConfig.autoRecordMode) {
  appConfig.autoRecordMode = 'oshi';
}
saveJson(OSHI_CONFIG_FILE, appConfig);

let recordingsMeta = loadJson(RECORDINGS_META_FILE, []);
const activeRecorders = new Map();
const finishedStreamUrls = new Set();

// Bersihkan rekaman kosong (0 segmen) dan tandai yang masih menggantung sebagai completed
recordingsMeta = recordingsMeta.filter(rec => {
  if (!rec.segmentCount || rec.segmentCount <= 0) {
    try {
      const f = path.join(RECORDINGS_DIR, rec.id);
      if (fs.existsSync(f)) fs.rmSync(f, { recursive: true, force: true });
    } catch {}
    return false;
  }
  if (rec.status === 'recording') {
    rec.status = 'completed';
    rec.endedAt = rec.endedAt || new Date().toISOString();
  }
  return true;
});
saveJson(RECORDINGS_META_FILE, recordingsMeta);

function getApiKey() {
  const netlifyKey =
    typeof globalThis.Netlify !== 'undefined' && globalThis.Netlify.env
      ? globalThis.Netlify.env.get('JKT48CONNECT_API_KEY')
      : '';
  return (appConfig.jkt48ConnectApiKey || netlifyKey || process.env.JKT48CONNECT_API_KEY || DEFAULT_JKC_API_KEY).trim();
}

function isValidRecId(recId) {
  return typeof recId === 'string' && /^rec_[a-z0-9_-]+$/i.test(recId);
}

const ALLOWED_STREAM_HOSTS = [
  'live-video.net',
  'idn.app',
  'idn.media',
  'showroom-live.com',
  'showroom-cdn.com',
  'jkt48connect.app',
  'cloudflarestorage.com',
  'r2.dev',
  'akamaized.net',
  'cloudfront.net'
];

function isAllowedStreamUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_STREAM_HOSTS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function normalizeMediaUrl(url) {
  if (!url) return '';
  return String(url).replace('https://api.jkt48connect.app:8443/', 'https://api.jkt48connect.app/');
}

// ============================================================================
// 2. JKT48CONNECT API CLIENT (WITH SHORT CACHE TO SAVE QUOTA)
// ============================================================================
const apiCache = new Map();
let lastQuotaInfo = { limit: null, remaining: null, period: null };

async function fetchJkt48Connect(endpointPath, searchParams = {}, ttlMs = 20000, force = false) {
  const apiKey = getApiKey();
  const url = new URL(endpointPath, JKT48CONNECT_BASE);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }
  const cacheKey = url.toString();
  const now = Date.now();
  if (!force && ttlMs > 0 && apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (now - cached.at < ttlMs) {
      return cached.result;
    }
  }

  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    'X-API-Key': apiKey
  };
  if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

  const res = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(14000)
  });

  const limit = res.headers.get('x-ratelimit-limit');
  const remaining = res.headers.get('x-ratelimit-remaining');
  const period = res.headers.get('x-quota-period');
  if (limit) {
    lastQuotaInfo = { limit, remaining, period };
  }

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  const result = {
    ok: res.ok,
    status: res.status,
    body,
    quota: lastQuotaInfo
  };

  if (res.ok && ttlMs > 0) {
    if (apiCache.size >= 200) apiCache.delete(apiCache.keys().next().value);
    apiCache.set(cacheKey, { at: now, result });
  }
  return result;
}

// ============================================================================
// 3. MEMBERS DIRECTORY (FROM JKT48CONNECT /api/member)
// ============================================================================
let membersCache = { data: null, updatedAt: 0 };

async function getMembers() {
  const now = Date.now();
  if (membersCache.data && now - membersCache.updatedAt < 30 * 60 * 1000) {
    return membersCache.data;
  }
  try {
    const res = await fetchJkt48Connect('/api/member', { group: 'jkt48' }, 1800000);
    const raw = Array.isArray(res.body) ? res.body : res.body?.members || [];
    if (Array.isArray(raw) && raw.length > 0) {
      const active = raw
        .filter(m => !m.is_graduate && (!m.group || m.group === 'jkt48'))
        .map(m => ({
          id: m._id || m.url || m.name,
          name: m.name,
          nicknames: m.nicknames?.length
            ? m.nicknames
            : m.nickname
              ? [m.nickname]
              : [m.name.split(' ')[0]],
          img: normalizeMediaUrl(m.img_alt || m.img || ''),
          url: m.url || '',
          generation: m.generation || ''
        }))
        .sort((a, b) => (a.nicknames[0] || a.name).localeCompare(b.nicknames[0] || b.name));
      membersCache = { data: active, updatedAt: now };
      return active;
    }
  } catch (err) {
    console.warn('[WARN] Gagal mengambil member dari JKT48Connect:', err.message);
  }
  return membersCache.data || [];
}

// ============================================================================
// 4. NOW LIVE (FROM JKT48CONNECT /api/now_live)
// ============================================================================
let nowLiveCache = { data: [], updatedAt: 0 };

async function getNowLive(force = false) {
  const now = Date.now();
  if (!force && now - nowLiveCache.updatedAt < 18 * 1000) {
    return nowLiveCache.data;
  }
  try {
    const res = await fetchJkt48Connect('/api/now_live', { group: 'jkt48' }, 15000, force);
    const raw = Array.isArray(res.body) ? res.body : res.body?.data || [];
    if (Array.isArray(raw)) {
      const formatted = raw.map(item => {
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
        const dataId = item.data_id || item.notification_data_id || '';
        return {
          id: `${isIdn ? 'idn' : 'sr'}_${item.room_id || item.url_key}_${item.slug || ''}`,
          name: item.name || item.url_key || 'Member JKT48',
          urlKey: item.url_key || '',
          slug: item.slug || '',
          roomId: item.room_id,
          dataId,
          chatRoomId: item.chat_room_id || '',
          platform: isIdn ? 'IDN' : 'SHOWROOM',
          img: normalizeMediaUrl(item.img || item.img_alt || ''),
          avatar: normalizeMediaUrl(item.img_alt || item.img || ''),
          startedAt: item.started_at,
          streamUrls,
          bestStreamUrl: streamUrls[0]?.url || '',
          isRecording: isMemberCurrentlyRecording(item.url_key || item.name)
        };
      });
      nowLiveCache = { data: formatted, updatedAt: now };
      return formatted;
    }
  } catch (err) {
    console.error('[ERROR] Gagal mengambil now_live:', err.message);
  }
  return nowLiveCache.data || [];
}

function isMemberCurrentlyRecording(identifier) {
  if (!identifier) return false;
  const lower = String(identifier).toLowerCase();
  for (const [, rec] of activeRecorders) {
    if (
      rec.meta.memberKey?.toLowerCase() === lower ||
      rec.meta.memberName?.toLowerCase().includes(lower)
    ) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// 5. JKT48CONNECT REPLAYS (/api/recent & /api/recent/:id)
// ============================================================================
function formatRecentItem(item) {
  const isIdn = (item.type || '').toLowerCase() === 'idn' || Boolean(item.idn);
  const memberName = item.member?.name || item.room_info?.name || 'Member JKT48';
  const nickname =
    item.member?.nickname || item.room_info?.nickname || memberName.split(' ')[0];
  const avatar = normalizeMediaUrl(
    item.member?.img_alt || item.member?.img || item.room_info?.img_alt || ''
  );
  const thumb = normalizeMediaUrl(
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

  const streamUrl = normalizeMediaUrl(
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
    leaderboardBanner: normalizeMediaUrl(
      item.leaderboard_designs?.jkt48connect?.banner?.url ||
        item.leaderboard_designs?.photobook?.banner?.url ||
        ''
    )
  };
}

async function getJkcReplays({ page = 1, perpage = 24, platform = 'ALL', member = '', query = '', force = false }) {
  const typeParam =
    platform === 'IDN' ? 'idn' : platform === 'SHOWROOM' ? 'showroom' : 'all';

  // Jika filter member atau query aktif, kita bisa mengambil perpage lebih besar agar hasil filter lengkap
  const hasFilter = Boolean(member.trim() || query.trim());
  const fetchPerpage = hasFilter ? 60 : Number(perpage) || 24;

  const res = await fetchJkt48Connect(
    '/api/recent',
    {
      page,
      perpage: fetchPerpage,
      group: 'jkt48',
      type: typeParam,
      sort: 'date',
      order: '-1'
    },
    25000,
    force
  );

  const rawList = Array.isArray(res.body?.recents)
    ? res.body.recents
    : Array.isArray(res.body)
      ? res.body
      : [];

  let items = rawList.map(formatRecentItem);

  if (member.trim()) {
    const mLower = member.trim().toLowerCase();
    items = items.filter(
      it =>
        it.nickname.toLowerCase().includes(mLower) ||
        it.memberName.toLowerCase().includes(mLower) ||
        it.title.toLowerCase().includes(mLower)
    );
  }

  if (query.trim()) {
    const qLower = query.trim().toLowerCase();
    items = items.filter(
      it =>
        it.title.toLowerCase().includes(qLower) ||
        it.memberName.toLowerCase().includes(qLower) ||
        it.nickname.toLowerCase().includes(qLower) ||
        it.dataId.toLowerCase().includes(qLower)
    );
  }

  return {
    ok: res.ok,
    status: res.status,
    quota: res.quota,
    page: Number(page),
    totalCount: res.body?.total_count || items.length,
    data: items
  };
}

async function getJkcReplayDetail(dataId, force = false) {
  const res = await fetchJkt48Connect(`/api/recent/${encodeURIComponent(dataId)}`, {}, 30000, force);
  if (!res.ok || !res.body) {
    return { ok: false, status: res.status, error: res.body?.message || 'Gagal memuat detail' };
  }
  const d = res.body;
  const base = formatRecentItem({
    ...d,
    member: d.member || d.room_info
  });

  const recordings = (d.recordings || []).map((r, idx) => ({
    part: idx + 1,
    run: r.run,
    mp4Url: normalizeMediaUrl(r.url),
    streamUrl: normalizeMediaUrl(r.stream_url),
    playerUrl: normalizeMediaUrl(r.player_url),
    durationSeconds: r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
    sizeBytes: r.bytes || 0,
    startedAt: r.started_at,
    partial: r.partial
  }));

  const combinedStreamUrl = normalizeMediaUrl(
    d.playback?.stream_url ||
      d.recording_session?.stream_url ||
      d.recording?.stream_url ||
      recordings[0]?.streamUrl ||
      ''
  );

  // Hitung ringkasan gift dari live_info.gift.list atau agregasi dari live_info.gift.log
  let giftItems = [];
  if (Array.isArray(d.live_info?.gift?.list) && d.live_info.gift.list.length > 0) {
    giftItems = d.live_info.gift.list.map(g => ({
      id: g.id || g.name,
      name: g.name || 'Gift',
      img: normalizeMediaUrl(g.img || ''),
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
            img: normalizeMediaUrl(g.img || ''),
            num: 0,
            point: g.point || 0
          });
        }
        const cur = giftMap.get(key);
        cur.num += g.num || 1;
      }
    }
    giftItems = [...giftMap.values()].sort((a, b) => b.point * b.num - a.point * a.num);
  }

  const fans = (d.fans || d.users || []).slice(0, 30).map((f, idx) => ({
    rank: f.rank || idx + 1,
    id: f.id,
    name: f.name || 'Fan',
    avatar: normalizeMediaUrl(
      f.avatar_url ||
        (f.avatar_id
          ? `https://image.showroom-cdn.com/showroom-prod/image/avatar/${f.avatar_id}.png`
          : '')
    ),
    score: f.gold ?? f.reported_gold ?? f.point ?? f.points ?? 0
  }));

  const ss = d.live_info?.screenshot;
  const screenshots = ss?.base_url
    ? (ss.list || []).map(t => normalizeMediaUrl(`${ss.base_url}/${t}.${ss.format || 'jpg'}`))
    : [];

  return {
    ok: true,
    quota: res.quota,
    data: {
      ...base,
      combinedStreamUrl,
      recordings,
      youtubeVideos: d.youtube_replay?.videos || [],
      fans,
      goldSummary: d.gold_summary || null,
      giftItems,
      screenshots,
      leaderboards: {
        jkt48connectBanner: normalizeMediaUrl(d.leaderboard_designs?.jkt48connect?.banner?.url),
        jkt48connectPortrait: normalizeMediaUrl(d.leaderboard_designs?.jkt48connect?.portrait?.url),
        photobookBanner: normalizeMediaUrl(d.leaderboard_designs?.photobook?.banner?.url),
        avoneraBanner: normalizeMediaUrl(d.leaderboard_designs?.avonera48?.portrait?.url)
      }
    }
  };
}

// ============================================================================
// 6. COMMENTS FETCHER (JKT48CONNECT IDN/SR COMMENTS + SHOWROOM DIRECT + LOCAL)
// ============================================================================
async function fetchSessionComments({ platform, roomId, dataId, startedAt, after }) {
  const startMs = startedAt ? Date.parse(startedAt) : 0;

  try {
    if (platform === 'IDN' && dataId) {
      const res = await fetchJkt48Connect(
        `/api/idn-comments/${encodeURIComponent(dataId)}`,
        { after },
        4000,
        true
      );
      if (res.ok && Array.isArray(res.body?.comments)) {
        const firstStr = res.body.comments[0]?.source_time || res.body.comments[0]?.observed_at || '';
        const baseMs = startMs || (firstStr ? Date.parse(firstStr) : 0);
        const list = res.body.comments.map(c => {
          const tStr = c.source_time || c.observed_at || '';
          const tMs = tStr ? Date.parse(tStr) : 0;
          const offsetSeconds =
            baseMs > 0 && tMs >= baseMs ? Math.round((tMs - baseMs) / 1000) : undefined;
          return {
            id: c.id || String(c.sequence || Math.random()),
            user: c.user?.name || 'Penonton IDN',
            avatar: c.user?.avatar_url || '',
            text: c.comment || '',
            time: tStr,
            offsetSeconds,
            sequence: c.sequence
          };
        });
        return {
          ok: true,
          source: 'jkt48connect-idn',
          status: res.body.status,
          cursor: res.body.cursor,
          comments: list
        };
      }
    } else if (platform === 'SHOWROOM' && roomId) {
      const res = await fetchJkt48Connect(
        `/api/showroom-comments/${encodeURIComponent(roomId)}`,
        { after },
        4000,
        true
      );
      if (res.ok && Array.isArray(res.body?.comments) && res.body.comments.length > 0) {
        const firstStr = res.body.comments[0]?.observed_at || '';
        const baseMs = startMs || (firstStr ? Date.parse(firstStr) : 0);
        const list = res.body.comments.map(c => {
          const tStr = c.observed_at || '';
          const tMs = tStr ? Date.parse(tStr) : 0;
          const offsetSeconds =
            baseMs > 0 && tMs >= baseMs ? Math.round((tMs - baseMs) / 1000) : undefined;
          return {
            id: c.id || String(c.sequence || Math.random()),
            user: c.user?.name || 'Penonton Showroom',
            avatar: c.user?.avatar_url || '',
            text: c.comment || '',
            time: tStr,
            offsetSeconds,
            sequence: c.sequence
          };
        });
        return {
          ok: true,
          source: 'jkt48connect-showroom',
          status: res.body.status,
          cursor: res.body.cursor,
          comments: list
        };
      }
    }
  } catch (err) {
    console.warn('[COMMENTS] JKT48Connect comment fetch warning:', err.message);
  }

  // Fallback langsung ke Showroom comment_log jika sedang live Showroom
  if (platform === 'SHOWROOM' && roomId) {
    try {
      const srUrl = `https://www.showroom-live.com/api/live/comment_log?room_id=${encodeURIComponent(roomId)}`;
      const res = await fetch(srUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        const comments = [];
        for (const c of data.comment_log || []) {
          if (/^\d+$/.test(String(c.comment || '').trim()) && Number(c.comment) <= 50) continue;
          comments.push({
            id: `${c.created_at}_${c.ua || c.name}`,
            user: c.name || 'Showroom Viewer',
            avatar: c.avatar_url || '',
            text: c.comment || '',
            time: c.created_at ? new Date(c.created_at * 1000).toISOString() : ''
          });
        }
        return { ok: true, source: 'showroom-direct', comments };
      }
    } catch {}
  }

  return { ok: true, source: 'empty', comments: [] };
}

// ============================================================================
// 7. PURE NODE.JS NATIVE HLS STREAM + CHAT RECORDER (DVR LOKAL)
// ============================================================================
async function resolveBestMediaPlaylist(masterUrl) {
  const res = await fetch(masterUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} saat membuka m3u8`);
  const text = await res.text();

  if (text.includes('#EXTINF:')) {
    return masterUrl;
  }

  const lines = text.split(/\r?\n/);
  let bestUrl = null;
  let bestBw = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const nextUrlLine = lines.slice(i + 1).find(l => l.trim() && !l.trim().startsWith('#'));
      if (nextUrlLine && bw >= bestBw) {
        bestBw = bw;
        bestUrl = new URL(nextUrlLine.trim(), masterUrl).toString();
      }
    }
  }

  return bestUrl || masterUrl;
}

async function startHlsRecording({ memberName, memberKey, platform, streamUrl, avatar, roomId, dataId }) {
  for (const [, active] of activeRecorders) {
    if (active.meta.memberKey === memberKey && active.meta.status === 'recording') {
      return active.meta;
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeKey = (memberKey || memberName || 'jkt48')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const recId = `rec_${safeKey}_${Date.now()}`;
  const recFolder = path.join(RECORDINGS_DIR, recId);
  fs.mkdirSync(recFolder, { recursive: true });

  const startEpochMs = Date.now();

  const meta = {
    id: recId,
    memberName: memberName || 'Member JKT48',
    memberKey: memberKey || safeKey,
    platform: platform || 'IDN',
    avatar: avatar || '',
    roomId: roomId || '',
    dataId: dataId || '',
    startedAt: new Date(startEpochMs).toISOString(),
    endedAt: null,
    status: 'recording',
    segmentCount: 0,
    commentCount: 0,
    durationSeconds: 0,
    sizeBytes: 0,
    playlistUrl: `/recordings/${recId}/index.m3u8`,
    commentsUrl: `/recordings/${recId}/comments.json`,
    downloadUrl: `/api/recordings/${recId}/download`,
    folderName: recId,
    createdAtStamp: timestamp
  };

  recordingsMeta.unshift(meta);
  saveJson(RECORDINGS_META_FILE, recordingsMeta);

  let stopped = false;
  const downloadedSegments = new Set();
  const playlistEntries = [];
  const recordedComments = [];
  const seenCommentIds = new Set();
  const commentsFilePath = path.join(recFolder, 'comments.json');

  fs.writeFileSync(commentsFilePath, '[]', 'utf8');

  const writeLocalM3u8 = isEnded => {
    try {
      if (!fs.existsSync(recFolder)) return;
      const lines = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:EVENT'
      ];
      for (const entry of playlistEntries) {
        lines.push(`#EXTINF:${entry.duration.toFixed(3)},`);
        lines.push(entry.fileName);
      }
      if (isEnded) {
        lines.push('#EXT-X-ENDLIST');
      }
      fs.writeFileSync(path.join(recFolder, 'index.m3u8'), lines.join('\n') + '\n', 'utf8');
    } catch {}
  };

  writeLocalM3u8(false);

  const commentLoopPromise = (async () => {
    let cursor = undefined;
    while (!stopped) {
      try {
        const res = await fetchSessionComments({
          platform: meta.platform,
          roomId: meta.roomId,
          dataId: meta.dataId,
          startedAt: meta.startedAt,
          after: cursor
        });
        if (res.ok && Array.isArray(res.comments)) {
          if (res.cursor) cursor = res.cursor;
          let added = false;
          for (const c of res.comments) {
            if (!c.id || seenCommentIds.has(c.id)) continue;
            seenCommentIds.add(c.id);
            const offsetSeconds =
              typeof c.offsetSeconds === 'number'
                ? c.offsetSeconds
                : Math.max(0, Math.round((Date.now() - startEpochMs) / 1000));
            recordedComments.push({
              ...c,
              offsetSeconds
            });
            added = true;
          }
          if (added) {
            meta.commentCount = recordedComments.length;
            fs.writeFileSync(commentsFilePath, JSON.stringify(recordedComments, null, 2), 'utf8');
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 4500));
    }
  })();

  const loopPromise = (async () => {
    let consecutiveErrors = 0;
    let mediaPlaylistUrl = streamUrl;
    try {
      mediaPlaylistUrl = await resolveBestMediaPlaylist(streamUrl);
    } catch (err) {
      console.warn(`[REC] Gagal resolve master playlist (${memberName}):`, err.message);
    }

    while (!stopped) {
      try {
        const res = await fetch(mediaPlaylistUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) {
          throw new Error(`Playlist HTTP ${res.status}`);
        }
        const m3u8Text = await res.text();
        consecutiveErrors = 0;

        const lines = m3u8Text.split(/\r?\n/);
        let currentInf = 2.0;

        for (let i = 0; i < lines.length; i++) {
          if (stopped) break;
          const line = lines[i].trim();
          if (!line) continue;

          if (line.startsWith('#EXTINF:')) {
            const durMatch = line.match(/#EXTINF:([\d.]+)/);
            currentInf = durMatch ? parseFloat(durMatch[1]) : 2.0;
          } else if (!line.startsWith('#')) {
            const segAbsUrl = new URL(line, mediaPlaylistUrl).toString();
            const segKey = new URL(segAbsUrl).pathname;
            if (!downloadedSegments.has(segKey)) {
              downloadedSegments.add(segKey);
              const segIndex = meta.segmentCount + 1;
              const segFileName = `seg_${String(segIndex).padStart(5, '0')}.ts`;
              const segFilePath = path.join(recFolder, segFileName);

              const segRes = await fetch(segAbsUrl, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(12000)
              });
              if (segRes.ok) {
                const buf = Buffer.from(await segRes.arrayBuffer());
                fs.writeFileSync(segFilePath, buf);
                meta.segmentCount = segIndex;
                meta.durationSeconds = Math.round(meta.durationSeconds + currentInf);
                meta.sizeBytes += buf.length;
                playlistEntries.push({ fileName: segFileName, duration: currentInf });
                writeLocalM3u8(false);
                saveJson(RECORDINGS_META_FILE, recordingsMeta);
              }
            }
          }
        }

        if (m3u8Text.includes('#EXT-X-ENDLIST')) {
          console.log(`[REC] Live ${memberName} telah berakhir (#EXT-X-ENDLIST).`);
          break;
        }
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 10) {
          console.log(`[REC] Stream ${memberName} selesai atau terputus setelah 10x percobaan.`);
          break;
        }
      }

      await new Promise(r => setTimeout(r, 2500));
    }

    stopped = true;
    if (finishedStreamUrls.size >= 200) finishedStreamUrls.delete(finishedStreamUrls.values().next().value);
    finishedStreamUrls.add(streamUrl);
    activeRecorders.delete(recId);

    if (meta.segmentCount <= 0) {
      recordingsMeta = recordingsMeta.filter(r => r.id !== recId);
      try {
        if (fs.existsSync(recFolder)) fs.rmSync(recFolder, { recursive: true, force: true });
      } catch {}
      saveJson(RECORDINGS_META_FILE, recordingsMeta);
      console.log(`[REC] Stream ${meta.memberName} sudah berakhir (0 segmen), dibersihkan.`);
    } else {
      meta.status = 'completed';
      meta.endedAt = new Date().toISOString();
      writeLocalM3u8(true);
      saveJson(RECORDINGS_META_FILE, recordingsMeta);
      console.log(`[REC] Rekaman selesai: ${meta.memberName} (${meta.segmentCount} segmen, ${meta.commentCount} komentar)`);
    }
  })();

  const controller = {
    meta,
    stop: () => {
      stopped = true;
    },
    loopPromise,
    commentLoopPromise
  };

  activeRecorders.set(recId, controller);
  console.log(`[REC] Mulai merekam ${meta.memberName} (${meta.platform}) -> ${recId}`);
  return meta;
}

// ============================================================================
// 8. AUTO-RECORDER BACKGROUND WATCHER
// ============================================================================
async function checkAutoRecord() {
  if (!appConfig.autoRecordEnabled) return;
  const mode = appConfig.autoRecordMode || 'oshi';
  if (mode === 'oshi' && (!appConfig.oshiList || appConfig.oshiList.length === 0)) return;

  try {
    const liveList = await getNowLive(true);
    for (const live of liveList) {
      if (!live.bestStreamUrl || finishedStreamUrls.has(live.bestStreamUrl)) continue;
      const nameLower = (live.name || '').toLowerCase();
      const keyLower = (live.urlKey || '').toLowerCase();

      const shouldRecord =
        mode === 'all' ||
        (appConfig.oshiList || []).some(oshi => {
          const o = oshi.toLowerCase();
          return nameLower.includes(o) || keyLower.includes(o);
        });

      if (shouldRecord && !isMemberCurrentlyRecording(live.urlKey || live.name)) {
        console.log(
          `[AUTO-RECORD] (${mode.toUpperCase()}) Member terdeteksi sedang live: ${live.name}! Memulai rekaman otomatis...`
        );
        await startHlsRecording({
          memberName: live.name,
          memberKey: live.urlKey || live.name,
          platform: live.platform,
          streamUrl: live.bestStreamUrl,
          avatar: live.avatar,
          roomId: live.roomId,
          dataId: live.dataId
        });
      }
    }
  } catch (err) {
    console.warn('[AUTO-RECORD] Error saat mengecek live:', err.message);
  }
}

if (!IS_SERVERLESS && require.main === module) {
  setInterval(checkAutoRecord, 45 * 1000);
  setTimeout(checkAutoRecord, 4000);
}

// ============================================================================
// 9. HTTP SERVER & API ROUTES
// ============================================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.mp4': 'video/mp4'
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    // --- API: GET /api/now-live ---
    if (pathname === '/api/now-live' && req.method === 'GET') {
      const force = parsedUrl.searchParams.get('refresh') === '1';
      const data = await getNowLive(force);
      return sendJson(res, 200, { ok: true, count: data.length, quota: lastQuotaInfo, data });
    }

    // --- API: GET /api/members ---
    if (pathname === '/api/members' && req.method === 'GET') {
      const data = await getMembers();
      return sendJson(res, 200, { ok: true, count: data.length, data });
    }

    // --- API: GET /api/replays (100% dari JKT48Connect /api/recent) ---
    if (pathname === '/api/replays' && req.method === 'GET') {
      const page = parsedUrl.searchParams.get('page') || '1';
      const perpage = parsedUrl.searchParams.get('perpage') || '24';
      const query = parsedUrl.searchParams.get('q') || '';
      const member = parsedUrl.searchParams.get('member') || '';
      const platform = parsedUrl.searchParams.get('platform') || 'ALL';
      const force = parsedUrl.searchParams.get('refresh') === '1';

      const result = await getJkcReplays({ page, perpage, platform, member, query, force });
      return sendJson(res, 200, result);
    }

    // --- API: GET /api/replays/:dataId (Detail Replay, Stream, Gift, Fans, Screenshot) ---
    const detailMatch = pathname.match(/^\/api\/replays\/([^/]+)$/);
    if (detailMatch && req.method === 'GET') {
      const dataId = detailMatch[1];
      const force = parsedUrl.searchParams.get('refresh') === '1';
      const result = await getJkcReplayDetail(dataId, force);
      return sendJson(res, 200, result);
    }

    // --- API: GET /api/comments ---
    if (pathname === '/api/comments' && req.method === 'GET') {
      const mode = parsedUrl.searchParams.get('mode') || 'session';
      if (mode === 'local') {
        const recId = parsedUrl.searchParams.get('recId') || '';
        if (!isValidRecId(recId)) {
          return sendJson(res, 400, { ok: false, error: 'recId tidak valid' });
        }
        const cFile = path.join(RECORDINGS_DIR, recId, 'comments.json');
        const comments = loadJson(cFile, []);
        return sendJson(res, 200, { ok: true, source: 'local-dvr', comments });
      }
      const platform = parsedUrl.searchParams.get('platform') || 'IDN';
      const roomId = parsedUrl.searchParams.get('roomId') || '';
      const dataId = parsedUrl.searchParams.get('dataId') || '';
      const startedAt = parsedUrl.searchParams.get('startedAt') || '';
      const after = parsedUrl.searchParams.get('after') || '';
      const result = await fetchSessionComments({ platform, roomId, dataId, startedAt, after });
      return sendJson(res, 200, result);
    }

    // --- API: GET /api/download-mp4?url=...&name=... ---
    if (pathname === '/api/download-mp4' && (req.method === 'GET' || req.method === 'HEAD')) {
      const targetUrl = normalizeMediaUrl(parsedUrl.searchParams.get('url') || '');
      if (!targetUrl || !isAllowedStreamUrl(targetUrl)) {
        return sendJson(res, 400, { ok: false, error: 'URL video tidak diizinkan' });
      }
      const rawName = (parsedUrl.searchParams.get('name') || 'JKT48_Replay').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFilename = `${rawName}.mp4`;

      if (IS_SERVERLESS) {
        res.writeHead(302, { Location: targetUrl });
        return res.end();
      }

      try {
        const { Readable } = require('node:stream');
        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers: { 'User-Agent': USER_AGENT }
        });
        if (!upstream.ok || !upstream.body) {
          res.writeHead(302, { Location: targetUrl });
          return res.end();
        }
        const headers = {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
          'Access-Control-Allow-Origin': '*'
        };
        const cl = upstream.headers.get('content-length');
        if (cl) headers['Content-Length'] = cl;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') return res.end();
        return Readable.fromWeb(upstream.body).pipe(res);
      } catch {
        res.writeHead(302, { Location: targetUrl });
        return res.end();
      }
    }

    // --- API: GET /api/hls-proxy?url=... ---
    if (pathname === '/api/hls-proxy' && req.method === 'GET') {
      const targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl || !isAllowedStreamUrl(targetUrl)) {
        return sendJson(res, 400, { ok: false, error: 'URL stream tidak diizinkan' });
      }
      try {
        const upstream = await fetch(targetUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            Referer: targetUrl.includes('showroom')
              ? 'https://www.showroom-live.com/'
              : 'https://www.idn.app/'
          },
          signal: AbortSignal.timeout(15000)
        });

        if (!upstream.ok) {
          res.writeHead(upstream.status, { 'Access-Control-Allow-Origin': '*' });
          return res.end(`Upstream error ${upstream.status}`);
        }

        const contentType = upstream.headers.get('content-type') || '';
        const isM3u8 =
          targetUrl.includes('.m3u8') ||
          contentType.includes('mpegurl') ||
          contentType.includes('m3u8');

        if (isM3u8) {
          const text = await upstream.text();
          const rewritten = text
            .split(/\r?\n/)
            .map(line => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                  const abs = new URL(uri, targetUrl).toString();
                  return `URI="/api/hls-proxy?url=${encodeURIComponent(abs)}"`;
                });
              }
              const absUrl = new URL(trimmed, targetUrl).toString();
              return `/api/hls-proxy?url=${encodeURIComponent(absUrl)}`;
            })
            .join('\n');

          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          });
          return res.end(rewritten);
        } else {
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(200, {
            'Content-Type': contentType || 'video/mp2t',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60'
          });
          return res.end(buf);
        }
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: err.message });
      }
    }

    // --- API: GET /api/recordings ---
    if (pathname === '/api/recordings' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        activeCount: activeRecorders.size,
        data: recordingsMeta
      });
    }

    // --- API: POST /api/record/start ---
    if (pathname === '/api/record/start' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.streamUrl) {
        return sendJson(res, 400, { ok: false, error: 'streamUrl diperlukan' });
      }
      const meta = await startHlsRecording({
        memberName: body.memberName,
        memberKey: body.memberKey,
        platform: body.platform,
        streamUrl: body.streamUrl,
        avatar: body.avatar,
        roomId: body.roomId,
        dataId: body.dataId
      });
      return sendJson(res, 200, { ok: true, data: meta });
    }

    // --- API: POST /api/record/stop ---
    if (pathname === '/api/record/stop' && req.method === 'POST') {
      const body = await readBody(req);
      const rec = activeRecorders.get(body.id);
      if (rec) {
        rec.stop();
        return sendJson(res, 200, { ok: true, message: 'Proses rekaman dihentikan' });
      }
      return sendJson(res, 404, { ok: false, error: 'Rekaman aktif tidak ditemukan' });
    }

    // --- API: GET /api/recordings/:id/download ---
    const downloadMatch = pathname.match(/^\/api\/recordings\/([^/]+)\/download$/);
    if (downloadMatch && req.method === 'GET') {
      const recId = downloadMatch[1];
      if (!isValidRecId(recId)) {
        return sendJson(res, 400, { ok: false, error: 'recId tidak valid' });
      }
      const meta = recordingsMeta.find(r => r.id === recId);
      const recFolder = path.join(RECORDINGS_DIR, recId);
      if (!meta || !fs.existsSync(recFolder)) {
        return sendJson(res, 404, { ok: false, error: 'File rekaman tidak ditemukan' });
      }

      const files = fs
        .readdirSync(recFolder)
        .filter(f => f.endsWith('.ts'))
        .sort();
      const safeFilename = `${meta.memberName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${meta.platform}_${meta.id}.ts`;

      res.writeHead(200, {
        'Content-Type': 'video/mp2t',
        'Content-Disposition': `attachment; filename="${safeFilename}"`
      });

      for (const f of files) {
        const chunk = await fs.promises.readFile(path.join(recFolder, f));
        if (!res.write(chunk)) {
          await new Promise(r => res.once('drain', r));
        }
      }
      return res.end();
    }

    // --- API: DELETE /api/recordings/:id ---
    const deleteMatch = pathname.match(/^\/api\/recordings\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const recId = deleteMatch[1];
      if (!isValidRecId(recId)) {
        return sendJson(res, 400, { ok: false, error: 'recId tidak valid' });
      }
      if (activeRecorders.has(recId)) {
        activeRecorders.get(recId).stop();
        activeRecorders.delete(recId);
      }
      const recFolder = path.join(RECORDINGS_DIR, recId);
      if (fs.existsSync(recFolder)) {
        fs.rmSync(recFolder, { recursive: true, force: true });
      }
      recordingsMeta = recordingsMeta.filter(r => r.id !== recId);
      saveJson(RECORDINGS_META_FILE, recordingsMeta);
      return sendJson(res, 200, { ok: true });
    }

    // --- API: GET & POST /api/oshi ---
    if (pathname === '/api/oshi' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        data: {
          ...appConfig,
          hasApiKey: Boolean(getApiKey()),
          maskedApiKey: getApiKey()
            ? `${getApiKey().slice(0, 8)}...${getApiKey().slice(-4)}`
            : '',
          quota: lastQuotaInfo
        }
      });
    }
    if (pathname === '/api/oshi' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.autoRecordEnabled === 'boolean') {
        appConfig.autoRecordEnabled = body.autoRecordEnabled;
      }
      if (body.autoRecordMode === 'all' || body.autoRecordMode === 'oshi') {
        appConfig.autoRecordMode = body.autoRecordMode;
      }
      if (Array.isArray(body.oshiList)) {
        appConfig.oshiList = [...new Set(body.oshiList.map(s => String(s).trim()).filter(Boolean))];
      }
      if (typeof body.jkt48ConnectApiKey === 'string' && body.jkt48ConnectApiKey.trim()) {
        appConfig.jkt48ConnectApiKey = body.jkt48ConnectApiKey.trim();
      }
      saveJson(OSHI_CONFIG_FILE, appConfig);
      checkAutoRecord();
      return sendJson(res, 200, {
        ok: true,
        data: {
          ...appConfig,
          hasApiKey: Boolean(getApiKey()),
          maskedApiKey: getApiKey()
            ? `${getApiKey().slice(0, 8)}...${getApiKey().slice(-4)}`
            : '',
          quota: lastQuotaInfo
        }
      });
    }

    // --- STATIC: /recordings/... ---
    if (pathname.startsWith('/recordings/')) {
      const relPath = pathname.replace(/^\/recordings\//, '');
      const safePath = path.normalize(path.join(RECORDINGS_DIR, relPath));
      if (!safePath.startsWith(RECORDINGS_DIR) || !fs.existsSync(safePath)) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': ext === '.m3u8' || ext === '.json' ? 'no-cache' : 'public, max-age=3600'
      });
      return fs.createReadStream(safePath).pipe(res);
    }

    // --- STATIC: /public/... ---
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'text/plain; charset=utf-8'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

const server = http.createServer(handleRequest);

if (!IS_SERVERLESS && require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==============================================================');
    console.log(` 🎬 JKT48 Replay & DVR Studio (JKT48Connect Edition) aktif!`);
    console.log(` 💻 Buka di PC     : http://localhost:${PORT}`);
    console.log(` 📱 Buka di HP WiFi: http://192.168.1.3:${PORT}`);
    console.log('==============================================================');
  });
}

handleRequest.formatRecentItem = formatRecentItem;
handleRequest.isValidRecId = isValidRecId;
handleRequest.isAllowedStreamUrl = isAllowedStreamUrl;
module.exports = handleRequest;
