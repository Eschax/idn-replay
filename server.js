const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = process.env.PORT || 3048;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');

for (const dir of [PUBLIC_DIR, DATA_DIR, RECORDINGS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const OSHI_CONFIG_FILE = path.join(DATA_DIR, 'oshi_config.json');
const RECORDINGS_META_FILE = path.join(DATA_DIR, 'recordings.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ============================================================================
// 1. STATE & PERSISTENCE (OSHI AUTO-RECORD & LOCAL RECORDINGS)
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

let oshiConfig = loadJson(OSHI_CONFIG_FILE, {
  autoRecordEnabled: true,
  oshiList: [] // array of member nicknames/url_keys (lowercase)
});

let recordingsMeta = loadJson(RECORDINGS_META_FILE, []);
// Active recording controllers: Map<recId, { stop: Function, meta: Object }>
const activeRecorders = new Map();

// Mark any previously 'recording' state as 'completed' on startup
for (const rec of recordingsMeta) {
  if (rec.status === 'recording') {
    rec.status = 'completed';
    rec.endedAt = rec.endedAt || new Date().toISOString();
  }
}
saveJson(RECORDINGS_META_FILE, recordingsMeta);

// ============================================================================
// 2. JKT48 MEMBER DIRECTORY & MATCHER
// ============================================================================
const FALLBACK_MEMBERS = [
  { name: 'Abigail Rachel', nicknames: ['Aralie'], generation: 'gen12', is_graduate: false },
  { name: 'Adeline Wijaya', nicknames: ['Delynn'], generation: 'gen12', is_graduate: false },
  { name: 'Amanda Sukma', nicknames: ['Amanda'], generation: 'gen10', is_graduate: false },
  { name: 'Angelina Christy', nicknames: ['Christy'], generation: 'gen7', is_graduate: false },
  { name: 'Aurellia', nicknames: ['Lia'], generation: 'gen10', is_graduate: false },
  { name: 'Aurhel Alana', nicknames: ['Lana'], generation: 'gen12', is_graduate: false },
  { name: 'Catherina Vallencia', nicknames: ['Erine'], generation: 'gen12', is_graduate: false },
  { name: 'Cathleen Nixie', nicknames: ['Cathy'], generation: 'gen11', is_graduate: false },
  { name: 'Celline Thefani', nicknames: ['Elin'], generation: 'gen11', is_graduate: false },
  { name: 'Chelsea Davina', nicknames: ['Chelsea'], generation: 'gen11', is_graduate: false },
  { name: 'Cornelia Vanisa', nicknames: ['Oniel'], generation: 'gen8', is_graduate: false },
  { name: 'Cynthia Yaputera', nicknames: ['Cynthia'], generation: 'gen11', is_graduate: false },
  { name: 'Dena Natalia', nicknames: ['Danella'], generation: 'gen11', is_graduate: false },
  { name: 'Desy Natalia', nicknames: ['Daisy'], generation: 'gen11', is_graduate: false },
  { name: 'Febriola Sinambela', nicknames: ['Olla'], generation: 'gen7', is_graduate: false },
  { name: 'Feni Fitriyanti', nicknames: ['Feni'], generation: 'gen3', is_graduate: false },
  { name: 'Fiony Alveria', nicknames: ['Fiony'], generation: 'gen8', is_graduate: false },
  { name: 'Freyanashifa Jayawardana', nicknames: ['Freya'], generation: 'gen7', is_graduate: false },
  { name: 'Fritzy Rosmerian', nicknames: ['Fritzy'], generation: 'gen12', is_graduate: false },
  { name: 'Gabriela Abigail', nicknames: ['Ella'], generation: 'gen10', is_graduate: false },
  { name: 'Gendis Mayrannisa', nicknames: ['Gendis'], generation: 'gen11', is_graduate: false },
  { name: 'Gita Sekar Andarini', nicknames: ['Gita'], generation: 'gen6', is_graduate: false },
  { name: 'Grace Octaviani', nicknames: ['Gracie'], generation: 'gen11', is_graduate: false },
  { name: 'Greesella Adhalia', nicknames: ['Greesel'], generation: 'gen11', is_graduate: false },
  { name: 'Helisma Putri', nicknames: ['Eli'], generation: 'gen7', is_graduate: false },
  { name: 'Hillary Abigail', nicknames: ['Lily'], generation: 'gen12', is_graduate: false },
  { name: 'Indah Cahya', nicknames: ['Indah'], generation: 'gen9', is_graduate: false },
  { name: 'Indira Seruni', nicknames: ['Indira'], generation: 'gen10', is_graduate: false },
  { name: 'Jazzlyn Trisha', nicknames: ['Trisha'], generation: 'gen12', is_graduate: false },
  { name: 'Jessica Chandra', nicknames: ['Jessi'], generation: 'gen7', is_graduate: false },
  { name: 'Jesslyn Elly', nicknames: ['Lyn'], generation: 'gen10', is_graduate: false },
  { name: 'Kathrina Irene', nicknames: ['Kathrina'], generation: 'gen9', is_graduate: false },
  { name: 'Letycia Moreen', nicknames: ['Moreen'], generation: 'gen12', is_graduate: false },
  { name: 'Lulu Salsabila', nicknames: ['Lulu'], generation: 'gen8', is_graduate: false },
  { name: 'Marsha Lenathea', nicknames: ['Marsha'], generation: 'gen9', is_graduate: false },
  { name: 'Michelle Alexandra', nicknames: ['Michie'], generation: 'gen11', is_graduate: false },
  { name: 'Michelle Levia', nicknames: ['Levi'], generation: 'gen12', is_graduate: false },
  { name: 'Mutiara Azzahra', nicknames: ['Muthe'], generation: 'gen7', is_graduate: false },
  { name: 'Nayla Suji', nicknames: ['Nayla'], generation: 'gen12', is_graduate: false },
  { name: 'Nina Tutachia', nicknames: ['Nachia'], generation: 'gen12', is_graduate: false },
  { name: 'Oline Manuel', nicknames: ['Oline'], generation: 'gen12', is_graduate: false },
  { name: 'Raisha Syifa', nicknames: ['Raisha'], generation: 'gen10', is_graduate: false },
  { name: 'Ribka Budiman', nicknames: ['Ribka'], generation: 'gen12', is_graduate: false },
  { name: 'Shabilqis Naila', nicknames: ['Nala'], generation: 'gen12', is_graduate: false },
  { name: 'Shania Gracia', nicknames: ['Gracia'], generation: 'gen3', is_graduate: false },
  { name: 'Victoria Kimberly', nicknames: ['Kimmy'], generation: 'gen12', is_graduate: false }
];

let membersCache = { data: null, updatedAt: 0 };

async function getMembers() {
  const now = Date.now();
  if (membersCache.data && now - membersCache.updatedAt < 30 * 60 * 1000) {
    return membersCache.data;
  }
  try {
    const res = await fetch('https://api.crstlnz.my.id/api/member?group=jkt48', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        const active = raw
          .filter(m => !m.is_graduate && m.group === 'jkt48')
          .map(m => ({
            id: m._id || m.url,
            name: m.name,
            nicknames: m.nicknames?.length ? m.nicknames : [m.name.split(' ')[0]],
            img: m.img_alt || m.img || '',
            url: m.url || '',
            generation: m.generation || ''
          }))
          .sort((a, b) => (a.nicknames[0] || a.name).localeCompare(b.nicknames[0] || b.name));
        membersCache = { data: active, updatedAt: now };
        return active;
      }
    }
  } catch (err) {
    console.warn('[WARN] Menggunakan fallback daftar member:', err.message);
  }
  const fallbackFormatted = FALLBACK_MEMBERS.map(m => ({
    id: m.nicknames[0].toLowerCase(),
    name: m.name,
    nicknames: m.nicknames,
    img: '',
    url: m.nicknames[0].toLowerCase(),
    generation: m.generation
  }));
  membersCache = { data: fallbackFormatted, updatedAt: now };
  return fallbackFormatted;
}

function detectMembersInTitle(title, members) {
  const matched = [];
  const lowerTitle = ` ${title.toLowerCase()} `;
  for (const m of members) {
    for (const nick of m.nicknames || []) {
      if (nick.length < 3) continue;
      const regex = new RegExp(`(^|[^a-z0-9])${nick.toLowerCase()}([^a-z0-9]|$)`, 'i');
      if (regex.test(lowerTitle)) {
        matched.push({
          nickname: nick,
          name: m.name,
          img: m.img
        });
        break;
      }
    }
  }
  return matched;
}

// ============================================================================
// 3. NOW LIVE FETCHER (IDN LIVE & SHOWROOM)
// ============================================================================
let nowLiveCache = { data: [], updatedAt: 0 };

async function getNowLive(force = false) {
  const now = Date.now();
  if (!force && now - nowLiveCache.updatedAt < 20 * 1000) {
    return nowLiveCache.data;
  }
  try {
    const res = await fetch('https://api.crstlnz.my.id/api/now_live?group=jkt48', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const raw = await res.json();
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
          return {
            id: `${isIdn ? 'idn' : 'sr'}_${item.room_id || item.url_key}_${item.slug || ''}`,
            name: item.name || item.url_key || 'Member JKT48',
            urlKey: item.url_key || '',
            slug: item.slug || '',
            roomId: item.room_id,
            platform: isIdn ? 'IDN' : 'SHOWROOM',
            img: item.img || item.img_alt || '',
            avatar: item.img_alt || item.img || '',
            startedAt: item.started_at,
            streamUrls,
            bestStreamUrl: streamUrls[0]?.url || '',
            isRecording: isMemberCurrentlyRecording(item.url_key || item.name)
          };
        });
        nowLiveCache = { data: formatted, updatedAt: now };
        return formatted;
      }
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
// 4. INSTANT REPLAY ENGINE (FAST ARCHIVE CHANNELS + CHRONOLOGICAL SEARCH)
// ============================================================================
// Channels that upload JKT48 IDN Live & Showroom replays within minutes/hours (no 72h wait!)
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
      signal: AbortSignal.timeout(10000)
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
      signal: AbortSignal.timeout(10000)
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

let replayFeedCache = { data: [], updatedAt: 0 };

async function getReplays({ query = '', member = '', platform = 'ALL', fullOnly = true, force = false }) {
  const members = await getMembers();
  const now = Date.now();
  let list = [];

  const hasCustomSearch = Boolean(query.trim() || member.trim());

  if (!hasCustomSearch) {
    if (!force && replayFeedCache.data.length > 0 && now - replayFeedCache.updatedAt < 3 * 60 * 1000) {
      list = [...replayFeedCache.data];
    } else {
      const results = await Promise.all([
        ...FAST_ARCHIVE_CHANNELS.map(ch => fetchChannelReplays(ch)),
        searchYouTubeReplays('Live IDN JKT48', 'CAISAhAB'),
        searchYouTubeReplays('Live Showroom JKT48', 'CAISAhAB')
      ]);
      const merged = results.flat();
      const seen = new Set();
      const deduped = [];
      for (const v of merged) {
        if (!v || !v.videoId || seen.has(v.videoId)) continue;
        // Pastikan berkaitan dengan JKT48 / Live
        const lower = v.title.toLowerCase();
        if (!lower.includes('jkt48') && !lower.includes('idn') && !lower.includes('showroom')) {
          continue;
        }
        seen.add(v.videoId);
        v.members = detectMembersInTitle(v.title, members);
        deduped.push(v);
      }
      deduped.sort((a, b) => a.ageScore - b.ageScore);
      replayFeedCache = { data: deduped, updatedAt: now };
      list = [...deduped];
    }
  } else {
    // Pencarian spesifik member atau kata kunci
    const searchTerms = [];
    if (member) searchTerms.push(`${member} JKT48`);
    if (query) searchTerms.push(query);
    const baseQuery = searchTerms.join(' ');

    const queriesToRun = [];
    if (platform === 'IDN') {
      queriesToRun.push(`Live IDN ${baseQuery}`);
    } else if (platform === 'SHOWROOM') {
      queriesToRun.push(`Live Showroom ${baseQuery}`);
    } else {
      queriesToRun.push(`Live IDN ${baseQuery}`);
      queriesToRun.push(`Live Showroom ${baseQuery}`);
    }

    // Jika ada di cache channel, sertakan juga yang cocok
    const cachedMatches = (replayFeedCache.data || []).filter(v => {
      const t = v.title.toLowerCase();
      const matchM = !member || t.includes(member.toLowerCase());
      const matchQ = !query || t.includes(query.toLowerCase());
      return matchM && matchQ;
    });

    const searchResults = await Promise.all(
      queriesToRun.map(q => searchYouTubeReplays(q, 'CAISAhAB'))
    );
    const merged = [...cachedMatches, ...searchResults.flat()];
    const seen = new Set();
    for (const v of merged) {
      if (!v || !v.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      v.members = v.members || detectMembersInTitle(v.title, members);
      list.push(v);
    }
    list.sort((a, b) => a.ageScore - b.ageScore);
  }

  // Filter berdasarkan platform
  if (platform && platform !== 'ALL') {
    list = list.filter(v => v.platform.toUpperCase() === platform.toUpperCase());
  }

  // Filter berdasarkan member jika ada
  if (member) {
    const mLower = member.toLowerCase();
    list = list.filter(
      v =>
        v.title.toLowerCase().includes(mLower) ||
        (v.members || []).some(m => m.nickname.toLowerCase() === mLower)
    );
  }

  // Filter berdasarkan durasi (full replay >= 5 menit / 300 detik)
  if (fullOnly) {
    list = list.filter(v => v.durationSeconds === 0 || v.durationSeconds >= 300);
  }

  return list;
}

// ============================================================================
// 5. PURE NODE.JS NATIVE HLS STREAM RECORDER (DVR TANPA FFMPEG)
// ============================================================================
async function resolveBestMediaPlaylist(masterUrl) {
  const res = await fetch(masterUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} saat membuka m3u8`);
  const text = await res.text();

  // Jika sudah media playlist (memiliki #EXTINF)
  if (text.includes('#EXTINF:')) {
    return masterUrl;
  }

  // Jika master playlist (#EXT-X-STREAM-INF), pilih bandwidth tertinggi
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

async function startHlsRecording({ memberName, memberKey, platform, streamUrl, avatar, roomId }) {
  // Cek apakah sudah sedang merekam member ini
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

  const meta = {
    id: recId,
    memberName: memberName || 'Member JKT48',
    memberKey: memberKey || safeKey,
    platform: platform || 'IDN',
    avatar: avatar || '',
    roomId: roomId || '',
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: 'recording',
    segmentCount: 0,
    durationSeconds: 0,
    sizeBytes: 0,
    playlistUrl: `/recordings/${recId}/index.m3u8`,
    downloadUrl: `/api/recordings/${recId}/download`,
    folderName: recId,
    createdAtStamp: timestamp
  };

  recordingsMeta.unshift(meta);
  saveJson(RECORDINGS_META_FILE, recordingsMeta);

  let stopped = false;
  const downloadedSegments = new Set();
  const playlistEntries = [];

  const writeLocalM3u8 = isEnded => {
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
  };

  // Tulis header awal
  writeLocalM3u8(false);

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
            // Gunakan pathname sebagai kunci unik segmen
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

    meta.status = 'completed';
    meta.endedAt = new Date().toISOString();
    writeLocalM3u8(true);
    saveJson(RECORDINGS_META_FILE, recordingsMeta);
    activeRecorders.delete(recId);
    console.log(`[REC] Rekaman selesai: ${meta.memberName} (${meta.segmentCount} segmen)`);
  })();

  const controller = {
    meta,
    stop: () => {
      stopped = true;
    },
    loopPromise
  };

  activeRecorders.set(recId, controller);
  console.log(`[REC] Mulai merekam ${meta.memberName} (${meta.platform}) -> ${recId}`);
  return meta;
}

// ============================================================================
// 6. AUTO-RECORDER BACKGROUND WATCHER FOR OSHI
// ============================================================================
async function checkAutoRecordOshi() {
  if (!oshiConfig.autoRecordEnabled || !oshiConfig.oshiList?.length) return;
  try {
    const liveList = await getNowLive(true);
    for (const live of liveList) {
      if (!live.bestStreamUrl) continue;
      const nameLower = (live.name || '').toLowerCase();
      const keyLower = (live.urlKey || '').toLowerCase();

      const isOshi = oshiConfig.oshiList.some(oshi => {
        const o = oshi.toLowerCase();
        return nameLower.includes(o) || keyLower.includes(o);
      });

      if (isOshi && !isMemberCurrentlyRecording(live.urlKey || live.name)) {
        console.log(`[AUTO-RECORD] Oshi terdeteksi sedang live: ${live.name}! Memulai rekaman otomatis...`);
        await startHlsRecording({
          memberName: live.name,
          memberKey: live.urlKey || live.name,
          platform: live.platform,
          streamUrl: live.bestStreamUrl,
          avatar: live.avatar,
          roomId: live.roomId
        });
      }
    }
  } catch (err) {
    console.warn('[AUTO-RECORD] Error saat mengecek live:', err.message);
  }
}

// Jalankan pengecekan otomatis setiap 60 detik
setInterval(checkAutoRecordOshi, 60 * 1000);
setTimeout(checkAutoRecordOshi, 5000);

// ============================================================================
// 7. HTTP SERVER & API ROUTES
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

const server = http.createServer(async (req, res) => {
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
      return sendJson(res, 200, { ok: true, count: data.length, data });
    }

    // --- API: GET /api/members ---
    if (pathname === '/api/members' && req.method === 'GET') {
      const data = await getMembers();
      return sendJson(res, 200, { ok: true, count: data.length, data });
    }

    // --- API: GET /api/replays ---
    if (pathname === '/api/replays' && req.method === 'GET') {
      const query = parsedUrl.searchParams.get('q') || '';
      const member = parsedUrl.searchParams.get('member') || '';
      const platform = parsedUrl.searchParams.get('platform') || 'ALL';
      const fullOnly = parsedUrl.searchParams.get('fullOnly') !== '0';
      const force = parsedUrl.searchParams.get('refresh') === '1';

      const data = await getReplays({ query, member, platform, fullOnly, force });
      return sendJson(res, 200, { ok: true, count: data.length, data });
    }

    // --- API: GET /api/hls-proxy?url=... ---
    if (pathname === '/api/hls-proxy' && req.method === 'GET') {
      const targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return sendJson(res, 400, { ok: false, error: 'URL stream tidak valid' });
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
          // Rewrite semua baris URL relatif/absolut agar melewati /api/hls-proxy
          const rewritten = text
            .split(/\r?\n/)
            .map(line => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith('#')) {
                // Rewrite URI="..." jika ada (misal #EXT-X-KEY atau #EXT-X-MAP)
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
        roomId: body.roomId
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
        const chunk = fs.readFileSync(path.join(recFolder, f));
        res.write(chunk);
      }
      return res.end();
    }

    // --- API: DELETE /api/recordings/:id ---
    const deleteMatch = pathname.match(/^\/api\/recordings\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const recId = deleteMatch[1];
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
      return sendJson(res, 200, { ok: true, data: oshiConfig });
    }
    if (pathname === '/api/oshi' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.autoRecordEnabled === 'boolean') {
        oshiConfig.autoRecordEnabled = body.autoRecordEnabled;
      }
      if (Array.isArray(body.oshiList)) {
        oshiConfig.oshiList = [...new Set(body.oshiList.map(s => String(s).trim()).filter(Boolean))];
      }
      saveJson(OSHI_CONFIG_FILE, oshiConfig);
      // Langsung trigger pengecekan
      checkAutoRecordOshi();
      return sendJson(res, 200, { ok: true, data: oshiConfig });
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
        'Cache-Control': ext === '.m3u8' ? 'no-cache' : 'public, max-age=3600'
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
});

server.listen(PORT, () => {
  console.log('==============================================================');
  console.log(` 🎬 JKT48 Hybrid Replay & Live Studio aktif!`);
  console.log(` 🌐 Buka di browser: http://localhost:${PORT}`);
  console.log('==============================================================');
});

