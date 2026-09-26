-- =====================================================================
-- Skema basis data Sistem Presensi Desa Anabanua (MySQL 8) — bagian 2.
-- Dijalankan otomatis oleh backend saat mulai (idempoten).
-- =====================================================================

CREATE TABLE IF NOT EXISTS enrollment (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  pengguna_id    VARCHAR(64) NOT NULL,
  status         ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED') NOT NULL,
  foto           JSON NOT NULL,                    -- [{dataUrl, quality, capturedAt}]
  embedding      JSON NULL,                        -- vektor wajah dari layanan AI
  dikirim_pada   DATETIME(3) NULL,
  diputus_pada   DATETIME(3) NULL,
  catatan_review VARCHAR(255) NULL,
  dibuat_pada    DATETIME(3) NOT NULL,
  diubah_pada    DATETIME(3) NOT NULL,
  INDEX idx_enrollment_pengguna (pengguna_id),
  INDEX idx_enrollment_status (status),
  CONSTRAINT fk_enrollment_pengguna FOREIGN KEY (pengguna_id) REFERENCES pengguna (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS presensi (
  id              VARCHAR(64) NOT NULL PRIMARY KEY,
  pengguna_id     VARCHAR(64) NOT NULL,
  jenis           ENUM('CHECK_IN','CHECK_OUT') NOT NULL,
  mode            ENUM('WFO','WFH','DINAS_LUAR') NOT NULL,
  status          ENUM('TEPAT_WAKTU','TERLAMBAT','PULANG_CEPAT','LEBIH_KERJA') NOT NULL,
  kantor_id       VARCHAR(32) NOT NULL,
  cocok_wajah     BOOLEAN NOT NULL,
  skor_wajah      DOUBLE NOT NULL,
  hidup           BOOLEAN NOT NULL,
  skor_liveness   DOUBLE NOT NULL,
  vonis_geofence  ENUM('INSIDE','OUTSIDE','INACCURATE') NOT NULL,
  jarak_meter     DOUBLE NOT NULL,
  akurasi_meter   DOUBLE NOT NULL,
  waktu_server    DATETIME(3) NOT NULL,
  tanggal         DATE NOT NULL,                   -- hari kalender WITA (Asia/Makassar)
  dibuat_pada     DATETIME(3) NOT NULL,
  UNIQUE KEY uq_presensi_hari (pengguna_id, tanggal, jenis),
  INDEX idx_presensi_tanggal (tanggal),
  CONSTRAINT fk_presensi_pengguna FOREIGN KEY (pengguna_id) REFERENCES pengguna (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengajuan (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  pengguna_id    VARCHAR(64) NOT NULL,
  nama_pengguna  VARCHAR(120) NOT NULL,
  jenis          ENUM('WFH','IZIN','SAKIT','CUTI','DINAS_LUAR','KOREKSI_PRESENSI') NOT NULL,
  mulai          DATE NOT NULL,
  selesai        DATE NOT NULL,
  alasan         TEXT NOT NULL,
  status         ENUM('MENUNGGU','DISETUJUI','DITOLAK','DIBATALKAN') NOT NULL DEFAULT 'MENUNGGU',
  dibuat_pada    DATETIME(3) NOT NULL,
  diputus_pada   DATETIME(3) NULL,
  diputus_oleh   VARCHAR(120) NULL,
  catatan_keputusan VARCHAR(255) NULL,
  INDEX idx_pengajuan_pengguna (pengguna_id),
  INDEX idx_pengajuan_status (status),
  CONSTRAINT fk_pengajuan_pengguna FOREIGN KEY (pengguna_id) REFERENCES pengguna (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  pada         DATETIME(3) NOT NULL,
  aktor_id     VARCHAR(64) NOT NULL,
  aktor_nama   VARCHAR(120) NOT NULL,
  aksi         VARCHAR(60) NOT NULL,
  sasaran_jenis VARCHAR(60) NOT NULL,
  sasaran_id   VARCHAR(64) NOT NULL,
  detail       VARCHAR(500) NOT NULL,
  INDEX idx_audit_pada (pada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sesi JWT yang dibatalkan lewat /auth/logout (berlaku sampai kedaluwarsa token).
CREATE TABLE IF NOT EXISTS sesi_dibatalkan (
  jti         CHAR(36) NOT NULL PRIMARY KEY,
  kedaluwarsa DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------
-- Data awal konfigurasi & kantor (nilai operasional, bukan kredensial).
-- ----------------------------------------------------------------------
INSERT IGNORE INTO konfigurasi (id, akurasi_maks_m) VALUES (1, 50);

INSERT IGNORE INTO jadwal (id, nama, jam_masuk, batas_masuk, jam_pulang, batas_pulang, hari_kerja, diubah_pada)
VALUES (1, 'Jadwal Kantor (WITA)', '07:30:00', '08:00:00', '16:00:00', '17:00:00', '1,2,3,4,5,6', UTC_TIMESTAMP(3));

-- Titik awal kantor (Kantor Desa Anabanua, Desa Anabanua — titik lapangan
-- SMPN Satap 4 Barru & SDI Banga-Banga, Kec. Barru). Setelah hidup, titik &
-- radius resmi diatur ulang dari aplikasi (/jadwal) oleh sekretaris/kepala
-- desa dan tercatat di audit — baris ini hanya nilai awal agar geofence
-- langsung jalan.
INSERT IGNORE INTO kantor (id, nama, latitude, longitude, radius_meter)
VALUES ('ofc-1', 'Kantor Desa Anabanua', -4.4680072, 119.713862, 100);
