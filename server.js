const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { URL } = require('node:url');

// Lightweight zero-dependency .env loader for local development
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {}
})();

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
const NOTIFIED_LIVES_FILE = path.join(DATA_DIR, 'notified_lives.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const JKT48CONNECT_BASE = 'https://api.jkt48connect.app';

function getEnvVar(name) {
  if (typeof globalThis.Netlify !== 'undefined' && globalThis.Netlify.env) {
    const v = globalThis.Netlify.env.get(name);
    if (v) return v;
  }
  return process.env[name] || '';
}

// ============================================================================
// 1. STATE, PERSISTENCE & PERSONAL AUTHENTICATION (2 ACCOUNTS)
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
  jkt48ConnectApiKey: '',
  telegramEnabled: true,
  telegramMode: 'all',
  telegramBotToken: '',
  telegramChatId: '',
  publicAppUrl: ''
});

if (!appConfig.autoRecordMode) appConfig.autoRecordMode = 'oshi';
if (!appConfig.telegramMode) appConfig.telegramMode = 'all';
if (typeof appConfig.telegramEnabled !== 'boolean') appConfig.telegramEnabled = true;
if (!appConfig.authSecret && !IS_SERVERLESS) {
  appConfig.authSecret = crypto.randomBytes(32).toString('hex');
}
saveJson(OSHI_CONFIG_FILE, appConfig);

const notifiedState = loadJson(NOTIFIED_LIVES_FILE, { ids: [] });
const notifiedLiveIds = new Set(Array.isArray(notifiedState.ids) ? notifiedState.ids : []);

function markLiveNotified(key) {
  if (!key) return;
  notifiedLiveIds.add(key);
  if (notifiedLiveIds.size > 300) {
    const first = notifiedLiveIds.values().next().value;
    notifiedLiveIds.delete(first);
  }
  saveJson(NOTIFIED_LIVES_FILE, { ids: [...notifiedLiveIds] });
}

// 2 Built-in Personal Accounts (scrypt-hashed; overrideable via APP_USERS="u1:p1,u2:p2")
const BUILTIN_ACCOUNTS = [
  {
    username: 'escha',
    salt: '6af3da9d4361b423689680db07cdd311',
    hash: 'fa112ca0531da04a677256ad5f348e22964557cd51ebec4f5180beb2fe8a4ce55e98688b94c88110e3695fae9686b852a1446d7586f40eaaf0b075bf12a1e07c'
  },
  {
    username: 'oshi48',
    salt: '230cb83a5f628d3fd669e8cd589b4022',
    hash: '825c3a1d7b7bedc1d94db778808c0c348ef2f80be6a1310dc84ff8db03d2d9ee41d1f31dc84feab39be176a8cf6c16698f9b996a9c40b1073df64bf367bc498f'
  }
];

function getAuthSecret() {
  return (
    getEnvVar('AUTH_SECRET') ||
    appConfig.authSecret ||
    crypto.createHash('sha256').update(`jkc-studio:${BUILTIN_ACCOUNTS[0].hash}`).digest('hex')
  );
}

function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const uInput = String(username).trim().toLowerCase();
  const pInput = String(password);

  const customUsers = getEnvVar('APP_USERS');
  if (customUsers) {
    for (const pair of customUsers.split(',')) {
      const idx = pair.indexOf(':');
      if (idx <= 0) continue;
      const u = pair.slice(0, idx).trim().toLowerCase();
      const p = pair.slice(idx + 1);
      if (u === uInput) {
        const a = crypto.createHash('sha256').update(pInput).digest();
        const b = crypto.createHash('sha256').update(p).digest();
        return crypto.timingSafeEqual(a, b) ? u : null;
      }
    }
  }

  const acc = BUILTIN_ACCOUNTS.find(a => a.username === uInput);
  if (!acc) return null;
  const derived = crypto.scryptSync(pInput, acc.salt, 64);
  const expected = Buffer.from(acc.hash, 'hex');
  if (derived.length === expected.length && crypto.timingSafeEqual(derived, expected)) {
    return acc.username;
  }
  return null;
}

const SESSION_COOKIE_NAME = 'jkc_session';
const SESSION_TTL_SECONDS = 30 * 24 * 3600;

function createSessionToken(username) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function verifySession(req) {
  try {
    const cookies = parseCookies(req.headers?.cookie || '');
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.u || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}

// Brute-force login rate limiter (max 8 failed attempts per IP per 10 minutes)
const loginAttempts = new Map();
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) return { allowed: true };
  if (entry.count >= 8) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, waitSec };
  }
  return { allowed: true };
}
function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    entry.count++;
  }
}
function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

let recordingsMeta = loadJson(RECORDINGS_META_FILE, []);
const activeRecorders = new Map();
const finishedStreamUrls = new Set();

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

function resolveApiKey(envKey, configKey) {
  return (envKey || configKey || '').trim();
}

function getApiKey() {
  return resolveApiKey(getEnvVar('JKT48CONNECT_API_KEY'), appConfig.jkt48ConnectApiKey);
}

function getTelegramToken() {
  return (appConfig.telegramBotToken || getEnvVar('TELEGRAM_BOT_TOKEN')).trim();
}

