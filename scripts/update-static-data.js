/**
 * Script untuk mengenerate data statis (replays.json, members.json, now-live.json)
 * agar aplikasi dapat berjalan 100% di GitHub Pages tanpa server Node.js lokal.
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'static-data');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

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

async function main() {
  console.log('Mengambil data member JKT48...');
  let members = [];
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
        }))
        .sort((a, b) => (a.nicknames[0] || a.name).localeCompare(b.nicknames[0] || b.name));
    }
  } catch (err) {
    console.warn('Gagal mengambil member:', err.message);
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'members.json'),
    JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), count: members.length, data: members }, null, 2)
  );

  console.log('Mengambil daftar replay terbaru dari channel arsip & pencarian...');
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

  fs.writeFileSync(
    path.join(OUT_DIR, 'replays.json'),
    JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), count: replays.length, data: replays }, null, 2)
  );
  console.log(`Berhasil menyimpan ${replays.length} video replay dan ${members.length} member ke public/static-data/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

