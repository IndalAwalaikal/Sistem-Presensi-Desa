# Backend Go — Sistem Presensi Desa Anabanua

API untuk frontend Next.js (`../frontend`). Clean architecture:
`cmd/api` → `delivery/httpapi` → `usecase` → `port` (interface) →
`repository/mysql` + `security` + `facesvc`. Domain (`internal/domain`)
murni tanpa dependensi framework.

## Menjalankan

```bash
cd backend
cp .env.example .env          # lalu ISI nilai aslinya (JWT_SECRET, DB_*)
go mod tidy
make jalankan                 # atau: go run ./cmd/api
```

Persyaratan: Go 1.22+, MySQL 8. Skema dibuat otomatis dari `migrations/*.sql`
saat pertama berjalan (idempoten; lacak di `schema_migrations`).

Akun administratif pertama (sekretaris & kepala desa) **ditetapkan langsung
di basis data** — lihat `migrations/README-seeder.md`; tidak ada jalur
membuatnya dari aplikasi, selaras dengan aturan kewenangan frontend.

## Endpoint (semua memakai envelope JSON; galat selalu `{"pesan": "..."}`)

| Metode | Endpoint | Akses |
|---|---|---|
| GET | `/api/kesehatan` | publik |
| POST | `/api/auth/login` | publik (rate-limited per IP+email) |
| POST | `/api/auth/logout` | sesi (mencabut jti) |
| GET | `/api/auth/saya` | sesi |
| POST | `/api/profil` | sesi (telepon & alamat sendiri) |
| POST | `/api/profil/sandi` | sesi (sandi lama diperiksa; balasan 204) |
| GET | `/api/aktivasi/{kode}` | publik |
| POST | `/api/aktivasi/{kode}` | publik (kode sekali pakai) |
| GET | `/api/presensi/hari-ini`, `/api/presensi/saya`, `/api/konfigurasi` | sesi |
| POST | `/api/presensi` | sesi (biometrik ACTIVE) |
| GET/POST | `/api/enrollment/saya`, `/api/enrollment` | sesi |
| GET/POST | `/api/pengajuan/saya`, `/api/pengajuan`, `/api/pengajuan/{id}/batalkan` | sesi |
| * | `/api/admin/**` (pengguna, undangan, pengajuan, presensi, audit, rekap, jadwal, kantor, enrollment) | sekretaris/kepala desa |

Tidak ada endpoint khusus dashboard: halaman monitoring menyusun agregatnya di
inti frontend (`src/core/usecase/monitoring.ts`) dari API fitur di atas
(`/api/admin/pengguna`, `/api/admin/presensi?tanggal=`,
`/api/admin/pengajuan?status=`, `/api/konfigurasi` untuk jadwal & batas masuk).

### Hari tanpa presensi ikut dihitung ("tanpa keterangan")

Sistem sebelumnya hanya mengenal hadir dan terlambat. `GET /api/admin/rekap`
kini ikut menghitung `tanpaKeterangan`: hari kerja yang batas masuknya sudah
lewat, tanpa presensi masuk, dan tanpa izin/sakit/cuti disetujui. Hari sebelum
akun dibuat tidak dihitung; bulan yang belum berjalan selalu nol. Penutup hari
hanyalah izin, sakit, dan cuti (`RequestType.MenutupKehadiran`) — WFH dan dinas
luar tetap wajib presensi. Aturannya di `domain/laporan.go`
(`HariKerjaTertutup`/`TanpaKeterangan`), dipakai `LaporanUsecase.RekapBulanan`.

Angka `izin`/`sakit`/`cuti` pada rekap adalah **hari kerja efektif** yang dicakup
pengajuan (`domain.HariPengajuanBulan`), bukan jumlah berkas pengajuan: satu cuti
lima hari berarti lima hari, dan pengajuan yang menggulung dari bulan lalu tetap
menyumbang hari yang jatuh di bulan berjalan. Kueri lama
(`COUNT(*) … YEAR(mulai)/MONTH(mulai)`) menjawab keduanya dengan salah — satu
berkas dihitung satu hari, dan cuti lintas bulan hilang sepenuhnya (0).

### WFH & dinas luar tetap membuka presensi (`modeSaran`)

