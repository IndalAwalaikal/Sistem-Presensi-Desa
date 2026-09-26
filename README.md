# Presensi dan Monitoring Kedisiplinan

### Desa Anabanua · Kabupaten Barru

Aplikasi web dan PWA untuk membantu pemerintah desa mengelola presensi serta
memantau kedisiplinan perangkat desa. Sistem menggabungkan verifikasi wajah,
pemeriksaan lokasi, pencatatan waktu dari server, pengajuan ketidakhadiran, dan
pelaporan dalam satu aplikasi.

<p align="center">
  <strong>Disusun oleh Tim Lentera Anabanua</strong><br />
  KKN-PPL Angkatan XXXIII · Universitas Negeri Makassar
</p>

## Jelajahi Dokumentasi

- [Gambaran aplikasi](#gambaran-aplikasi)
- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Menjalankan dengan Docker](#menjalankan-dengan-docker)
- [Pengembangan frontend](#pengembangan-frontend)
- [Konfigurasi dan keamanan](#konfigurasi-dan-keamanan)
- [Pemeriksaan kode](#pemeriksaan-kode)
- [Dokumentasi lainnya](#dokumentasi-lainnya)
- [Tim pengembang](#tim-pengembang)
- [Lisensi](#lisensi)

## Gambaran aplikasi

Aplikasi ini mendukung alur presensi perangkat Desa Anabanua, mulai dari
presensi datang dan pulang hingga pemantauan, pengajuan, dan rekap. Verifikasi
wajah dan lokasi diproses sebagai bagian dari pemeriksaan presensi; waktu
presensi ditentukan oleh server.

## Fitur

- Presensi datang dan pulang dengan verifikasi wajah dan pemeriksaan lokasi.
- Pengelolaan akun serta aktivasi perangkat desa menggunakan kode sekali pakai.
- Pengajuan izin, sakit, cuti, bekerja dari rumah, dan dinas luar beserta alur
  persetujuan.
- Permohonan koreksi presensi dengan alasan dan keputusan yang tercatat.
- Pengaturan jadwal kerja, lokasi kantor, dan kalender hari libur.
- Monitoring harian, rekap bulanan, ekspor CSV, serta laporan PDF.
- Identitas kepala desa dan sekretaris pada laporan diambil dari data akun.
- Pencatatan audit untuk perubahan administrasi.

Mode mock tersedia untuk demonstrasi antarmuka. Data presensi dan verifikasi
wajah pada mode tersebut disimulasikan, sehingga tidak sesuai untuk operasional.

## Teknologi

| Bagian | Teknologi | Peran |
|---|---|---|
| `frontend/` | Next.js, TypeScript | Antarmuka web dan PWA |
| `backend/` | Go, MySQL | API, autentikasi, aturan bisnis, dan penyimpanan |
| `ai-service/` | Python, FastAPI | Embedding dan verifikasi wajah |

## Menjalankan dengan Docker

### Persyaratan

- Docker dan Docker Compose v2.
- Koneksi internet dan ruang disk yang cukup untuk mengunduh serta menyiapkan
  model wajah pada build pertama.

### Persiapan

Salin berkas contoh konfigurasi:

```bash
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
```

Sebelum menjalankan aplikasi, perbarui nilai di kedua berkas tersebut:

- Buat `JWT_SECRET` acak, misalnya dengan `openssl rand -base64 48`.
- Tetapkan sandi MySQL yang kuat. Samakan `DB_NAME`, `DB_USER`, dan
  `DB_PASSWORD` dengan pasangan `MYSQL_DATABASE`, `MYSQL_USER`, dan
  `MYSQL_PASSWORD`.
- Tetapkan sandi kuat untuk `SEED_SEKRETARIS_SANDI` dan
  `SEED_KEPALA_SANDI`, serta isi nama dan NIP/NIK awal yang benar.
- Gunakan nilai `AI_API_KEY` yang sama pada konfigurasi backend dan AI.

Jalankan seluruh layanan dari direktori root:

```bash
docker compose up -d --build
```

Compose menjalankan MySQL, layanan AI, API Go, dan frontend. Migrasi basis data
dijalankan saat API mulai. Akun sekretaris dan kepala desa awal dibuat dari
variabel `SEED_*` bila akun tersebut belum tersedia. Build pertama layanan AI
dapat memerlukan waktu lebih lama karena model InsightFace perlu disiapkan.

| Layanan | Alamat lokal |
|---|---|
| Frontend | <http://localhost:3080> |
| API | <http://localhost:8080/api/kesehatan> |
| AI | <http://localhost:8100/healthz> |
| MySQL | `localhost:3307` |

Port host diikat ke loopback. Backend dan layanan AI berkomunikasi melalui
jaringan internal Docker. Data MySQL tersimpan di volume Docker dan tetap ada
setelah layanan dihentikan. Perubahan variabel inisialisasi MySQL tidak
mengubah basis data yang telah dibuat. `docker compose ps` menampilkan status
healthcheck API, AI, dan database; API memeriksa koneksi database sebelum
melaporkan dirinya siap.

Perintah operasional yang umum:

```bash
docker compose logs -f api
docker compose logs -f ai
docker compose down
```

### Backup dan pemulihan

Buat backup terkompresi dari database yang sedang berjalan:

```bash
./scripts/backup-db.sh
```

Berkas disimpan di `backups/` dengan izin akses terbatas dan dikecualikan dari
Git. Secara bawaan, backup lokal lebih lama dari 30 hari dihapus setelah
backup baru berhasil; ubah masa simpan dengan `BACKUP_KEEP_DAYS`. Untuk backup
terjadwal harian, tambahkan cron pada server yang menjalankan Docker:

```cron
0 2 * * * cd '/jalur/ke/project' && mkdir -p backups && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

Salin backup berkala ke media terpisah yang terenkripsi dan memiliki akses
terbatas. Backup berisi data pribadi; jangan membagikannya lewat kanal publik.

Pemulihan akan menimpa database aktif. Uji dahulu pada lingkungan staging, lalu
jalankan pemulihan dengan konfirmasi eksplisit:

```bash
./scripts/restore-db.sh backups/nama-berkas.sql.gz
```

Setelah pemulihan, periksa log API, login, data presensi, dan laporan sebelum
membuka aplikasi untuk penggunaan kembali. Tentukan jadwal backup dan masa
simpan sesuai kebutuhan operasional desa; hapus backup lama secara aman.

## Pengembangan frontend

Untuk menjalankan Next.js secara lokal sementara API tersedia dari Docker:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Pastikan `CORS_ORIGINS` di `backend/.env` mencakup `http://localhost:3000`, lalu
buka <http://localhost:3000>. Untuk menjalankan frontend tanpa API, atur
`NEXT_PUBLIC_API_MODE=mock` di `frontend/.env.local`. Mode ini hanya untuk
pengembangan dan demonstrasi.

## Konfigurasi dan keamanan

- Jangan commit `backend/.env`, `ai-service/.env`, atau `frontend/.env.local`.
  Gunakan berkas `.env.example` sebagai templat.
- Gunakan HTTPS untuk deployment. Sesi browser menggunakan cookie `HttpOnly`
  dan `Secure`; API produksi hanya menerima sesi cookie.
- Frontend menerapkan Content Security Policy dengan nonce per permintaan.
- Atur `CORS_ORIGINS` ke origin frontend yang sah. Cookie lintas origin
  memerlukan CORS dengan kredensial dan pemeriksaan `Origin`.
- Untuk deployment di luar Compose lokal, atur `APP_ENV=production` pada API dan
  layanan AI. Bangun frontend dengan `NEXT_PUBLIC_API_BASE_URL` yang dapat
  dijangkau browser melalui HTTPS.
- Compose menjalankan API dan AI dalam mode produksi. Backend memerlukan
  layanan AI dan frame gambar; layanan AI menolak provider demo atau fallback
  bila model produksi tidak tersedia.
- Foto enrollment hanya digunakan selama peninjauan. Setelah diterima atau
  ditolak, foto mentah dihapus; embedding hanya disimpan untuk enrollment yang
  disetujui dan diperlukan untuk verifikasi presensi. Menonaktifkan akun atau
  mereset sandinya menghapus foto dan embedding; akun perlu mendaftar wajah lagi
  setelah diaktifkan. Batasi akses database dan backup karena keduanya tetap
  memuat data biometrik serta data presensi.
- Jangan gunakan provider wajah demo atau mode mock untuk presensi operasional.

## Pemeriksaan kode

Jalankan dari direktori root:

```bash
(cd frontend && npm test)
(cd backend && go test ./...)
(cd ai-service && python3 -m compileall -q app)
(cd frontend && npm run build)
```

## Dokumentasi lainnya

- [Panduan backend](backend/README.md)
- [Panduan layanan AI](ai-service/README.md)
- [Dokumen sistem presensi](Dokumen_Sistem_Presensi_dan_Monitoring_Perangkat_Desa.docx)

## Tim pengembang

**Tim Lentera Anabanua**  
KKN-PPL Angkatan XXXIII  
Universitas Negeri Makassar

## Lisensi

Perangkat lunak ini tersedia di bawah [Lisensi MIT](LICENSE).
