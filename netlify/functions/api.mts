const JKC_BASE_URL = "https://api.jkt48connect.app";

let runtimeConfig = {
  autoRecordEnabled: false,
  autoRecordMode: "oshi",
  oshiList: ["Aralie", "Delynn", "Erine", "Lily", "Michie", "Trisha"],
  customApiKey: "",
};

function getApiKey(): string {
  const envKey =
    (typeof Netlify !== "undefined" && Netlify.env?.get("JKT48CONNECT_API_KEY")) ||
    process.env.JKT48CONNECT_API_KEY ||
    "";
  return runtimeConfig.customApiKey || envKey;
}

function normalizeMediaUrl(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  return String(rawUrl)
    .replace("https://api.jkt48connect.app:8443/", "https://api.jkt48connect.app/")
    .replace("http://api.jkt48connect.app:8443/", "https://api.jkt48connect.app/");
}

function formatDurationSeconds(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return "";
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

async function fetchJkt48Connect(endpointPath: string, queryParams: Record<string, string | number | undefined> = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("JKT48CONNECT_API_KEY belum diatur.");
  }

  const urlObj = new URL(endpointPath, JKC_BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== "") {
      urlObj.searchParams.set(k, String(v));
    }
  }
  urlObj.searchParams.set("api_key", apiKey);

  const res = await fetch(urlObj.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (JKT48-Personal-Replay-Netlify)",
      Accept: "application/json",
      "x-priority-token": apiKey,
    },
  });

  const data = await res.json();
  if (res.status >= 400) {
    throw new Error((data as any)?.message || (data as any)?.error || `HTTP ${res.status}`);
  }
  return data as any;
}

