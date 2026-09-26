-- =====================================================================
-- Skema basis data Sistem Presensi Desa Anabanua (MySQL 8) — bagian 3:
-- kalender hari libur.
--
-- Hari libur nasional & cuti bersama mengikuti SKB tiga menteri; libur lokal
-- ditetapkan desa. Tanggal pada tabel ini meniadakan kewajiban presensi,
-- sehingga hari libur tidak pernah dihitung sebagai "tanpa keterangan".
-- =====================================================================

CREATE TABLE IF NOT EXISTS hari_libur (
  tanggal     DATE NOT NULL PRIMARY KEY,
  nama        VARCHAR(160) NOT NULL,
  jenis       ENUM('LIBUR_NASIONAL','CUTI_BERSAMA','LIBUR_LOKAL') NOT NULL,
  sumber      ENUM('SKB','IMPOR','MANUAL') NOT NULL DEFAULT 'MANUAL',
  dibuat_pada DATETIME(3) NOT NULL,
  diubah_pada DATETIME(3) NOT NULL,
  INDEX idx_hari_libur_jenis (jenis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
