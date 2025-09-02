# YT Converter

Downloader & converter YouTube (MP4 / MP3) dengan Node.js (Express) + Vue 3 (Vite).

## Deploy Cepat (Ubuntu / Debian)
Satu perintah (root / sudo) untuk clone & jalan otomatis:

```bash
curl -fsSL https://raw.githubusercontent.com/TEGAR-SRC/yt-dw/main/scripts/setup-debian.sh | sudo bash -s -- --clone https://github.com/TEGAR-SRC/yt-dw.git --branch main
```
Otomatis melakukan:
- apt update & upgrade
- Install: curl, git, ffmpeg, Node.js 18 LTS
- Clone repo
- Install dependency backend & frontend
- Build frontend
- Generate .env default
- Setup systemd service `yt-converter.service`

Port default: 3000 (ubah dengan flag `--port 8080`).

## Opsi Tambahan Script
| Flag | Deskripsi |
|------|-----------|
| `--clone <url>` | URL repo git (jika tidak berada di folder project) |
| `--branch <nama>` | Branch (default: main) |
| `--port <angka>` | Ganti port (default 3000) |
| `--no-build-frontend` | Skip install & build frontend |
| `--pnpm` / `--yarn` | Gunakan package manager lain |
| `--dev` | Install build-essential tools |
| `--no-service` | Jangan buat systemd service (pakai nohup) |
| `--user <nama>` | User service (default www-data) |
| `--skip-update` | Skip apt update/upgrade |

Contoh: hanya setup tanpa systemd, port 8080:
```bash
curl -fsSL https://raw.githubusercontent.com/TEGAR-SRC/yt-dw/main/scripts/setup-debian.sh | sudo bash -s -- --clone https://github.com/TEGAR-SRC/yt-dw.git --no-service --port 8080
```

## Jalankan Manual (Development)
```bash
# Backend
npm install
npm run dev
# Frontend
cd frontend
npm install
npm run dev
```
Akses: http://localhost:3000 (server) dan http://localhost:5173 (Vite dev).

## Variabel Lingkungan
Lihat file `.env` (tidak dikomit). Contoh:
```
SITE_DOMAIN=yt-converter.elfan.id
API_DOMAIN=api.yt-converter.elfan.id
PORT=3000
DEBUG=0
VITE_SITE_DOMAIN=yt-converter.elfan.id
VITE_API_BASE_URL=https://api.yt-converter.elfan.id
```

## Fitur Utama
- Ekstraksi format dengan ytdl-core + fallback yt-dlp
- Kualitas MP4 adaptif + downscale dinamis (tanpa upscale palsu)
- Konversi MP3 kualitas tinggi
- Merge video-only + audio via ffmpeg
- Logging terstruktur (JSON, rotating harian)
- SEO meta + JSON-LD + sitemap + robots
- Filename aman + tag kualitas

## Lisensi
MIT
