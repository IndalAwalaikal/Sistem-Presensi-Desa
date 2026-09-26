# =====================================================================
# Skema basis data Sistem Presensi Desa Anabanua (MySQL 8) — bagian 4:
# jadwal khusus (Ramadan/shift), riwayat konfigurasi, presensi kios,
# pengajuan massal, antrean offline, langganan pengingat, webhook disiplin.
#
# Dijalankan otomatis oleh backend saat mulai (idempoten, satu pernyataan
# per berkas — pelaksana migrasi Go tidak memahami DELIMITER multi-baris).
# =====================================================================

CREATE TABLE IF NOT EXISTS jadwal_khusus (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  nama         VARCHAR(120) NOT NULL,
  mulai        DATE NOT NULL,
  selesai      DATE NOT NULL,
  jam_masuk    TIME NOT NULL,
  batas_masuk  TIME NOT NULL,
  jam_pulang   TIME NOT NULL,
  batas_pulang TIME NOT NULL,
  hari_kerja   VARCHAR(20) NOT NULL,
  dibuat_oleh  VARCHAR(120) NOT NULL,
  dibuat_pada  DATETIME(3) NOT NULL,
  INDEX idx_jadwal_khusus_rentang (mulai, selesai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
