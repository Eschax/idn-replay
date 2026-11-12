process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const handleRequest = require('./server.js');

function invoke(method, url, { bodyObj = null, headers = {} } = {}) {
  return new Promise(resolve => {
    const req = Object.assign(new EventEmitter(), {
      method,
      url,
      headers: { host: 'localhost:3048', ...headers },
      socket: { remoteAddress: headers['x-forwarded-for'] || '127.0.0.1' },
      destroy() {}
    });
    let status = 200;
    const resHeaders = {};
    const chunks = [];
    const res = Object.assign(new EventEmitter(), {
      writableEnded: false,
      writeHead(s, h = {}) {
        status = s;
        for (const [k, v] of Object.entries(h)) {
          resHeaders[k.toLowerCase()] = v;
        }
      },
      write(c) {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        return true;
      },
      end(c) {
        this.writableEnded = true;
        if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {}
        resolve({ status, headers: resHeaders, raw, json });
      }
    });
    handleRequest(req, res);
    if (bodyObj) req.emit('data', JSON.stringify(bodyObj));
    req.emit('end');
  });
}

function extractCookie(setCookieHeader) {
  assert.ok(setCookieHeader, 'Expected Set-Cookie header');
  return String(setCookieHeader).split(';')[0];
}

(async () => {
  // 1. Validasi recId (mencegah path traversal)
  assert.equal(handleRequest.isValidRecId('rec_jkt48_trisha_12345'), true);
  assert.equal(handleRequest.isValidRecId('../data'), false);
  assert.equal(handleRequest.isValidRecId('rec_../data'), false);

  // 2. Validasi allowlist URL stream (mencegah SSRF)
  assert.equal(
    handleRequest.isAllowedStreamUrl('https://api.jkt48connect.app/media/live/abc/recording.m3u8'),
    true
  );
  assert.equal(handleRequest.isAllowedStreamUrl('http://127.0.0.1:3048/api/oshi'), false);
  assert.equal(handleRequest.isAllowedStreamUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(handleRequest.isAllowedStreamUrl('file:///etc/passwd'), false);
  assert.equal(handleRequest.normalizePlaybackUrl('http://127.0.0.1:3048/video.mp4'), '');
  assert.equal(handleRequest.normalizePlaybackUrl('http://localhost/video.m3u8'), '');
  assert.equal(handleRequest.normalizePlaybackUrl('file:///video.mp4'), '');
  assert.equal(
    handleRequest.normalizePlaybackUrl('https://api.jkt48connect.app/media/video.mp4'),
    'https://api.jkt48connect.app/media/video.mp4'
  );
  assert.equal(
    handleRequest.resolveReplayPlayerUrl('http://127.0.0.1:8878/replay/123', 'replay-id', '123'),
    'https://api.jkt48connect.app/replay/replay-id/123'
  );
  assert.equal(
    handleRequest.resolveReplayPlayerUrl('', 'replay-id', 'run/1'),
    'https://api.jkt48connect.app/replay/replay-id/run%2F1'
  );
  assert.equal(handleRequest.resolveReplayPlayerUrl('http://127.0.0.1:8878/replay', 'replay-id', null), '');
  assert.equal(
    handleRequest.resolveReplayPlayerUrl('https://cdn.example/replay/123', 'replay-id', '123'),
    'https://cdn.example/replay/123'
  );

  // 3. Validasi formatRecentItem kontrak
  const card = handleRequest.formatRecentItem({
    data_id: 'live-123',
    room_id: 332503,
    type: 'idn',
    member: { name: 'Jazzlyn Trisha', nickname: 'Trisha' },
    idn: { title: 'Sore!' },
    live_info: { duration: 3600000, viewers: { num: 15000 } },
    playback: { status: 'ready', stream_url: 'https://api.jkt48connect.app:8443/media/live/live-123/recording.m3u8' }
  });
  assert.equal(card.dataId, 'live-123');
  assert.equal(card.platform, 'IDN');
  assert.equal(card.nickname, 'Trisha');
  assert.equal(card.durationSeconds, 3600);
  assert.equal(card.streamUrl, 'https://api.jkt48connect.app/media/live/live-123/recording.m3u8');
  const fallbackCard = handleRequest.formatRecentItem({
    type: 'idn',
    playback: { stream_url: 'http://127.0.0.1:3048/recording.m3u8' },
    recording: { stream_url: 'https://api.jkt48connect.app/media/live/fallback/recording.m3u8' }
  });
  assert.equal(
    fallbackCard.streamUrl,
    'https://api.jkt48connect.app/media/live/fallback/recording.m3u8'
  );

  // 4. Global Auth Gate: semua endpoint data wajib 401 tanpa login
  const protectedEndpoints = [
    ['GET', '/api/replays'],
    ['GET', '/api/replays/live-123'],
    ['GET', '/api/now-live'],
    ['GET', '/api/members'],
    ['GET', '/api/oshi'],
    ['POST', '/api/oshi'],
    ['GET', '/api/comments?mode=local&recId=rec_abc_1'],
    ['GET', '/api/hls-proxy?url=https://api.jkt48connect.app/media/a.m3u8'],
    ['GET', '/api/download-mp4?url=https://api.jkt48connect.app/media/a.mp4'],
    ['GET', '/api/recordings'],
    ['POST', '/api/record/start'],
    ['POST', '/api/telegram/test'],
    ['GET', '/recordings/rec_abc_1/index.m3u8']
  ];
  for (const [m, u] of protectedEndpoints) {
    const r = await invoke(m, u);
    assert.equal(r.status, 401, `Expected 401 on unauthenticated ${m} ${u}, got ${r.status}`);
    assert.equal(r.headers['access-control-allow-origin'], undefined, 'Must not expose wildcard CORS');
  }

  // Webhook Telegram tanpa secret wajib ditolak (403)
  const badWebhook = await invoke('POST', '/api/telegram/webhook', {
    bodyObj: { message: { chat: { id: 1 }, text: '/live' } }
  });
  assert.equal(badWebhook.status, 403);

  // 5. Tes Login Akun 1 (escha), Akun 2 (oshi48), Password Salah & Logout
  const meAnon = await invoke('GET', '/api/auth/me');
  assert.equal(meAnon.status, 200);
  assert.equal(meAnon.json.authenticated, false);

  const wrongLogin = await invoke('POST', '/api/auth/login', {
    bodyObj: { username: 'escha', password: 'wrong-password' },
    headers: { 'x-forwarded-for': '198.51.100.10' }
  });
  assert.equal(wrongLogin.status, 401);

  const login1 = await invoke('POST', '/api/auth/login', {
    bodyObj: { username: 'escha', password: 'Escha48!oix2' }
  });
  assert.equal(login1.status, 200);
  assert.equal(login1.json.user.username, 'escha');
  assert.equal(login1.json.apiKey, undefined, 'Raw API key must never be returned by login');
  assert.match(login1.headers['set-cookie'], /HttpOnly/);
  const cookie1 = extractCookie(login1.headers['set-cookie']);

  const me1 = await invoke('GET', '/api/auth/me', { headers: { cookie: cookie1 } });
  assert.equal(me1.json.authenticated, true);
  assert.equal(me1.json.user.username, 'escha');
  assert.equal(me1.json.apiKey, undefined, 'Raw API key must never be returned by auth/me');

  const login2 = await invoke('POST', '/api/auth/login', {
    bodyObj: { username: 'oshi48', password: 'Oshi48!Nsu_' }
  });
  assert.equal(login2.status, 200);
  assert.equal(login2.json.user.username, 'oshi48');
  const cookie2 = extractCookie(login2.headers['set-cookie']);

  const me2 = await invoke('GET', '/api/auth/me', { headers: { cookie: cookie2 } });
  assert.equal(me2.json.authenticated, true);
  assert.equal(me2.json.user.username, 'oshi48');

  // Brute-force limiter check on isolated IP
  for (let i = 0; i < 8; i++) {
    await invoke('POST', '/api/auth/login', {
      bodyObj: { username: 'escha', password: 'bad' },
      headers: { 'x-forwarded-for': '203.0.113.77' }
    });
  }
  const rateLimited = await invoke('POST', '/api/auth/login', {
    bodyObj: { username: 'escha', password: 'Escha48!oix2' },
    headers: { 'x-forwarded-for': '203.0.113.77' }
  });
  assert.equal(rateLimited.status, 429);

  // 6. Tes /api/oshi terautentikasi & verifikasi TIDAK ADA kebocoran API key / Bot Token mentah
  const oshiRes = await invoke('GET', '/api/oshi', { headers: { cookie: cookie1 } });
  assert.equal(oshiRes.status, 200);
  assert.equal(oshiRes.json.ok, true);
  assert.equal(oshiRes.json.data.jkt48ConnectApiKey, undefined, 'Raw API key must NOT be returned');
  assert.equal(oshiRes.json.data.telegramBotToken, undefined, 'Raw Telegram token must NOT be returned');
  assert.equal(oshiRes.json.data.authSecret, undefined, 'authSecret must NOT be returned');
  assert.equal(/jkc_[a-f0-9]{20,}/i.test(oshiRes.raw), false, 'Full jkc_ key must never appear in JSON');

  // Validasi route guard saat sudah login
  const badRecRes = await invoke('GET', '/api/comments?mode=local&recId=../data', {
    headers: { cookie: cookie1 }
  });
  assert.equal(badRecRes.status, 400);

  const badProxyRes = await invoke('GET', '/api/hls-proxy?url=http://127.0.0.1:3048', {
    headers: { cookie: cookie1 }
  });
  assert.equal(badProxyRes.status, 400);

  const logoutRes = await invoke('POST', '/api/auth/logout', { headers: { cookie: cookie1 } });
  assert.equal(logoutRes.status, 200);
  assert.match(logoutRes.headers['set-cookie'], /Max-Age=0/);

  // 7. Static source audit: pastikan tidak ada API key atau password plaintext di file publik / git-tracked
  const filesToAudit = [
    'server.js',
    'render.yaml',
    'public/index.html',
    'public/app.js',
    'public/style.css',
    'netlify/functions/api.mts',
    'netlify/functions/live-notifier.mts'
  ];
  for (const rel of filesToAudit) {
    const content = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.equal(
      /jkc_[a-z0-9]{16,}/i.test(content),
      false,
      `SECURITY FAIL: Found hardcoded JKT48Connect API key in ${rel}!`
    );
    assert.equal(
      content.includes('Escha48!oix2') || content.includes('Oshi48!Nsu_'),
      false,
      `SECURITY FAIL: Found plaintext password in ${rel}!`
    );
  }

  console.log('ALL SECURITY, AUTH, AND CONTRACT TESTS PASSED');
})();
