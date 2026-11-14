/**
 * Script untuk mengenerate data statis (jkc-replays.json, replays.json, members.json, now-live.json)
 * agar aplikasi dapat berjalan 100% di GitHub Pages tanpa server Node.js lokal.
 * API Key JKT48Connect dibaca dari env JKT48CONNECT_API_KEY (GitHub Actions secret);
 * jika API sedang down, file lama tetap dipertahankan agar situs tidak kosong.
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'static-data');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const JKC_BASE = 'https://api.jkt48connect.app';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FAST_ARCHIVE_CHANNELS = [
  { handle: '@48DailyLive', name: 'JKT48 Daily Live', defaultPlatform: 'IDN' },
  { handle: '@ShowroomJKT48', name: 'Showroom JKT48', defaultPlatform: 'SHOWROOM' },
  { handle: '@JKT48LiveArchives', name: 'JKT48 Live Archives', defaultPlatform: 'IDN' },
  { handle: '@SRliveJKT48', name: 'SRlive JKT48', defaultPlatform: 'SHOWROOM' }
];

function parseRelativeTimeScore(publishedText) {
  if (!publishedText) return 999999;
  const t = publishedText.toLowerCase();
  const numMatch = t.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 1;
  if (t.includes('detik') || t.includes('second') || t.includes('baru saja')) return num;
  if (t.includes('menit') || t.includes('minute')) return num * 60;
  if (t.includes('jam') || t.includes('hour')) return num * 3600;
  if (t.includes('hari') || t.includes('day') || /\b\d+\s*h\s+lalu\b/.test(t)) return num * 86400;
  if (t.includes('minggu') || t.includes('week')) return num * 604800;
  if (t.includes('bln') || t.includes('bulan') || t.includes('month')) return num * 2592000;
  if (t.includes('thn') || t.includes('tahun') || t.includes('year')) return num * 31536000;
  return 888888;
}

function parseDurationToSeconds(durationText) {
  if (!durationText) return 0;
  const parts = durationText
    .trim()
    .split(/[.:]/)
    .map(p => parseInt(p, 10))
    .filter(n => !Number.isNaN(n));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

function detectPlatformFromTitle(title, fallback = 'IDN') {
  const lower = title.toLowerCase();
  if (lower.includes('showroom') || lower.includes('sr live') || lower.includes('srlive')) {
    return 'SHOWROOM';
  }
  if (lower.includes('idn')) {
    return 'IDN';
  }
  return fallback;
}

function extractLockupVideo(lockup, channelName, defaultPlatform) {
  try {
    const videoId =
      lockup.contentId ||
      lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
    if (!videoId) return null;

    const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || '';
    const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
    let duration = '';
    for (const ov of overlays) {
      const badgeText =
        ov.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
      if (badgeText) {
        duration = badgeText;
        break;
      }
    }

    const rows =
      lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ||
      [];
    let views = '';
    let published = '';
    for (const row of rows) {
      const parts = row.metadataParts || [];
      for (const part of parts) {
        const txt = part.accessibilityLabel || part.text?.content || '';
        if (txt.includes('lalu') || txt.includes('ago') || txt.includes('Streaming')) {
          published = part.text?.content || txt;
        } else if (txt) {
          views = txt.includes('ditonton') || txt.includes('views') ? txt : `${txt} x ditonton`;
        }
      }
    }

    const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
    const thumb =
      sources.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      videoId,
      title,
      published,
      duration,
      durationSeconds: parseDurationToSeconds(duration),
      views,
      channel: channelName,
      platform: detectPlatformFromTitle(title, defaultPlatform),
      thumb,
      ageScore: parseRelativeTimeScore(published)
    };
  } catch {
    return null;
  }
}

function extractVideoRenderer(v, fallbackChannel = '', defaultPlatform = 'IDN') {
  try {
    const videoId = v.videoId;
    if (!videoId) return null;
    const title = v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || '';
    const published = v.publishedTimeText?.simpleText || '';
    const duration = v.lengthText?.simpleText || '';
    const views = v.viewCountText?.simpleText || '';
    const channel = v.ownerText?.runs?.[0]?.text || fallbackChannel;
    const thumb =
      v.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      videoId,
      title,
      published,
      duration,
      durationSeconds: parseDurationToSeconds(duration),
      views,
      channel,
      platform: detectPlatformFromTitle(title, defaultPlatform),
      thumb,
      ageScore: parseRelativeTimeScore(published)
    };
  } catch {
    return null;
  }
}

async function fetchChannelReplays(channelInfo) {
  try {
    const res = await fetch(`https://www.youtube.com/${channelInfo.handle}/videos`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
      },
      signal: AbortSignal.timeout(12000)
    });
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const videos = [];

    for (const t of tabs) {
      const grid = t.tabRenderer?.content?.richGridRenderer;
      if (!grid) continue;
      for (const item of grid.contents || []) {
        const content = item.richItemRenderer?.content;
        if (!content) continue;
        if (content.lockupViewModel) {
          const parsed = extractLockupVideo(
            content.lockupViewModel,
            channelInfo.name,
            channelInfo.defaultPlatform
          );
          if (parsed) videos.push(parsed);
        } else if (content.videoRenderer) {
          const parsed = extractVideoRenderer(
            content.videoRenderer,
            channelInfo.name,
            channelInfo.defaultPlatform
          );
          if (parsed) videos.push(parsed);
        }
      }
    }
    return videos;
  } catch (err) {
    console.warn(`[WARN] Gagal mengambil channel ${channelInfo.handle}:`, err.message);
    return [];
  }
}

async function searchYouTubeReplays(query, sp = 'CAISAhAB') {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${sp}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
      },
      signal: AbortSignal.timeout(12000)
    });
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];
    const videos = [];
    for (const sec of sections) {
      for (const item of sec?.itemSectionRenderer?.contents || []) {
        if (item.videoRenderer) {
          const parsed = extractVideoRenderer(item.videoRenderer);
          if (parsed) videos.push(parsed);
        } else if (item.lockupViewModel) {
          const parsed = extractLockupVideo(item.lockupViewModel, 'YouTube Archive', 'IDN');
          if (parsed) videos.push(parsed);
        }
      }
    }
    return videos;
  } catch (err) {
    console.warn(`[WARN] Gagal search YouTube "${query}":`, err.message);
    return [];
  }
}

// --- JKT48CONNECT API (key dari env, dipakai di GitHub Actions; gagal = data lama dipertahankan) ---
async function jkcFetch(endpointPath, searchParams = {}) {
  const apiKey = (process.env.JKT48CONNECT_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, status: 0, body: null, reason: 'JKT48CONNECT_API_KEY tidak diset' };
  }
  const url = new URL(endpointPath, JKC_BASE);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(25000)
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {}
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, reason: err.message };
  }
}

function jkcNormalizeMedia(url) {
  if (!url) return '';
  return String(url).replace(`${JKC_BASE}:8443/`, `${JKC_BASE}/`);
}

// --- PRESET.ID CATALOG (mirror MP4 faststart + YouTube full archive, tanpa API key) ---
async function fetchPresetCatalog() {
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      Referer: 'https://jkt48.preset.id/',
      Accept: 'application/json, text/plain, */*'
    };
    const [liteRes, mapRes] = await Promise.all([
      fetch('https://jkt48.preset.id/data/videos.lite.json', { headers, signal: AbortSignal.timeout(20000) }),
      fetch('https://jkt48.preset.id/data/external_play_map.json', { headers, signal: AbortSignal.timeout(20000) })
    ]);
    if (!liteRes.ok || !mapRes.ok) return null;
    const [liteData, mapData] = await Promise.all([liteRes.json(), mapRes.json()]);
    return { items: Array.isArray(liteData) ? liteData : Object.values(liteData), map: mapData.map || mapData || {} };
  } catch (err) {
    console.warn('[WARN] Gagal mengambil katalog preset.id:', err.message);
    return null;
  }
}

