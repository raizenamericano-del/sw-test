# IM Status Hub

Admin-only workspace full-stack untuk memantau koneksi perangkat tertaut WhatsApp, menampilkan event Status yang benar-benar diterima, mengelola media, dan melihat riwayat unduhan. UI responsif untuk Android/ponsel dan desktop; proyek memakai Next.js, Prisma/PostgreSQL, S3-compatible storage, dan siap dikelola lewat GitHub/Railway.

> **Peringatan integrasi:** Baileys adalah library WhatsApp Web tidak resmi, bukan API Meta. Penggunaan otomasi dapat melanggar ketentuan platform atau menyebabkan perangkat/akun dibatasi. Feed Status masuk melalui Baileys **eksperimental, belum diuji dengan akun WhatsApp nyata dalam proyek ini, dan tidak dijamin oleh upstream**. Aplikasi hanya memproses event yang benar-benar dikirim ke akun tertaut; tidak mengambil Status tersembunyi, tidak membypass kontrol privasi, dan tidak membuat data contoh.

## Cakupan implementasi

| Area | Status | Keterangan |
|---|---|---|
| Admin dashboard dan login sederhana | ✅ | Satu admin; credential dari environment; cookie HttpOnly, HMAC, SameSite Strict, cek origin/CSRF, rate limit. |
| Pairing code | ✅ Diimplementasikan | Nomor dengan kode negara dikirim pemilik akun; kode aktual dari Baileys dikembalikan hanya kepada admin yang login. Kode tidak disimpan atau dicatat di log. |
| Status koneksi WhatsApp | ✅ Aktual | `connected` hanya setelah event socket `open`, bukan karena tombol ditekan atau pairing code ditampilkan. |
| Status Center | ⚠️ Eksperimental | Hanya event `status@broadcast` yang diterima socket; daftar cache sementara di memori proses (maks. 500 item/24 jam), tidak dipulihkan saat restart. Feed masuk tidak dijamin. |
| Preview / unduh Status | ⚠️ Eksperimental | Media diambil hanya saat admin membuka preview atau mengunduh item yang nyata diterima. Unduhan disimpan ke Media Library dan dicatat di riwayat. |
| Media Library | ✅ | Upload manual foto/video, preview, pencarian/filter, grid/list, download ulang, hapus, pemeriksaan signature, deduplikasi, dan retensi. Status tersimpan diberi sumber provider. |
| Riwayat unduhan dan activity log | ✅ | Menyimpan status backend `waiting → processing → completed/failed`; tidak mencatat pairing code, isi status, atau token. |
| Persistensi sesi | ✅ | Kredensial Baileys dienkripsi AES-256-GCM sebelum disimpan dalam PostgreSQL atau local JSON. Kunci enkripsi harus disimpan sebagai secret. |
| PostgreSQL + Prisma | ✅ | Local preview memakai atomic JSON untuk satu proses; production mewajibkan PostgreSQL dan menjalankan migrasi. |
| Penyimpanan media persisten | ✅ | S3-compatible object storage di production. Local disk hanya development; filesystem container Railway tidak dianggap persisten. |
| Notifikasi aktivitas / retensi | ✅ | Activity SSE dan cleanup media yang dapat dijadwalkan melalui Railway Cron. |

## Baileys, dukungan Status, dan privasi