function mapRecentItemToCard(item: any) {
  const member = item.member || {};
  const liveInfo = item.live_info || {};
  const dateInfo = liveInfo.date || {};
  const playback = item.playback || {};

  const startIso = dateInfo.start || item.created_at || new Date().toISOString();
  const endIso = dateInfo.end || item.created_at || startIso;
  const durationSec = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000) ||
      Math.round((liveInfo.duration || 0) / 1000)
  );

  const platform =
    String(item.type || "").toLowerCase() === "idn" ? "IDN Live" : "SHOWROOM";
  const nickname = member.nickname || member.name || "Member JKT48";
  const streamUrl = normalizeMediaUrl(playback.stream_url || "");
  const playbackStatus = playback.status || (streamUrl ? "ready" : "pending");

  return {
    dataId: item.data_id,
    idnDataId: item.idn?.id || item.data_id,
    roomId: item.room_id,
    memberName: nickname,
    fullName: member.name || nickname,
    memberUrlKey: member.url || "",
    avatar: member.img_alt || member.img || "",
    poster: member.img || member.img_alt || "",
    platform,
    type: String(item.type || "showroom").toLowerCase(),
    title: item.idn?.title || `${nickname} - ${platform} Live`,
    slug: item.idn?.slug || "",
    username: item.idn?.username || "",
    startedAt: startIso,
    endedAt: endIso,
    durationSec,
    durationFormatted: formatDurationSeconds(durationSec),
    viewers: liveInfo.viewers?.num || 0,
    activeViewers: liveInfo.viewers?.active || 0,
    points: item.points || 0,
    totalGifts: item.total_gifts || item.points || 0,
    giftRate: item.gift_rate || 0,
    playbackStatus,
    streamUrl,
    hasVideo: Boolean(streamUrl),
  };
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method || "GET";

  try {
    // 1. GET /api/replays
    if (pathname === "/api/replays" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
      const perpage = parseInt(url.searchParams.get("perpage") || "24", 10) || 24;
      const type = url.searchParams.get("type") || "all";
      const search = (url.searchParams.get("search") || "").trim();

      const data = await fetchJkt48Connect("/api/recent", {
        group: "jkt48",
        page,
        perpage,
        type,
        filter: "active",
        sort: "date",
        order: -1,
        search: search || undefined,
      });

      const recents = Array.isArray(data?.recents) ? data.recents : [];
      const items = recents.map(mapRecentItemToCard);

      return Response.json({
        updatedAt: new Date().toISOString(),
        page: data.page || page,
        perpage: data.perpage || perpage,
        totalCount: data.total_count || items.length,
        count: items.length,
        items,
      });
    }

    // 2. GET /api/replays/:dataId
    const replayDetailMatch = pathname.match(/^\/api\/replays\/([^/]+)$/);
    if (replayDetailMatch && method === "GET") {
      const dataId = decodeURIComponent(replayDetailMatch[1]);
      const d = await fetchJkt48Connect(`/api/recent/${encodeURIComponent(dataId)}`);

      const baseCard = mapRecentItemToCard(d);
      const rawRecordings = Array.isArray(d.recordings) ? d.recordings : [];
      const recordings = rawRecordings.map((r: any, idx: number) => ({
        part: idx + 1,
        url: normalizeMediaUrl(r.url),
        type: r.type || (String(r.url).includes(".mp4") ? "mp4" : "m3u8"),
        format: r.format || (String(r.url).includes(".mp4") ? "mp4" : "hls"),
        duration: r.duration || baseCard.durationSec,
        size: r.size || 0,
        source: r.source || "r2",
        r2Url: r.r2_url || null,
        streamUrl: normalizeMediaUrl(r.stream_url || d.playback?.stream_url || ""),
      }));

      const primaryStreamUrl =
        baseCard.streamUrl ||
        recordings.find((r: any) => r.streamUrl)?.streamUrl ||
        recordings.find((r: any) => r.type === "m3u8")?.url ||
        recordings[0]?.url ||
        "";

      const primaryMp4Url =
        recordings.find((r: any) => r.r2Url)?.r2Url ||
        recordings.find((r: any) => String(r.url).endsWith(".mp4"))?.url ||
        "";

      const rawScreenshots = d.live_info?.screenshot || {};
      const screenshotList = Array.isArray(rawScreenshots.list) ? rawScreenshots.list : [];
      const screenshots = screenshotList.slice(0, 24).map((id: string) => {
        const folder = rawScreenshots.folder || "screenshots";
        const format = rawScreenshots.format || "jpg";
        if (rawScreenshots.base_url && String(rawScreenshots.base_url).startsWith("http")) {
          return `${rawScreenshots.base_url.replace(/\/$/, "")}/${folder}/${id}.${format}`;
        }
        return `https://res.cloudinary.com/haymzm4wp/image/upload/${folder}/${id}.${format}`;
      });

      const fans = Array.isArray(d.fans)
        ? d.fans.slice(0, 30).map((f: any, idx: number) => ({
            rank: f.rank || idx + 1,
            id: f.id,
            name: f.name || "Anonim",
            fansCount: f.fans_count || 0,
            gold: f.gold || f.reported_gold || 0,
            points: f.points || 0,
            avatar: f.avatar_url || (f.avatar_id ? `https://static.showroom-live.com/image/avatar/${f.avatar_id}.png` : ""),
          }))
        : [];

      const giftLog = Array.isArray(d.live_info?.gift?.log) ? d.live_info.gift.log : [];
      const giftItems = giftLog.slice(0, 50).map((g: any) => ({
        name: g.name || "Gift",
        point: g.point || 0,
        num: g.num || 1,
        totalPoint: (g.point || 0) * (g.num || 1),
        img: g.img || "",
      }));

      return Response.json({
        ...baseCard,
        streamUrl: primaryStreamUrl,
        mp4Url: primaryMp4Url,
        recordings,
        screenshots,
        fans,
        giftItems,
        leaderboardDesigns: d.leaderboard_designs || null,
        rawCommentsInfo: d.live_info?.comments || null,
      });
    }

    // 3. GET /api/now-live
    if (pathname === "/api/now-live" && method === "GET") {
      const raw = await fetchJkt48Connect("/api/now-live", { group: "jkt48" }).catch(() => []);
      const list = Array.isArray(raw) ? raw : raw?.data || [];
      const streams = list.map((item: any) => {
        const isIdn = String(item.type || "").toLowerCase() === "idn";
        const streamsArr = Array.isArray(item.streaming_url_list) ? item.streaming_url_list : [];
        const bestStream =
          streamsArr.sort((a: any, b: any) => (b.quality || 0) - (a.quality || 0))[0]?.url || "";

        return {
          memberName: item.name || "Member JKT48",
          roomKey: item.url_key || "",
          roomId: item.room_id || null,
          dataId: item.data_id || item.idn_data_id || null,
          slug: item.slug || item.url_key || "",
          platform: isIdn ? "IDN Live" : "SHOWROOM",
          type: isIdn ? "idn" : "showroom",
          title: item.title || `${item.name} Live`,
          startedAt: item.started_at || new Date().toISOString(),
          thumbnail: item.img || item.img_alt || "",
          avatar: item.img_alt || item.img || "",
          viewers: item.viewers || 0,
          streamUrl: bestStream,
          watchUrl: isIdn
            ? `https://www.idn.app/${item.url_key}/live/${item.slug || ""}`
            : `https://www.showroom-live.com/r/${item.url_key}`,
          isRecording: false,
          recordingId: null,
        };
      });

      return Response.json({
        updatedAt: new Date().toISOString(),
        count: streams.length,
        streams,
        activeRecorders: [],
      });
    }

    // 4. GET /api/members
    if (pathname === "/api/members" && method === "GET") {
      const raw = await fetchJkt48Connect("/api/member", { group: "jkt48" });
      const rawList = Array.isArray(raw) ? raw : raw?.members || raw?.data || [];
      const members = rawList.map((m: any) => ({
        id: m._id || m.id || m.room_id,
        name: m.name || m.nickname || "Member",
        nickname:
          m.nickname ||
          (m.name ? m.name.split(" ")[0] : "Member"),
        generation: m.generation || "",
        avatar: m.img_alt || m.img || "",
        roomId: m.room_id || null,
        urlKey: m.url || m.sr_url || "",
        idnUsername: m.idn_username || "",
        isOshi: runtimeConfig.oshiList.some(
          (o) => o.toLowerCase() === String(m.nickname || m.name || "").toLowerCase()
        ),
      }));

      return Response.json({
        count: members.length,
        members,
        oshiList: runtimeConfig.oshiList,
        autoRecordEnabled: runtimeConfig.autoRecordEnabled,
        autoRecordMode: runtimeConfig.autoRecordMode,
      });
    }

    // 5. GET /api/comments
    if (pathname === "/api/comments" && method === "GET") {
      const platform = (url.searchParams.get("platform") || "").toLowerCase();
      const dataId = url.searchParams.get("dataId") || "";
      const roomId = url.searchParams.get("roomId") || "";
      const slug = url.searchParams.get("slug") || "";
      const username = url.searchParams.get("username") || "";
      const startedAt = url.searchParams.get("startedAt") || "";
      const limit = parseInt(url.searchParams.get("limit") || "100", 10) || 100;

      let result: any = null;
      if (platform.includes("idn") && dataId) {
        result = await fetchJkt48Connect(`/api/idn-comments/${encodeURIComponent(dataId)}`, { limit }).catch(() => null);
      } else if (roomId) {
        result = await fetchJkt48Connect(`/api/showroom-comments/${encodeURIComponent(roomId)}`, { limit }).catch(() => null);
      } else if (slug) {
        result = await fetchJkt48Connect("/api/live/comments", { slug, username, limit }).catch(() => null);
      }

      const rawComments = Array.isArray(result?.comments) ? result.comments : [];
      const liveStartMs = startedAt ? new Date(startedAt).getTime() : 0;

      const comments = rawComments
        .map((c: any) => {
          const tsIso = c.source_time || c.observed_at || new Date().toISOString();
          const tsMs = new Date(tsIso).getTime();
          const offsetSeconds =
            liveStartMs > 0 && tsMs >= liveStartMs
              ? Math.floor((tsMs - liveStartMs) / 1000)
              : null;

          return {
            id: c.comment_id || `${tsMs}_${Math.random().toString(36).slice(2, 7)}`,
            name: c.user?.name || c.user?.username || c.name || "Fans",
            username: c.user?.username || "",
            avatar: c.user?.avatar_url || c.avatar || "",
            text: c.comment || c.text || "",
            timestamp: tsIso,
            offsetSeconds,
          };
        })
        .reverse();

      return Response.json({
        live: result?.live || null,
        totalBuffered: result?.total_buffered || comments.length,
        count: comments.length,
        comments,
      });
    }

    // 6. GET / POST /api/config
    if (pathname === "/api/config" && method === "GET") {
      const activeKey = getApiKey();
      return Response.json({
        autoRecordEnabled: runtimeConfig.autoRecordEnabled,
        autoRecordMode: runtimeConfig.autoRecordMode,
        oshiList: runtimeConfig.oshiList,
        hasApiKey: Boolean(activeKey),
        apiKeyPreview: activeKey
          ? `${activeKey.slice(0, 8)}...${activeKey.slice(-4)}`
          : "",
        isCloudServerless: true,
      });
    }

    if (pathname === "/api/config" && method === "POST") {
      const body = (await req.json().catch(() => ({}))) as any;
      if (typeof body.autoRecordEnabled === "boolean") {
        runtimeConfig.autoRecordEnabled = body.autoRecordEnabled;
      }
      if (typeof body.autoRecordMode === "string") {
        runtimeConfig.autoRecordMode = body.autoRecordMode;
      }
      if (Array.isArray(body.oshiList)) {
        runtimeConfig.oshiList = body.oshiList.map((s: any) => String(s).trim()).filter(Boolean);
      }
      if (typeof body.jkt48ConnectApiKey === "string" && body.jkt48ConnectApiKey.trim()) {
        runtimeConfig.customApiKey = body.jkt48ConnectApiKey.trim();
      }
      return Response.json({ ok: true, config: runtimeConfig });
    }

    // 7. GET /api/recordings
    if (pathname === "/api/recordings" && method === "GET") {
      return Response.json({
        count: 0,
        recordings: [],
        activeRecorders: [],
        isCloudServerless: true,
      });
    }

    // 8. GET /api/stream-proxy
    if (pathname === "/api/stream-proxy" && method === "GET") {
      const targetUrl = normalizeMediaUrl(url.searchParams.get("url") || "");
      if (!targetUrl) {
        return Response.json({ error: "Missing url param" }, { status: 400 });
      }

      const upstream = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
        },
      });

      const contentType = upstream.headers.get("content-type") || "";
      if (targetUrl.includes(".m3u8") || contentType.includes("mpegurl")) {
        const text = await upstream.text();
        const baseUrl = new URL(targetUrl);
        const rewritten = text
          .split("\n")
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return line;
            const resolved = new URL(trimmed, baseUrl).toString();
            return `/api/stream-proxy?url=${encodeURIComponent(resolved)}`;
          })
          .join("\n");

        return new Response(rewritten, {
          status: 200,
          headers: {
            "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": contentType || "video/MP2T",
          "cache-control": "public, max-age=60",
        },
      });
    }

    return Response.json({ error: "Endpoint tidak ditemukan" }, { status: 404 });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
};

export const config = {
  path: ["/api/*"],
};