function getTelegramChatId() {
  return String(appConfig.telegramChatId || getEnvVar('TELEGRAM_CHAT_ID') || '').trim();
}

function getTelegramWebhookSecret() {
  const tok = getTelegramToken();
  if (!tok) return '';
  return crypto.createHmac('sha256', getAuthSecret()).update(`tg-webhook:${tok}`).digest('hex').slice(0, 48);
}

function maskSecret(val, prefixLen = 7, suffixLen = 4) {
  if (!val) return '';
  if (val.length <= prefixLen + suffixLen + 2) return '••••••••';
  return `${val.slice(0, prefixLen)}...${val.slice(-suffixLen)}`;
}

// Never expose raw API keys or bot tokens to client responses
function getSafePublicConfig() {
  const apiKey = getApiKey();
  const tgToken = getTelegramToken();
  return {
    autoRecordEnabled: Boolean(appConfig.autoRecordEnabled),
    autoRecordMode: appConfig.autoRecordMode === 'all' ? 'all' : 'oshi',
    oshiList: Array.isArray(appConfig.oshiList) ? appConfig.oshiList : [],
    hasApiKey: Boolean(apiKey),
    maskedApiKey: maskSecret(apiKey, 8, 4),
    telegramEnabled: appConfig.telegramEnabled !== false,
    telegramMode: appConfig.telegramMode === 'oshi' ? 'oshi' : 'all',
    telegramChatId: getTelegramChatId(),
    hasTelegramToken: Boolean(tgToken),
    maskedTelegramToken: maskSecret(tgToken, 6, 4),
    publicAppUrl: appConfig.publicAppUrl || getEnvVar('PUBLIC_APP_URL') || '',
    isServerless: IS_SERVERLESS,
    quota: lastQuotaInfo
  };
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

function normalizePlaybackUrl(url) {
  const normalized = normalizeMediaUrl(url);
  if (!normalized) return '';
  try {
    const parsedUrl = new URL(normalized);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return '';
    const host = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '::1' ||
      host === '::' ||
      host === '0.0.0.0' ||
      host.startsWith('127.')
    ) {
      return '';
    }
  } catch {
    return '';
  }
  return normalized;
}

function resolveReplayPlayerUrl(url, dataId, run) {
  const normalized = normalizePlaybackUrl(url);
  if (normalized) return normalized;
  if (!dataId || run == null || String(run).trim() === '') return '';
  return `${JKT48CONNECT_BASE}/replay/${encodeURIComponent(dataId)}/${encodeURIComponent(run)}`;
}

// ============================================================================
// 2. JKT48CONNECT API CLIENT (HEADER-ONLY KEY + CACHE TO SAVE QUOTA)
// ============================================================================
const apiCache = new Map();
let lastQuotaInfo = { limit: null, remaining: null, period: null };

async function fetchJkt48Connect(endpointPath, searchParams = {}, ttlMs = 20000, force = false) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: { message: 'API Key JKT48Connect belum dikonfigurasi di server.' },
      quota: lastQuotaInfo
    };
  }

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
  // Fallback gratis (tanpa key) saat JKT48Connect down: crstlnz
  try {
    const res = await fetch('https://api.crstlnz.my.id/api/member?group=jkt48', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const raw = await res.json();
      const active = (Array.isArray(raw) ? raw : [])
        .filter(m => !m.is_graduate && (!m.group || m.group === 'jkt48'))
        .map(m => ({
          id: m._id || m.url || m.name,
          name: m.name,
          nicknames: m.nicknames?.length ? m.nicknames : [m.name.split(' ')[0]],
          img: normalizeMediaUrl(m.img_alt || m.img || ''),
          url: m.url || '',
          generation: m.generation || ''
        }))
        .sort((a, b) => (a.nicknames[0] || a.name).localeCompare(b.nicknames[0] || b.name));
      if (active.length > 0) return active;
    }
  } catch (err) {
    console.warn('[WARN] Fallback member crstlnz juga gagal:', err.message);
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

  const streamUrl =
    normalizePlaybackUrl(item.playback?.stream_url) || normalizePlaybackUrl(item.recording?.stream_url);
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
        String(it.dataId || '').toLowerCase().includes(qLower)
    );
  }

  return {
    ok: res.ok,
    status: res.status,
    error: res.ok ? '' : res.body?.message || 'Gagal mengambil daftar replay dari JKT48Connect.',
    quota: res.quota,
    page: Number(page),
    totalCount: res.body?.total_count || items.length,
    data: items
  };
}

// ============================================================================
// PRESET.ID ARCHIVE CATALOG INTEGRATION (FULL UNCUT YOUTUBE REPLAYS)
// ============================================================================
let presetCache = { at: 0, items: [], map: {} };

async function fetchPresetCatalog() {
  const now = Date.now();
  if (presetCache.items.length > 0 && now - presetCache.at < 3600000) {
    return presetCache;
  }
  try {
    const fetchHeaders = {
      'User-Agent': USER_AGENT,
      'Referer': 'https://jkt48.preset.id/',
      'Accept': 'application/json, text/plain, */*'
    };
    const [liteRes, mapRes] = await Promise.all([
      fetch('https://jkt48.preset.id/data/videos.lite.json', { headers: fetchHeaders }),
      fetch('https://jkt48.preset.id/data/external_play_map.json', { headers: fetchHeaders })
    ]);
    if (liteRes.ok && mapRes.ok) {
      const [liteData, mapData] = await Promise.all([liteRes.json(), mapRes.json()]);
      presetCache = {
        at: now,
        items: Array.isArray(liteData) ? liteData : Object.values(liteData),
        map: mapData.map || mapData || {}
      };
    }
  } catch (err) {
    // Graceful fallback
  }
  return presetCache;
}