- Aplikasi menggunakan `@whiskeysockets/baileys` **7.0.0-rc14** (release candidate). Versi ini membutuhkan Node.js 20+ dan dapat memiliki breaking changes.
- Pairing code mengikuti alur linked-device Baileys. Masukkan nomor milik Anda sendiri dengan kode negara; kode yang dikembalikan hanya ditampilkan dalam UI admin. Jangan mengirimkannya kepada operator, memasukkannya ke issue/log/chat, atau membagikannya kepada pihak lain.
- Saat ini, sumber yang diperiksa mendokumentasikan pairing dan penerbitan Stories, tetapi tidak menjamin bahwa feed Status masuk stabil atau lengkap. Implementasi memasang listener untuk pesan nyata bertipe `status@broadcast`; item yang tidak pernah diterima tidak ditampilkan dan tidak bisa diunduh. Empty state bukan bukti bahwa akun tidak memiliki Status.
- Status yang diterima disimpan sementara pada memori satu proses; item tidak disinkronkan lintas replica dan hilang setelah restart. Auth perangkat tersimpan terenkripsi dan dapat digunakan untuk menyambung kembali.
- Tidak ada crawling kontak, polling tersembunyi, bypass pengaturan audiens, akses ke akun lain, atau status palsu. Pemilik akun yang menautkan perangkat tetap perlu memiliki hak/izin yang diperlukan atas konten Status yang diproses.
- Halaman **Putuskan** mencoba logout jika koneksi aktif lalu menghapus kredensial terenkripsi lokal. Jika server tidak bisa menjangkau WhatsApp, hapus perangkat tertaut secara manual dari WhatsApp di ponsel.
- Meta Cloud API resmi tetap tidak menyediakan feed WhatsApp Status/Stories umum; Baileys bukan alternatif resmi atau dukungan Meta. Periksa syarat penggunaan dan hukum privasi yang berlaku sebelum memakai integrasi.

Sumber dokumentasi yang menjadi konteks (ditinjau 15 Oktober 2026):