function matchPresetItem(catalog, nickname, startedAt) {
  if (!catalog || !nickname || !startedAt) return null;
  const targetMs = Date.parse(startedAt);
  if (!targetMs || Number.isNaN(targetMs)) return null;
  const nickLower = String(nickname).toLowerCase().trim();
  const match = catalog.items.find(item => {
    if (!item || !item.m) return false;
    if (item.m.toLowerCase().trim() !== nickLower) return false;
    const itemMs = Date.parse(item.d);
    return Math.abs(itemMs - targetMs) < 6 * 3600 * 1000;
  });
  if (!match) return null;
  const rawYt = (catalog.map && catalog.map[match.i]) || null;
  const youtubeId = rawYt && /^[a-zA-Z0-9_-]{11}$/.test(rawYt) ? rawYt : null;
  const mp4Url = match.u ? (match.u.startsWith('http') ? match.u : `https://jkt48.preset.id${match.u}`) : null;
  return youtubeId || mp4Url ? { youtubeId, mp4Url } : null;
}

// Tulis hanya saat ada data; jika gagal fetch, pertahankan file lama (restore dari cache Actions).
function writeKeepLastGood(fileName, payload) {
  const file = path.join(OUT_DIR, fileName);
  if (payload.count > 0) {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    return true;
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ ...payload, data: [] }, null, 2));
  }
  return false;
}

function mapNowLiveItem(item) {
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
    img: jkcNormalizeMedia(item.img || item.img_alt || ''),
    avatar: jkcNormalizeMedia(item.img_alt || item.img || ''),
    startedAt: item.started_at,
    streamUrls,
    bestStreamUrl: streamUrls[0]?.url || '',
    isRecording: false
  };
}