`GET /api/presensi/hari-ini` mengembalikan `kind: "IZIN"` hanya untuk pengajuan
yang menutup kehadiran (izin/sakit/cuti). Untuk WFH/dinas luar yang disetujui
statusnya tetap `BELUM_PRESENSI` beserta `modeSaran` — pintu presensi TIDAK
terkunci, karena keduanya tetap wajib presensi. `POST /api/presensi` lalu
memeriksa mode kiriman klien terhadap pengajuan hari itu
(`PresensiUsecase.modeTerbukaHariIni`); mode yang sah membebaskan syarat geofence
(radius maupun ambang akurasi), sementara jarak & akurasi yang terukur tetap
disimpan apa adanya sebagai bahan audit. Tanpa pemeriksaan itu siapa pun dapat
lolos radius hanya dengan menulis `mode: "WFH"`.

### Apa yang boleh diubah pemilik akun

`POST /api/profil` hanya menerima `phoneNumber` dan `address` — bukan karena
antarmuka tidak menyediakan kolomnya, melainkan karena tidak ada jalur tulisnya.
Nama lengkap, email dinas, NIP/NIK, jabatan, dan unit kerja bersumber dari berkas
kepegawaian desa dan ditetapkan pengelola akun saat akun dibuat; daftarnya
tercatat di `domain.FieldIdentitasTerkunci`, sedangkan yang dapat diurus sendiri
ada di `domain.FieldProfilMandiri`. Kata sandi hanya diketahui pemiliknya: reset
oleh pengelola akun menerbitkan kode undangan baru, bukan sandi baru.

Rute `/api/**` yang salah ketik atau salah metode tetap dibalas JSON
(`{"pesan": "..."}`) — lihat `RuteJSON` di `delivery/httpapi/alat.go`; tanpa itu
ServeMux membalas teks polos `404 page not found` yang tidak dapat dibaca klien.

Bentuk JSON seluruh respons diselaraskan 1:1 dengan tipe TypeScript di
`frontend/src/core/` (camelCase), sehingga pintu HTTP frontend bekerja
tanpa perubahan.

## Struktur (dikelompokkan per fitur)

```
backend/
├── cmd/api/main.go              # titik masuk: env → MySQL → repo → usecase → HTTP
├── internal/
│   ├── config/                  # pembacaan & validasi env
│   ├── domain/                  # aturan bisnis murni: user.go, pengajuan.go,
│   │                            # attendance.go, enrollment.go, konfigurasi.go,
│   │                            # undangan.go, laporan.go, galat.go
│   ├── port/                    # kontrak repositori & layanan (interface)
│   ├── usecase/                 # satu berkas per fitur: auth.go, pengguna.go,
│   │                            # profil.go, presensi.go, presensi_kirim.go,
│   │                            # enrollment.go, pengajuan.go, konfigurasi.go,
│   │                            # laporan.go, audit.go, alat.go
│   ├── repository/mysql/        # koneksi.go + skema.go, lalu *_repo.go per fitur
│   ├── security/                # token.go, sandi.go, rate.go
│   ├── facesvc/                 # klien layanan AI
│   ├── seed/                    # akun administratif pertama
│   └── delivery/httpapi/        # lapisan HTTP
│       ├── server.go            # dependensi Server + SesiAktor (token → aktor)
│       ├── router.go            # peta rute (publik / sesi / pengelola akun)
│       ├── alat.go              # penolong bersama handler
│       ├── auth_handler.go      # masuk, keluar, sesi, undangan & aktivasi
│       ├── profil_handler.go    # kontak & kata sandi milik pemilik akun
│       ├── pengguna_handler.go  # akun perangkat desa & kode undangan
│       ├── presensi_handler.go  # status, riwayat, kirim, daftar harian
│       ├── enrollment_handler.go
│       ├── pengajuan_handler.go
│       ├── konfigurasi_handler.go
│       ├── laporan_handler.go
│       ├── audit_handler.go
│       ├── middleware/          # aktor.go (konteks), sesi.go (auth & kewenangan),
│       │                        # dasar.go (pulihkan, header, CORS)
│       ├── response/            # json.go, galat.go, permintaan.go
│       └── tests/               # uji HTTP black-box (tanpa MySQL)
└── migrations/                  # skema bernomor + README seeder
```