- [Baileys di npm](https://www.npmjs.com/package/@whiskeysockets/baileys)
- [Pairing code](https://baileys.wiki/authentication/pairing-code) dan [session management](https://baileys.wiki/authentication/session-management)
- [Baileys — media messages](https://baileys.wiki/messaging/media-messages) dan [Broadcasts & Stories](https://baileys.wiki/features/broadcasts-stories)
- [Meta — Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) — Status tidak didukung dalam konteks Cloud API/coexistence.
- [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service) dan [Help Center — harvesting personal information](https://faq.whatsapp.com/434518851968943)

## Arsitektur

```text
Next.js App Router (UI + API route handlers)
 ├─ Admin auth: HMAC-signed HttpOnly cookie, env-based credential, CSRF checks
 ├─ Baileys provider: linked-device socket, real connection events, experimental status listener
 ├─ Auth storage: AES-256-GCM encrypted Baileys creds/keys in DB adapter
 ├─ Database: Prisma/PostgreSQL in production | atomic JSON store in local preview
 ├─ Media storage: S3-compatible bucket in production | .data/media in development
 └─ SSE: activity stream, auth cookie, heartbeat dan browser reconnect
```

Prisma schema memiliki tabel `users`, `whatsapp_sessions`, `media_assets`, `download_history`, `activity_logs`, dan `user_preferences`. `whatsapp_sessions.authStateCiphertext` hanya berisi envelope terenkripsi; key AES tidak disimpan dalam database. Password admin dan semua secret tetap di environment.

### Satu replica diperlukan

Baileys WebSocket dan cache feed status berjalan di memori satu proses. Jalankan Railway app dengan **satu replica/instance**. Multi-instance, autoscaling beberapa replica, distribusi status, dan leader election belum diimplementasikan. File media boleh berada di S3, tetapi itu tidak membuat feed status atau socket multi-instance.

## Instalasi lokal

Persyaratan: Node.js `>=20.9`, npm 10+.

```bash
npm ci
cp .env.example .env.local
openssl rand -hex 32  # masukkan hasilnya sebagai WHATSAPP_AUTH_ENCRYPTION_KEY
npm run dev
```

Edit `.env.local` dan set `WHATSAPP_AUTH_ENCRYPTION_KEY` sebelum menghubungkan akun. Untuk preview tanpa PostgreSQL, `DATABASE_URL=` kosong memakai `.data/state.json`, sementara file media disimpan di `.data/media/`.

Kredensial lokal hanya untuk development:

```text
username: admin
password: imhub-demo-2026
```

Ganti sebelum deploy. Buka `http://localhost:3000`. Untuk PostgreSQL lokal:

```bash
npm run db:generate
npm run db:migrate
```

## Environment variables

| Variable | Wajib | Tujuan |
|---|---:|---|
| `ADMIN_USERNAME` | Ya | Username satu-satunya admin. |
| `ADMIN_PASSWORD` | Ya | Password admin; tidak pernah dikirim kembali ke browser. Gunakan password kuat. |
| `SESSION_SECRET` | Ya | Minimal 32 byte acak untuk cookie; buat dengan `openssl rand -base64 48`. |
| `WHATSAPP_AUTH_ENCRYPTION_KEY` | Saat menggunakan Baileys | Kunci AES-256 32-byte dalam format hex 64 karakter atau base64. Buat `openssl rand -hex 32`; jangan pernah commit atau mengubahnya tanpa rencana logout/re-pair. |
| `DATABASE_URL` | Production | URL Railway PostgreSQL. Wajib; tidak ada fallback JSON di production. |
| `S3_BUCKET` | Production | Bucket persisten untuk Media Library. |
| `S3_REGION` | Jika S3 | Region provider, default `auto` (sesuaikan provider). |
| `S3_ENDPOINT` | Jika diperlukan | Endpoint S3-compatible, mis. R2. Jangan isi dari input pengguna. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Jika diperlukan | Credential bucket atau gunakan IAM role jika tersedia. Simpan sebagai Railway variables. |
| `S3_FORCE_PATH_STYLE` | Opsional | Default `true`; ubah jika provider perlu virtual-host style. |
| `DATA_DIR` | Opsional | Direktori JSON/file lokal; bukan storage persisten production. |
| `MAX_UPLOAD_MB` | Opsional | Batas upload dan media unduhan (1–500 MB, default 100). |
| `APP_BASE_URL` | Disarankan di production | Origin publik untuk pemeriksaan CSRF di belakang reverse proxy. |

`.env.local`, `.data`, dan secret tidak dikomit (`.gitignore`). Session signature terikat pada password admin; mengubah password membatalkan cookie admin sebelumnya. **Jangan hilangkan atau ubah `WHATSAPP_AUTH_ENCRYPTION_KEY`** setelah kredensial Baileys tersimpan: kunci yang berbeda membuat session lama tidak dapat dibaca.

## Database dan storage

- `DATABASE_URL` kosong di development memakai adapter JSON atomic untuk satu proses.
- `DATABASE_URL` ada memakai Prisma/PostgreSQL dan migrasi di `prisma/migrations/`.
- `NODE_ENV=production` tanpa konfigurasi S3 menonaktifkan media read/write; aplikasi tidak diam-diam memakai filesystem ephemeral Railway.
- Semua lookup media memeriksa identitas admin. Storage key dibuat server dari ID acak dan divalidasi sebelum digunakan.
- Kredensial Baileys dilindungi AES-256-GCM sebelum ditulis ke DB/local JSON. Siapa pun yang memiliki akses ke aplikasi dan key environment dapat mengakses sesi; batasi akses Railway/GitHub dan backup secret dengan aman.

## API ringkas

Semua endpoint admin selain login dan health memerlukan cookie admin. Mutasi memeriksa `Origin`/`Sec-Fetch-Site`.

| Endpoint | Fungsi |
|---|---|
| `GET /api/health` | Health database, storage, dan keterangan capability WhatsApp; tidak menampilkan secret. |
| `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me` | Sesi admin. |
| `GET /api/dashboard` | Statistik aktual, activity, health, dan status sesi. |
| `GET /api/session` | Status koneksi aktual dan capability provider. |
| `POST /api/session/connect` | Body `{ "phone": "628…" }`; memulai Baileys dan mengembalikan pairing code aktual hanya ke admin terautentikasi. Rate limited. |
| `POST /api/session/disconnect` | Mencoba logout, menghapus kredensial terenkripsi, menandai sesi disconnected. |
| `GET /api/statuses` | Status feed eksperimen; hanya event aktual dari cache proses, `no-store`. |
| `GET /api/statuses/:id/content` | Preview privat media status yang masih ada di sesi/cache. |
| `POST /api/statuses/:id/download` | Unduh media aktual, simpan ke Library/S3, dan catat riwayat. |
| `GET /api/library?q=&type=` / `POST /api/library/upload` | Daftar/upload media privat dengan signature, MIME, limit, dan dedupe checks. |
| `GET /api/media/:id/content` / `POST /api/media/:id/download` / `DELETE /api/media/:id` | Preview, download, dan hapus media milik admin. |
| `GET /api/history` | Riwayat download. |
| `GET/PUT /api/settings` dan `POST /api/settings/cleanup` | Pengaturan retensi dan pembersihan media. |
| `GET /api/events` | SSE aktivitas same-origin. |

Pairing code tidak ditulis ke log atau database. Endpoint download mencatat hasil sukses/gagal, tetapi tidak menyimpan isi Status atau teks caption di activity log.

## Testing

Jalankan sebelum deploy:

```bash
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
npm run build
```

Tes lokal tidak menghubungi WhatsApp. Cakupan mencakup session signing/tampering/expiry, sanitasi dan validasi media, storage key/path traversal, ownership isolation, state download, JSON DB, timeout, rate limit, duplicate-download lock, dan enkripsi autentikasi. **Belum ada tes pada akun WhatsApp nyata, PostgreSQL production, atau bucket S3 provider tertentu.** Tidak ada klaim bahwa event Status masuk telah terbukti bekerja pada akun/perangkat nyata.

## GitHub

```bash
git init
git add .
git commit -m "Build IM Status Hub"
git branch -M main
git remote add origin <URL_REPOSITORY>
git push -u origin main
```

Sebelum push, pastikan `.env.local`, `.data`, kredensial DB, auth session, dan key S3/AES tidak ikut Git. ZIP source tidak menyertakan data lokal atau secrets.

## Deploy ke Railway

1. Push repository ke GitHub dan buat service Railway dari repository. `railway.json` memakai Dockerfile; image menjalankan Prisma migrate lalu Next.js di port 3000/`0.0.0.0`.
2. Tambah Railway PostgreSQL dan set `DATABASE_URL` pada service aplikasi.
3. Konfigurasikan bucket S3-compatible persisten dan isi `S3_BUCKET`, region, endpoint, serta akses key bila diperlukan.
4. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, dan `WHATSAPP_AUTH_ENCRYPTION_KEY` sebagai Railway Variables. Buat secret acak (`openssl rand -base64 48` untuk session, `openssl rand -hex 32` untuk key enkripsi). Isi `APP_BASE_URL` dengan URL publik dan hapus password demo.
5. Set replica/instance aplikasi menjadi **satu**. Socket Baileys dan cache Status berjalan di memori proses dan tidak didistribusikan.
6. Deploy. Uji health, login, storage upload/preview/download/hapus, lalu pairing hanya dengan akun milik Anda. Status feed mungkin tetap kosong—itu batas eksperimen, bukan jaminan koneksi rusak.
7. Opsional: Railway Cron menjalankan `npm run retention:cleanup` setiap hari, menggunakan variable DB/S3 yang sama.

## Troubleshooting

- **Login production gagal:** cek `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, dan migration.
- **Tidak bisa membuat pairing code:** cek format nomor (8–15 digit dan kode negara), batas rate limit, koneksi server, dan `WHATSAPP_AUTH_ENCRYPTION_KEY`.
- **Session lama tidak bisa dipulihkan:** pastikan key AES tetap sama dan DB/session ciphertext tersedia. Jangan menaruh isi session ke GitHub; logout/re-pair hanya jika Anda pemilik akun.
- **Dashboard tidak menunjukkan Connected:** pairing code bukan bukti koneksi; periksa apakah kode dimasukkan pada ponsel pemilik dan cek event koneksi aktual.
- **Status Center kosong:** Baileys upstream tidak menjamin feed Status masuk stabil. Aplikasi tidak mengisi data palsu, melakukan crawling, atau meminta konten yang tidak diterima akun.
- **Koneksi terputus setelah restart/migrasi:** pastikan tetap satu replica dan sesi tersimpan di PostgreSQL. Status cache sementara memang hilang ketika proses restart.
- **Health 503 atau upload gagal:** periksa PostgreSQL dan S3 Railway. Response health tidak menampilkan secret.
- **Akun tetap tertaut setelah menekan Putuskan:** hapus perangkat dari menu Perangkat tertaut WhatsApp di ponsel jika server tidak bisa menyelesaikan logout.

## Lisensi & atribusi

IM Status Hub tidak berafiliasi dengan atau didukung resmi oleh WhatsApp/Meta. Baileys mengikuti lisensi MIT; library pihak ketiga lainnya mengikuti lisensi masing-masing. Penggunaan library tidak resmi sepenuhnya merupakan risiko pengguna/operator.