function matchPresetItem(catalog, nickname, startedAt) {
  if (!catalog || !catalog.items || !nickname || !startedAt) return null;
  const targetMs = Date.parse(startedAt);
  if (!targetMs || Number.isNaN(targetMs)) return null;

  const nickLower = String(nickname).toLowerCase().trim();
  const match = catalog.items.find(item => {
    if (!item || !item.m) return false;
    if (item.m.toLowerCase().trim() !== nickLower) return false;
    const itemMs = Date.parse(item.d);
    return Math.abs(itemMs - targetMs) < 6 * 3600 * 1000;
  });

  if (match) {
    const rawYt = (catalog.map && catalog.map[match.i]) || null;
    const youtubeId = rawYt && /^[a-zA-Z0-9_-]{11}$/.test(rawYt) ? rawYt : null;
    const mp4Url = match.u ? (match.u.startsWith('http') ? match.u : `https://jkt48.preset.id${match.u}`) : null;
    return { youtubeId, mp4Url, item: match };
  }
  return null;
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

  // Enrich with Preset YouTube Full Archive & Faststart MP4 mirror
  try {
    const catalog = await fetchPresetCatalog();
    const matched = matchPresetItem(catalog, base.nickname, base.startedAt);
    if (matched) {
      if (matched.youtubeId && !base.youtubeId) {
        base.youtubeId = matched.youtubeId;
        base.youtubeUrl = `https://www.youtube.com/watch?v=${matched.youtubeId}`;
      }
      if (matched.mp4Url) {
        base.presetMp4Url = normalizePlaybackUrl(matched.mp4Url);
      }
    }
  } catch {}

  const recordings = (d.recordings || []).map((r, idx) => ({
    part: idx + 1,
    run: r.run,
    mp4Url: normalizePlaybackUrl(r.url),
    presetMp4Url: idx === 0 ? base.presetMp4Url || null : null,
    streamUrl: normalizePlaybackUrl(r.stream_url),
    playerUrl: resolveReplayPlayerUrl(r.player_url, base.dataId, r.run),
    durationSeconds: r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
    sizeBytes: r.bytes || 0,
    startedAt: r.started_at,
    partial: r.partial
  }));

  const combinedStreamUrl =
    normalizePlaybackUrl(d.playback?.stream_url) ||
    normalizePlaybackUrl(d.recording_session?.stream_url) ||
    normalizePlaybackUrl(d.recording?.stream_url) ||
    recordings[0]?.streamUrl ||
    '';

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
// 5.5 YOUTUBE ARCHIVE FALLBACK (SAAT JKT48CONNECT DOWN)
// Dipakai ulang dari data bake scripts/update-static-data.js (item __yt).
// ============================================================================
function loadYoutubeFallbackReplays(page, perpage) {
  try {
    const file = path.join(PUBLIC_DIR, 'static-data', 'replays.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(json.data) ? json.data : [];
    if (list.length === 0) return null;
    const all = list.map(v => ({
      __yt: true,
      dataId: '',
      youtubeId: v.videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      platform: v.platform || 'IDN',
      memberName: v.channel || '',
      nickname: v.channel || '',
      avatar: '',
      thumb: v.thumb || '',
      title: v.title || '',
      liveTitle: v.title || '',
      startedAt: '',
      endedAt: '',
      durationSeconds: v.durationSeconds || 0,
      viewers: 0,
      playbackStatus: 'ready',
      parts: 1,
      streamUrl: ''
    }));
    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.max(1, Number(perpage) || 24);
    return {
      ok: true,
      fallback: 'youtube',
      page: pageNum,
      perpage: size,
      totalCount: all.length,
      data: all.slice((pageNum - 1) * size, pageNum * size)
    };
  } catch {
    return null;
  }
}

// ============================================================================
// 6. COMMENTS FETCHER (CACHED FOR REPLAYS, FRESH FOR LIVE)
// ============================================================================
async function fetchSessionComments({ platform, roomId, dataId, startedAt, after, isLive }) {
  const startMs = startedAt ? Date.parse(startedAt) : 0;
  const liveFlag = Boolean(isLive || after);
  const ttlMs = liveFlag ? 4000 : 45000;

  try {
    if (platform === 'IDN' && dataId) {
      const res = await fetchJkt48Connect(
        `/api/idn-comments/${encodeURIComponent(dataId)}`,
        { after },
        ttlMs,
        liveFlag
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
        ttlMs,
        liveFlag
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
// 7. TELEGRAM BOT & LIVE NOTIFICATION ENGINE
// ============================================================================
function escapeTgHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildNativeLiveUrl(live) {
  if (live.platform === 'IDN') {
    if (live.urlKey && live.slug) {
      return `https://www.idn.app/${encodeURIComponent(live.urlKey)}/live/${encodeURIComponent(live.slug)}`;
    }
    return 'https://www.idn.app';
  }
  return `https://www.showroom-live.com/r/${encodeURIComponent(live.urlKey || '')}`;
}

async function sendTelegramMessage(chatId, htmlText, inlineButtons = [], tokenOverride = '') {
  const token = (tokenOverride || getTelegramToken()).trim();
  if (!token || !chatId) {
    throw new Error('Bot Token dan Chat ID Telegram diperlukan');
  }
  const payload = {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };
  if (inlineButtons.length > 0) {
    payload.reply_markup = { inline_keyboard: inlineButtons };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram HTTP ${res.status}`);
  }
  return data.result;
}

function getPublicAppUrl() {
  const url = (
    getEnvVar('PUBLIC_APP_URL') ||
    appConfig.publicAppUrl ||
    'https://sweet-cajeta-ed2f82.netlify.app'
  ).replace(/\/+$/, '');
  if (
    !url.startsWith('https://') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('192.168.')
  ) {
    return 'https://sweet-cajeta-ed2f82.netlify.app';
  }
  return url;
}

function formatLiveAlertTelegram(live) {
  const startWib = live.startedAt
    ? new Date(live.startedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
      }) + ' WIB'
    : 'Baru saja';
  const appUrl = getPublicAppUrl();
  const nativeUrl = buildNativeLiveUrl(live);

  const text = [
    `🔴 <b>MEMBER JKT48 SEDANG LIVE!</b>`,
    ``,
    `👤 <b>Member:</b> ${escapeTgHtml(live.name)}`,
    `📺 <b>Platform:</b> ${escapeTgHtml(live.platform)} LIVE`,
    live.slug ? `📝 <b>Sesi:</b> ${escapeTgHtml(live.slug)}` : null,
    `🕒 <b>Mulai:</b> ${escapeTgHtml(startWib)}`
  ]
    .filter(Boolean)
    .join('\n');

  const buttons = [
    [
      { text: '🎬 Tonton di Studio Web', url: appUrl },
      { text: `📱 Buka ${live.platform}`, url: nativeUrl }
    ]
  ];
  return { text, buttons };
}

async function notifyNewLivesOnTelegram(liveList, { maxAgeMs = 0 } = {}) {
  if (appConfig.telegramEnabled === false) return 0;
  const token = getTelegramToken();
  const chatId = getTelegramChatId();
  if (!token || !chatId || !Array.isArray(liveList) || liveList.length === 0) return 0;

  const mode = (getEnvVar('TELEGRAM_NOTIFY_MODE') || appConfig.telegramMode || 'all').toLowerCase();
  let sentCount = 0;

  for (const live of liveList) {
    const liveKey = live.dataId || `${live.platform}_${live.roomId || live.urlKey}_${live.startedAt || ''}`;
    if (!liveKey || notifiedLiveIds.has(liveKey)) continue;

    if (maxAgeMs > 0 && live.startedAt) {
      const age = Date.now() - Date.parse(live.startedAt);
      if (age > maxAgeMs) continue;
    }

    const nameLower = (live.name || '').toLowerCase();
    const keyLower = (live.urlKey || '').toLowerCase();
    const matchesFilter =
      mode === 'all' ||
      (appConfig.oshiList || []).some(oshi => {
        const o = oshi.toLowerCase();
        return nameLower.includes(o) || keyLower.includes(o);
      });

    if (!matchesFilter) continue;

    try {
      const { text, buttons } = formatLiveAlertTelegram(live);
      await sendTelegramMessage(chatId, text, buttons, token);
      markLiveNotified(liveKey);
      sentCount++;
    } catch (err) {
      console.warn(`[TELEGRAM] Gagal kirim notifikasi live (${live.name}):`, err.message);
    }
  }
  return sentCount;
}

async function handleTelegramUpdate(update) {
  const msg = update?.message || update?.edited_message;
  if (!msg?.chat?.id || !msg?.text) return;
  const senderChatId = String(msg.chat.id);
  const text = String(msg.text).trim();
  const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const configuredChatId = getTelegramChatId();

  if (cmd === '/start' || cmd === '/id' || cmd === '/help') {
    const reply = [
      `🎬 <b>JKT48 Replay &amp; Live Alert Bot</b>`,
      ``,
      `✅ Chat ID Anda: <code>${escapeTgHtml(senderChatId)}</code>`,
      ``,
      `<b>Perintah Bot:</b>`,
      `• /live — Cek member JKT48 yang sedang live saat ini`,
      `• /oshi — Lihat daftar Oshi &amp; mode notifikasi`,
      `• /status — Cek status server &amp; kuota API`,
      `• /id — Lihat Chat ID Anda`
    ].join('\n');
    await sendTelegramMessage(senderChatId, reply);
    return;
  }

  // Restrict API-consuming commands to the owner's configured Chat ID
  if (configuredChatId && senderChatId !== configuredChatId) {
    await sendTelegramMessage(senderChatId, '⛔ Bot ini bersifat pribadi.');
    return;
  }

  if (cmd === '/live') {
    const lives = await getNowLive(true);
    if (!lives.length) {
      await sendTelegramMessage(
        senderChatId,
        '🌙 <b>Belum ada member JKT48 yang sedang live saat ini.</b>\nSaya akan langsung memberi kabar begitu ada yang mulai live!'
      );
      return;
    }
    const appUrl = getPublicAppUrl();
    const lines = [`🔴 <b>${lives.length} Member Sedang Live Sekarang:</b>`, ''];
    const buttons = [];
    lives.forEach((l, i) => {
      const t = l.startedAt
        ? new Date(l.startedAt).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta'
          }) + ' WIB'
        : 'Baru saja';
      lines.push(`${i + 1}. <b>${escapeTgHtml(l.name)}</b> — ${escapeTgHtml(l.platform)} (mulai ${escapeTgHtml(t)})`);
      buttons.push([{ text: `▶ ${l.name} (${l.platform})`, url: buildNativeLiveUrl(l) }]);
    });
    buttons.push([{ text: '🎬 Buka JKT48 Replay Studio', url: appUrl }]);
    await sendTelegramMessage(senderChatId, lines.join('\n'), buttons);
    return;
  }

  if (cmd === '/oshi') {
    const mode = (appConfig.telegramMode || 'all').toUpperCase();
    const list = (appConfig.oshiList || []).join(', ') || '(belum dipilih)';
    await sendTelegramMessage(
      senderChatId,
      `⭐ <b>Pengaturan Pantauan Live</b>\n• Mode Notifikasi: <b>${escapeTgHtml(mode === 'ALL' ? 'SEMUA MEMBER' : 'HANYA OSHI')}</b>\n• Daftar Oshi: ${escapeTgHtml(list)}`
    );
    return;
  }

  if (cmd === '/status') {
    const q = lastQuotaInfo.limit ? `${lastQuotaInfo.remaining}/${lastQuotaInfo.limit}` : 'Aktif';
    await sendTelegramMessage(
      senderChatId,
      `🟢 <b>Status Studio Aktif</b>\n• Mode: ${IS_SERVERLESS ? 'Cloud Serverless' : 'Local DVR Server'}\n• Rekaman Aktif: ${activeRecorders.size}\n• Kuota API: ${escapeTgHtml(q)}`
    );
  }
}

// Localhost background polling for Telegram Bot commands (auto-pauses if webhook is active)
let tgUpdateOffset = 0;
let tgWebhookConflictPausedUntil = 0;
async function pollTelegramUpdatesOnce() {
  const token = getTelegramToken();
  if (!token || Date.now() < tgWebhookConflictPausedUntil) return;
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${tgUpdateOffset}&timeout=15&allowed_updates=${encodeURIComponent('["message"]')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.status === 409) {
      // Cloud webhook is active; pause local getUpdates polling for 5 minutes
      tgWebhookConflictPausedUntil = Date.now() + 5 * 60 * 1000;
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.ok && Array.isArray(data.result)) {
      for (const upd of data.result) {
        tgUpdateOffset = Math.max(tgUpdateOffset, (upd.update_id || 0) + 1);
        await handleTelegramUpdate(upd).catch(() => {});
      }
    }
  } catch {}
}

// ============================================================================
// 8. PURE NODE.JS NATIVE HLS STREAM + CHAT RECORDER (DVR LOKAL)
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
          after: cursor,
          isLive: true
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
      } catch {
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
// 9. AUTO-RECORDER + TELEGRAM LIVE ALERT WATCHER
// ============================================================================
async function checkAutoRecord() {
  const wantRecord =
    !IS_SERVERLESS &&
    appConfig.autoRecordEnabled &&
    (appConfig.autoRecordMode === 'all' || (appConfig.oshiList && appConfig.oshiList.length > 0));
  const wantTelegram =
    appConfig.telegramEnabled !== false && Boolean(getTelegramToken() && getTelegramChatId());

  if (!wantRecord && !wantTelegram) return;

  try {
    const liveList = await getNowLive(true);

    if (wantTelegram) {
      await notifyNewLivesOnTelegram(liveList);
    }

    if (wantRecord) {
      const mode = appConfig.autoRecordMode || 'oshi';
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
            `[AUTO-RECORD] (${mode.toUpperCase()}) Member sedang live: ${live.name}! Memulai rekaman otomatis...`
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
    }
  } catch (err) {
    console.warn('[WATCHER] Error saat mengecek live:', err.message);
  }
}

// Cloud Scheduled Function entry point (runs every 5 minutes on Netlify)
async function runCloudLiveNotifyCheck() {
  if (!getTelegramToken() || !getTelegramChatId()) {
    return { ok: true, skipped: 'telegram_not_configured' };
  }
  const liveList = await getNowLive(true);
  // shortcut: 7-minute window for 5-min stateless cron, upgrade to Netlify Blobs if exact multi-hour dedup needed
  const sent = await notifyNewLivesOnTelegram(liveList, { maxAgeMs: 7 * 60 * 1000 });
  return { ok: true, liveCount: liveList.length, sent };
}

if (!IS_SERVERLESS && require.main === module) {
  // 2 menit: 45 detik boros kuota JKC (~57rb/bulan jika 24/7); 2 menit cukup responsif
  setInterval(checkAutoRecord, 120 * 1000);
  setTimeout(checkAutoRecord, 4000);
  (async function tgPollLoop() {
    while (true) {
      await pollTelegramUpdatesOnce();
      await new Promise(r => setTimeout(r, 3000));
    }
  })();
}

// ============================================================================
// 10. HTTP SERVER & AUTHENTICATED API ROUTES
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

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
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
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range'
      });
      return res.end();
    }

    // --- PUBLIC AUTH ROUTES ---
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      let session = verifySession(req);
      if (!session && !IS_SERVERLESS && process.env.NODE_ENV !== 'test' && req.headers['x-test-mode'] !== '1') {
        // Auto-login on local PC for zero-friction personal use
        session = { username: 'escha' };
        const token = createSessionToken('escha');
        const isHttps = req.headers['x-forwarded-proto'] === 'https';
        const cookieVal = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${isHttps ? '; Secure' : ''}`;
        return sendJson(
          res,
          200,
          {
            ok: true,
            authenticated: true,
            user: { username: 'escha' },
            autoLocal: true
          },
          { 'Set-Cookie': cookieVal }
        );
      }
      return sendJson(res, 200, {
        ok: true,
        authenticated: Boolean(session),
        user: session ? { username: session.username } : null
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const clientIp =
        String(req.headers['x-nf-client-connection-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local')
          .split(',')[0]
          .trim();
      const limitCheck = checkLoginRateLimit(clientIp);
      if (!limitCheck.allowed) {
        return sendJson(res, 429, {
          ok: false,
          error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${limitCheck.waitSec} detik.`
        });
      }

      const body = await readBody(req);
      const matchedUser = verifyCredentials(body.username, body.password);
      if (!matchedUser) {
        recordLoginFailure(clientIp);
        return sendJson(res, 401, { ok: false, error: 'Username atau password salah.' });
      }

      clearLoginFailures(clientIp);
      const token = createSessionToken(matchedUser);
      const isHttps = IS_SERVERLESS || req.headers['x-forwarded-proto'] === 'https';
      const cookieVal = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${isHttps ? '; Secure' : ''}`;
      return sendJson(
        res,
        200,
        { ok: true, user: { username: matchedUser } },
        { 'Set-Cookie': cookieVal }
      );
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const isHttps = IS_SERVERLESS || req.headers['x-forwarded-proto'] === 'https';
      const clearCookie = `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isHttps ? '; Secure' : ''}`;
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    }

    // --- TELEGRAM CLOUD WEBHOOK (VERIFIED BY SECRET HEADER) ---
    if (pathname === '/api/telegram/webhook' && req.method === 'POST') {
      const expectedSecret = getTelegramWebhookSecret();
      const gotSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
      if (!expectedSecret || !gotSecret) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden' });
      }
      const a = Buffer.from(gotSecret);
      const b = Buffer.from(expectedSecret);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return sendJson(res, 403, { ok: false, error: 'Invalid webhook secret' });
      }
      const update = await readBody(req);
      await handleTelegramUpdate(update);
      return sendJson(res, 200, { ok: true });
    }

    // --- GLOBAL AUTH GATE FOR ALL /api/* AND /recordings/* ---
    if (pathname.startsWith('/api/') || pathname.startsWith('/recordings/')) {
      const session = verifySession(req);
      if (!session) {
        return sendJson(res, 401, {
          ok: false,
          authRequired: true,
          error: 'Akses terbatas. Silakan login terlebih dahulu.'
        });
      }
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

    // --- API: GET /api/replays ---
    if (pathname === '/api/replays' && req.method === 'GET') {
      const page = parsedUrl.searchParams.get('page') || '1';
      const perpage = parsedUrl.searchParams.get('perpage') || '24';
      const query = parsedUrl.searchParams.get('q') || '';
      const member = parsedUrl.searchParams.get('member') || '';
      const platform = parsedUrl.searchParams.get('platform') || 'ALL';
      const force = parsedUrl.searchParams.get('refresh') === '1';

      let result = await getJkcReplays({ page, perpage, platform, member, query, force });
      // Fallback saat JKT48Connect down: arsip YouTube hasil bake (frontend mengerti item __yt)
      if (!result.ok) {
        const fallback = loadYoutubeFallbackReplays(page, perpage);
        if (fallback) result = fallback;
      }
      return sendJson(res, 200, result);
    }

    // --- API: GET /api/replays/:dataId ---
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
      const isLive = parsedUrl.searchParams.get('isLive') === '1';
      const result = await fetchSessionComments({ platform, roomId, dataId, startedAt, after, isLive });
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
        res.writeHead(302, { Location: targetUrl, 'Cache-Control': 'no-store' });
        return res.end();
      }

      try {
        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers: { 'User-Agent': USER_AGENT }
        });
        if (!upstream.ok || (!upstream.body && req.method !== 'HEAD')) {
          res.writeHead(302, { Location: targetUrl });
          return res.end();
        }
        const headers = {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${safeFilename}"`
        };
        const cl = upstream.headers.get('content-length');
        if (cl) headers['Content-Length'] = cl;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') return res.end();
        const nodeStream = Readable.fromWeb(upstream.body);
        req.on('close', () => nodeStream.destroy());
        return nodeStream.pipe(res);
      } catch {
        res.writeHead(302, { Location: targetUrl });
        return res.end();
      }
    }

    // --- API: GET / HEAD /api/hls-proxy?url=... (SUPPORTS FAST HTTP 206 BYTE-RANGE) ---
    if (pathname === '/api/hls-proxy' && (req.method === 'GET' || req.method === 'HEAD')) {
      const rawTarget = parsedUrl.searchParams.get('url') || '';
      const targetUrl = normalizeMediaUrl(rawTarget);
      if (!targetUrl || !isAllowedStreamUrl(targetUrl)) {
        return sendJson(res, 400, { ok: false, error: 'URL stream tidak diizinkan' });
      }

      const abortCtrl = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) abortCtrl.abort();
      });

      try {
        const isLikelyMp4 = targetUrl.includes('.mp4');
        let rangeHeader = req.headers.range || '';

        // On Serverless (6MB response limit), cap open-ended MP4 byte ranges to 3.5 MB chunks
        if (IS_SERVERLESS && isLikelyMp4) {
          const openMatch = rangeHeader.match(/^bytes=(\d+)-\s*$/);
          if (openMatch) {
            const start = Number(openMatch[1]);
            rangeHeader = `bytes=${start}-${start + 3_500_000}`;
          } else if (!rangeHeader && req.method === 'GET') {
            rangeHeader = 'bytes=0-3500000';
          }
        }

        const upHeaders = {
          'User-Agent': USER_AGENT,
          Referer: targetUrl.includes('showroom')
            ? 'https://www.showroom-live.com/'
            : 'https://www.idn.app/'
        };
        if (rangeHeader) upHeaders.Range = rangeHeader;

        const timer = setTimeout(() => abortCtrl.abort(), 25000);
        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers: upHeaders,
          signal: abortCtrl.signal
        });
        clearTimeout(timer);

        if (!upstream.ok && upstream.status !== 206) {
          res.writeHead(upstream.status);
          return res.end(`Upstream error ${upstream.status}`);
        }

        const contentType = upstream.headers.get('content-type') || '';
        const isM3u8 =
          targetUrl.includes('.m3u8') ||
          contentType.includes('mpegurl') ||
          contentType.includes('m3u8');

        if (isM3u8 && req.method === 'GET') {
          const text = await upstream.text();
          const rewritten = text
            .split(/\r?\n/)
            .map(line => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                  const abs = normalizeMediaUrl(new URL(uri, targetUrl).toString());
                  return `URI="/api/hls-proxy?url=${encodeURIComponent(abs)}"`;
                });
              }
              const absUrl = normalizeMediaUrl(new URL(trimmed, targetUrl).toString());
              return `/api/hls-proxy?url=${encodeURIComponent(absUrl)}`;
            })
            .join('\n');

          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': text.includes('#EXT-X-PLAYLIST-TYPE:VOD') ? 'private, max-age=300' : 'no-cache'
          });
          return res.end(rewritten);
        }

        const outHeaders = {
          'Content-Type': contentType || (isLikelyMp4 ? 'video/mp4' : 'video/mp2t'),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600'
        };
        const cr = upstream.headers.get('content-range');
        if (cr) outHeaders['Content-Range'] = cr;
        const cl = upstream.headers.get('content-length');
        if (cl) outHeaders['Content-Length'] = cl;

        const outStatus = upstream.status === 206 ? 206 : 200;
        res.writeHead(outStatus, outHeaders);
        if (req.method === 'HEAD' || !upstream.body) {
          return res.end();
        }

        if (!IS_SERVERLESS) {
          const stream = Readable.fromWeb(upstream.body);
          stream.on('error', () => res.end());
          return stream.pipe(res);
        }

        const buf = Buffer.from(await upstream.arrayBuffer());
        return res.end(buf);
      } catch (err) {
        if (abortCtrl.signal.aborted) return res.end();
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
      if (!body.streamUrl || !isAllowedStreamUrl(body.streamUrl)) {
        return sendJson(res, 400, { ok: false, error: 'streamUrl tidak valid' });
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

    // --- API: GET & POST /api/oshi (SAFE SANITIZED CONFIG + TELEGRAM SETTINGS) ---
    if (pathname === '/api/oshi' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, data: getSafePublicConfig() });
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
        apiCache.clear();
      }
      if (typeof body.telegramEnabled === 'boolean') {
        appConfig.telegramEnabled = body.telegramEnabled;
      }
      if (body.telegramMode === 'all' || body.telegramMode === 'oshi') {
        appConfig.telegramMode = body.telegramMode;
      }
      if (typeof body.telegramBotToken === 'string' && body.telegramBotToken.trim()) {
        appConfig.telegramBotToken = body.telegramBotToken.trim();
        tgWebhookConflictPausedUntil = 0;
      }
      if (typeof body.telegramChatId === 'string') {
        appConfig.telegramChatId = body.telegramChatId.trim();
      }
      if (typeof body.publicAppUrl === 'string') {
        appConfig.publicAppUrl = body.publicAppUrl.trim();
      }
      saveJson(OSHI_CONFIG_FILE, appConfig);
      checkAutoRecord();
      return sendJson(res, 200, { ok: true, data: getSafePublicConfig() });
    }

    // --- API: TELEGRAM SETUP & TEST ENDPOINTS ---
    if (pathname === '/api/telegram/detect-chat' && req.method === 'POST') {
      const body = await readBody(req);
      const token = (body.botToken || getTelegramToken()).trim();
      if (!token) {
        return sendJson(res, 400, { ok: false, error: 'Masukkan Bot Token terlebih dahulu.' });
      }
      try {
        const resUp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`, {
          signal: AbortSignal.timeout(10000)
        });
        const data = await resUp.json().catch(() => ({}));
        if (!data.ok) {
          return sendJson(res, 400, {
            ok: false,
            error: data.description || 'Gagal membaca getUpdates dari Bot Telegram (jika Webhook aktif, isi Chat ID manual atau kirim /id ke bot).'
          });
        }
        const msgs = (data.result || [])
          .map(u => u.message || u.edited_message || u.channel_post)
          .filter(m => m?.chat?.id);
        if (!msgs.length) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Belum ada pesan masuk. Buka bot Anda di Telegram lalu kirim /start terlebih dahulu, kemudian klik tombol ini lagi.'
          });
        }
        const latest = msgs[msgs.length - 1].chat;
        const chatId = String(latest.id);
        const label = latest.username ? `@${latest.username}` : latest.first_name || latest.title || chatId;
        if (body.botToken && body.botToken.trim()) {
          appConfig.telegramBotToken = body.botToken.trim();
        }
        appConfig.telegramChatId = chatId;
        saveJson(OSHI_CONFIG_FILE, appConfig);
        return sendJson(res, 200, { ok: true, chatId, label, data: getSafePublicConfig() });
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/telegram/test' && req.method === 'POST') {
      const body = await readBody(req);
      const token = (body.botToken || getTelegramToken()).trim();
      const chatId = String(body.chatId || getTelegramChatId()).trim();
      if (!token || !chatId) {
        return sendJson(res, 400, { ok: false, error: 'Bot Token dan Chat ID wajib diisi.' });
      }
      try {
        const lives = await getNowLive(false);
        const liveSummary = lives.length
          ? `\n🔴 Sedang live saat ini: <b>${escapeTgHtml(lives.map(l => `${l.name} (${l.platform})`).join(', '))}</b>`
          : '\n🌙 Saat ini belum ada member yang sedang live.';
        await sendTelegramMessage(
          chatId,
          `✅ <b>Tes Notifikasi JKT48 Replay Berhasil!</b>\nBot siap mengirimkan notifikasi otomatis begitu member mulai live.${liveSummary}`,
          [],
          token
        );
        return sendJson(res, 200, { ok: true, message: 'Pesan tes berhasil dikirim ke Telegram!' });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    if (pathname === '/api/telegram/set-webhook' && req.method === 'POST') {
      const body = await readBody(req);
      const token = (body.botToken || getTelegramToken()).trim();
      const originUrl = String(body.originUrl || appConfig.publicAppUrl || '').replace(/\/+$/, '');
      if (!token) {
        return sendJson(res, 400, { ok: false, error: 'Bot Token belum tersedia.' });
      }
      if (!originUrl.startsWith('https://')) {
        return sendJson(res, 400, { ok: false, error: 'Webhook memerlukan URL publik HTTPS (seperti domain Netlify Anda).' });
      }
      if (body.botToken && body.botToken.trim()) {
        appConfig.telegramBotToken = body.botToken.trim();
      }
      appConfig.publicAppUrl = originUrl;
      saveJson(OSHI_CONFIG_FILE, appConfig);

      const webhookUrl = `${originUrl}/api/telegram/webhook`;
      const secret = getTelegramWebhookSecret();
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: secret,
            allowed_updates: ['message']
          }),
          signal: AbortSignal.timeout(10000)
        });
        const tgData = await tgRes.json().catch(() => ({}));
        if (!tgData.ok) {
          return sendJson(res, 400, { ok: false, error: tgData.description || 'Gagal memasang webhook' });
        }
        return sendJson(res, 200, { ok: true, webhookUrl });
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: err.message });
      }
    }

    // --- STATIC (AUTHENTICATED): /recordings/... ---
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
        'Cache-Control': ext === '.m3u8' || ext === '.json' ? 'no-cache' : 'private, max-age=3600'
      });
      return fs.createReadStream(safePath).pipe(res);
    }

    // --- STATIC SHELL: /public/... ---
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
    sendJson(res, 500, { ok: false, error: 'Terjadi kesalahan internal pada server.' });
  }
}

const server = http.createServer(handleRequest);

if (!IS_SERVERLESS && require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==============================================================');
    console.log(` 🎬 JKT48 Replay & DVR Studio (Private Auth + Telegram Edition)`);
    console.log(` 💻 Buka di PC     : http://localhost:${PORT}`);
    console.log(` 📱 Buka di HP WiFi: http://192.168.1.3:${PORT}`);
    console.log('==============================================================');
  });
}

handleRequest.formatRecentItem = formatRecentItem;
handleRequest.isValidRecId = isValidRecId;
handleRequest.isAllowedStreamUrl = isAllowedStreamUrl;
handleRequest.normalizePlaybackUrl = normalizePlaybackUrl;
handleRequest.resolveReplayPlayerUrl = resolveReplayPlayerUrl;
handleRequest.resolveApiKey = resolveApiKey;
handleRequest.verifyCredentials = verifyCredentials;
handleRequest.createSessionToken = createSessionToken;
handleRequest.runCloudLiveNotifyCheck = runCloudLiveNotifyCheck;
module.exports = handleRequest;
