/**
 * Membuat hash password untuk login gate mode statis (GitHub Pages).
 * Jalankan: node scripts/hash-password.js
 * Password diketik di terminal (tidak tampil / tidak masuk history), lalu
 * salin output JSON-nya untuk di-set sebagai kode STATIC_ACCOUNTS di app.js.
 */
const crypto = require('node:crypto');
const readline = require('node:readline');

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

(async () => {
  const username = (await ask('Username (default escha): ') || 'escha').trim().toLowerCase();
  const password = await ask('Password: ');
  if (!password) {
    console.error('Password kosong, dibatalkan.');
    process.exit(1);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  console.log('\nSalin ini ke STATIC_ACCOUNTS di public/app.js:');
  console.log(JSON.stringify({ username, salt, hash }, null, 2));
})();