async function updateJkcData() {
  console.log('Mengambil daftar replay dari JKT48Connect (/api/recent)...');
  const res = await jkcFetch('/api/recent', {
    page: 1,
    perpage: 60,
    group: 'jkt48',
    type: 'all',
    sort: 'date',
    order: '-1'
  });
  const rawList = Array.isArray(res.body?.recents)
    ? res.body.recents
    : Array.isArray(res.body)
      ? res.body
      : [];
  if (!res.ok || rawList.length === 0) {
    console.warn(`[WARN] JKC /api/recent gagal (status ${res.status}${res.reason ? ', ' + res.reason : ''}). Data lama dipertahankan.`);
  } else {
    // Enrich dengan mirror MP4 faststart & YouTube full dari preset.id (best-effort)
    let preset = null;
    const presetByNick = new Map();
    for (const item of rawList) {
      const nick = item.member?.nickname || item.room_info?.nickname || item.member?.name || item.room_info?.name;
      const startedAt = item.live_info?.date?.start || item.created_at || '';
      if (!nick || !startedAt) continue;
      if (!preset) preset = await fetchPresetCatalog();
      if (!preset) break;
      const key = `${String(nick).toLowerCase().trim()}|${startedAt}`;
      if (!presetByNick.has(key)) presetByNick.set(key, matchPresetItem(preset, nick, startedAt));
      const matched = presetByNick.get(key);
      if (matched) item._preset = matched;
    }
    const enriched = rawList.filter(item => item._preset).length;
    console.log(`JKC recent: ${rawList.length} sesi, ${enriched} di antaranya kaya mirror preset.id.`);
  }
  writeKeepLastGood('jkc-replays.json', {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: rawList.length,
    data: rawList
  });

  console.log('Mengambil status now-live dari JKT48Connect (/api/now_live)...');
  const nl = await jkcFetch('/api/now_live', { group: 'jkt48' });
  const nlRaw = Array.isArray(nl.body) ? nl.body : nl.body?.data || [];
  if (!nl.ok) {
    console.warn(`[WARN] JKC /api/now_live gagal (status ${nl.status}${nl.reason ? ', ' + nl.reason : ''}). Data lama dipertahankan.`);
  }
  writeKeepLastGood('now-live.json', {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: nlRaw.length,
    data: nlRaw.map(mapNowLiveItem)
  });
}

async function updateMembers() {
  console.log('Mengambil data member JKT48...');
  let members = [];
  try {
    const jkc = await jkcFetch('/api/member', { group: 'jkt48' });
    const raw = jkc.ok ? (Array.isArray(jkc.body) ? jkc.body : jkc.body?.members || []) : null;
    if (Array.isArray(raw) && raw.length > 0) {
      members = raw
        .filter(m => !m.is_graduate && (!m.group || m.group === 'jkt48'))
        .map(m => ({
          id: m._id || m.url || m.name,
          name: m.name,
          nicknames: m.nicknames?.length ? m.nicknames : m.nickname ? [m.nickname] : [m.name.split(' ')[0]],
          img: jkcNormalizeMedia(m.img_alt || m.img || ''),
          url: m.url || '',
          generation: m.generation || ''
        }));
    } else {
      console.warn('[WARN] Member via JKT48Connect tidak tersedia, memakai fallback crstlnz.');
    }
  } catch (err) {
    console.warn('[WARN] Gagal mengambil member via JKT48Connect:', err.message);
  }

  if (members.length === 0) {
    try {
      const res = await fetch('https://api.crstlnz.my.id/api/member?group=jkt48', {
        headers: { 'User-Agent': USER_AGENT }
      });
      if (res.ok) {
        const raw = await res.json();
        members = raw
          .filter(m => !m.is_graduate && m.group === 'jkt48')
          .map(m => ({
            id: m._id || m.url,
            name: m.name,
            nicknames: m.nicknames?.length ? m.nicknames : [m.name.split(' ')[0]],
            img: m.img_alt || m.img || '',
            url: m.url || '',
            generation: m.generation || ''
          }));
      }
    } catch (err) {
      console.warn('Gagal mengambil member (fallback):', err.message);
    }
  }

  members.sort((a, b) => (a.nicknames[0] || a.name).localeCompare(b.nicknames[0] || b.name));
  writeKeepLastGood('members.json', {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: members.length,
    data: members
  });
  return members.length;
}

async function updateYoutubeReplays() {
  console.log('Mengambil daftar replay YouTube dari channel arsip & pencarian...');
  const results = await Promise.all([
    ...FAST_ARCHIVE_CHANNELS.map(ch => fetchChannelReplays(ch)),
    searchYouTubeReplays('Live IDN JKT48', 'CAISAhAB'),
    searchYouTubeReplays('Live Showroom JKT48', 'CAISAhAB')
  ]);

  const seen = new Set();
  const replays = [];
  for (const v of results.flat()) {
    if (!v || !v.videoId || seen.has(v.videoId)) continue;
    const lower = v.title.toLowerCase();
    if (!lower.includes('jkt48') && !lower.includes('idn') && !lower.includes('showroom')) continue;
    seen.add(v.videoId);
    replays.push(v);
  }
  replays.sort((a, b) => a.ageScore - b.ageScore);
  writeKeepLastGood('replays.json', {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: replays.length,
    data: replays
  });
  return replays.length;
}

async function main() {
  const memberCount = await updateMembers();
  await updateJkcData();
  const ytCount = await updateYoutubeReplays();
  console.log(`Selesai: ${memberCount} member, daftar JKC + ${ytCount} replay YouTube disimpan ke public/static-data/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

