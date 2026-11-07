const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const handleRequest = require('./server.js');

function invoke(method, url, bodyObj) {
  return new Promise(resolve => {
    const req = Object.assign(new EventEmitter(), {
      method,
      url,
      headers: { host: 'localhost:3048' },
      destroy() {}
    });
    let status = 200;
    const chunks = [];
    const res = Object.assign(new EventEmitter(), {
      writeHead(s) {
        status = s;
      },
      write(c) {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        return true;
      },
      end(c) {
        if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {}
        resolve({ status, raw, json });
      }
    });
    handleRequest(req, res);
    if (bodyObj) req.emit('data', JSON.stringify(bodyObj));
    req.emit('end');
  });
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

  // 3. Validasi formatRecentItem kontrak dengan public/app.js
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

  // 4. Route kontrak /api/oshi, /api/comments?mode=local, /api/hls-proxy
  const oshiRes = await invoke('GET', '/api/oshi');
  assert.equal(oshiRes.status, 200);
  assert.equal(oshiRes.json.ok, true);
  assert.equal(Array.isArray(oshiRes.json.data.oshiList), true);

  const badRecRes = await invoke('GET', '/api/comments?mode=local&recId=../data');
  assert.equal(badRecRes.status, 400);

  const badProxyRes = await invoke('GET', '/api/hls-proxy?url=http://127.0.0.1:3048');
  assert.equal(badProxyRes.status, 400);

  console.log('ALL TESTS PASSED');
})();