Nama berkas selalu mengikuti **fitur** (bukan halaman), dan setiap tanggung
jawab punya paketnya sendiri: middleware, bentuk tanggapan, rute, dan uji.

## Keamanan (diterapkan)

- Kata sandi **bcrypt** (biaya via `BCRYPT_COST`); hash tidak pernah keluar
  dari backend.
- Sesi **JWT HS256** (`JWT_SECRET` wajib ≥ 32 karakter; gagal-cepat bila
  lemah), TTL via `JWT_TTL_JAM`; **logout mencabut jti** di tabel
  `sesi_dibatalkan`, diperiksa middleware per permintaan. Browser menerima sesi
  melalui cookie `HttpOnly`; produksi memakai `SameSite=None; Secure` agar
  origin frontend/API terpisah dapat bekerja, dilindungi pemeriksaan `Origin`;
  mode pengembangan memakai `SameSite=Lax`. Gunakan HTTPS dan isi
  `CORS_ORIGINS` dengan origin frontend produksi. Produksi hanya menerima
  cookie, bukan bearer token.
- **Rate limit login** per IP (`LOGIN_RATE_IP_MAX`) dan pasangan IP+email
  (`LOGIN_RATE_MAX`, `LOGIN_RATE_WINDOW_DETIK`); pesan galat masuk tidak membedakan email
  tidak dikenal, akun nonaktif, akun undangan, atau sandi salah. Alamatnya diambil dari **koneksi langsung**:
  `X-Forwarded-For` hanya dipakai bila pengirimnya terdaftar di
  `TRUSTED_PROXIES` (alamat/CIDR, dibaca dari kanan rantai). Tanpa aturan itu
  penyerang mengarang alamat baru di setiap permintaan dan melewati pembatas
  laju sepenuhnya. Kunci pembatas yang sudah usang disapu berkala
  (`RateLimiter.Bersihkan`, juga dipanggil saat peta berjalan besar) supaya
  memori tidak tumbuh terus.
- **Kolom `DATETIME` diperlakukan sebagai UTC**: DSN memakai `loc=UTC` sedangkan
  container MySQL berjalan pada WITA (+08:00), jadi penulisan & pembandingan
  waktu di SQL memakai `UTC_TIMESTAMP(3)` — bukan `NOW(3)`. Dengan `NOW(3)`, sesi
  yang dicabut dan kode undangan yang digugurkan dihapus delapan jam terlalu
  cepat (token curian masih dapat dipakai di sisa jendela itu).
- **Aktivasi akun sebagai satu transaksi** (`AktivasiRepo`): kode undangan
  dikunci lebih dahulu (`dipakai_pada IS NULL`), baru kata sandi, status akun,
  dan kontak/persetujuan diubah. Tidak ada lagi keadaan "akun sudah aktif tetapi
  kode belum terpakai" bila dua permintaan aktivasi masuk bersamaan atau koneksi
  terputus di tengah jalan.
- **Kewenangan dua lapis**: gerbang middleware (`WajibAdmin`) + pemeriksaan
  ulang di usecase (`pastikanAdmin`, `BolehTetapkanRole`,
  `BolehKelolaAkun`, `BolehKelolaJadwal`).
- `APP_ENV=production` mewajibkan layanan AI; backend menolak presensi tanpa
  frame untuk verifikasi server. Layanan AI juga gagal mulai jika provider
  InsightFace tidak tersedia atau provider demo dipilih.
- **Waktu presensi dari server** (zona WITA `Asia/Makassar`), jadwal dari
  basis data; mode demo memakai skor klien dan hanya layak untuk pengembangan.
- Kueri SQL seluruhnya parameter terikat; batas ukuran isi
  (`MAX_BODY_MB`); header keamanan + CORS dari env (`CORS_ORIGINS`);
  galat internal disamarkan (hanya dicatat di log server).
- Seluruh tindakan administratif tercatat di `audit`.

## Uji

```bash
go test ./...     # domain/tests (jadwal, geofence, undangan, kewenangan),
                  # security/tests (JWT, rate limit, sandi), delivery/httpapi/tests
                  # (alur login, aktivasi, kewenangan admin, rate limit) — tanpa MySQL
go vet ./...
```
