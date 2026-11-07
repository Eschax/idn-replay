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
