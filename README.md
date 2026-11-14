# JKT48 Hybrid Replay & DVR Studio

Aplikasi web pribadi untuk menonton **Replay Instan** serta **Live Streaming** member JKT48 dari **IDN Live** dan **SHOWROOM** tanpa harus menunggu jeda 72 jam, dilengkapi dengan **Mesin Perekam Otomatis (Auto-Record DVR)** untuk member favorit (Oshi).

## Fitur Utama

1. **Replay Instan (Tanpa Tunggu 72 Jam)**
   - Mengambil daftar video replay penuh terbaru secara otomatis dari berbagai channel arsip cepat komunitas (*JKT48 Daily Live*, *Showroom JKT48*, *JKT48 Live Archives*, *SRlive JKT48*) dan indeks kronologis YouTube.
   - Filter cepat berdasarkan **Member JKT48**, **Platform** (`IDN Live` / `SHOWROOM`), serta durasi (**Full Replay $\ge$ 5 Menit**).
2. **Monitor Sedang Live + Local HLS Proxy**
   - Memantau member JKT48 yang sedang live secara *real-time* dan memutarnya langsung di browser melalui proxy HLS bawaan (`/api/hls-proxy`).
3. **DVR Pribadi & Auto-Record Oshi**
   - Merekam stream `.m3u8` secara otomatis ke folder `recordings/` saat Oshi terdeteksi live, tanpa memerlukan instalasi FFmpeg eksternal.

## Cara Menjalankan di Lokal

Pastikan [Node.js](https://nodejs.org/) (v18+) sudah terpasang, lalu jalankan:

```bash
node server.js
```

Atau klik dua kali file `start.bat` (Windows), lalu buka:
- **http://localhost:3048**

## Akses Online (GitHub Pages — Tanpa Server)

Situs statis tersedia di **https://eschax.github.io/idn-replay/** dan bisa dibuka dari mana saja tanpa login:

- GitHub Actions membake data (replay JKT48Connect, member, status live, arsip YouTube) ke `public/static-data/` setiap 30 menit, lalu deploy ke GitHub Pages.
- API key tidak perlu diisi manual — disimpan sebagai secret repo `JKT48CONNECT_API_KEY` dan hanya dipakai di Actions (tidak pernah dikirim ke browser).
- Jika API JKT48Connect sedang down saat bake, data terakhir yang berhasil dipertahankan (cache Actions).
- Fitur yang butuh server Node.js (login multi-user, DVR rekam lokal, chat real-time, HLS proxy) tidak tersedia di mode statis; replay diputar langsung dari mirror MP4/YouTube/HLS resmi.

## Konfigurasi API JKT48Connect (Mode Server Lokal/Netlify)

Replay dimuat oleh server agar API key tidak dikirim dari browser. Setelah login, isi API key melalui panel **API Key JKT48Connect (Server-Side)**. Untuk Netlify, atur environment variable `JKT48CONNECT_API_KEY` di Site configuration lalu deploy ulang. Jika key belum tersedia, endpoint replay mengembalikan `503` dan video tidak dapat diputar.
