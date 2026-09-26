-- =====================================================================
-- Skema basis data Sistem Presensi Desa Anabanua (MySQL 8).
-- Dijalankan otomatis oleh backend saat mulai (idempoten); penggunaan
-- alat migrasi (golang-migrate) tetap disarankan di produksi.
--
-- CATATAN ID: domain.IDBaru menghasilkan "prefiks-" + 32 heksa (36/37
-- karakter). Kolom id di sini VARCHAR(64) supaya tidak pernah terpotong.
-- =====================================================================

CREATE TABLE IF NOT EXISTS pengguna (
  id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama_lengkap       VARCHAR(120) NOT NULL,
  email              VARCHAR(180) NOT NULL UNIQUE,
  hash_sandi         VARCHAR(255) NULL,           -- NULL = akun belum diaktivasi
  peran              ENUM('PERANGKAT_DESA','SEKRETARIS_DESA','KEPALA_DESA') NOT NULL,
  status_akun        ENUM('UNDANGAN','AKTIF','NONAKTIF') NOT NULL DEFAULT 'UNDANGAN',
  status_biometrik   ENUM('NOT_ENROLLED','PENDING_VERIFICATION','ACTIVE','REJECTED','EXPIRED')
                     NOT NULL DEFAULT 'NOT_ENROLLED',
  persetujuan_wajah_pada DATETIME(3) NULL,        -- persetujuan pemrosesan data wajah
  nip                VARCHAR(60)  NOT NULL UNIQUE, -- NIP/NIK administrasi
  jabatan            VARCHAR(120) NOT NULL,
  unit               VARCHAR(120) NOT NULL,
  telepon            VARCHAR(40)  NOT NULL DEFAULT '',
  alamat             VARCHAR(255) NOT NULL DEFAULT '',
  foto_url           TEXT         NULL,
  dibuat_pada        DATETIME(3)  NOT NULL,
  diubah_pada        DATETIME(3)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS undangan (
  kode             VARCHAR(40)  NOT NULL PRIMARY KEY,
  pengguna_id      VARCHAR(64)  NOT NULL,
  nama             VARCHAR(120) NOT NULL,
  email            VARCHAR(180) NOT NULL,
  diterbitkan_pada DATETIME(3)  NOT NULL,
  kedaluwarsa_pada DATETIME(3)  NOT NULL,
  dipakai_pada     DATETIME(3)  NULL,
  INDEX idx_undangan_pengguna (pengguna_id),
  CONSTRAINT fk_undangan_pengguna FOREIGN KEY (pengguna_id) REFERENCES pengguna (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Satu baris aktif (id tetap 1); diubah dari aplikasi lewat /admin/jadwal.
CREATE TABLE IF NOT EXISTS jadwal (
  id              TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  nama            VARCHAR(120) NOT NULL,
  jam_masuk       TIME NOT NULL,
  batas_masuk     TIME NOT NULL,
  jam_pulang      TIME NOT NULL,
  batas_pulang    TIME NOT NULL,
  hari_kerja      VARCHAR(20) NOT NULL,            -- CSV 0=Minggu..6=Sabtu, mis. "1,2,3,4,5,6"
  diubah_pada     DATETIME(3) NOT NULL,
  CONSTRAINT chk_jadwal_satu_baris CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kantor (
  id           VARCHAR(32) NOT NULL PRIMARY KEY,
  nama         VARCHAR(120) NOT NULL,
  latitude     DECIMAL(10,7) NOT NULL,
  longitude    DECIMAL(10,7) NOT NULL,
  radius_meter INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS konfigurasi (
  id                TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  akurasi_maks_m    INT NOT NULL,
  CONSTRAINT chk_konfigurasi_satu_baris CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
