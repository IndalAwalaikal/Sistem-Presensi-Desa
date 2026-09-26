CREATE TABLE IF NOT EXISTS riwayat_konfigurasi (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  pada         DATETIME(3) NOT NULL,
  aktor_id     VARCHAR(64) NOT NULL,
  aktor_nama   VARCHAR(120) NOT NULL,
  jenis        ENUM('JADWAL','KANTOR') NOT NULL,
  sebelum_json JSON NOT NULL,
  sesudah_json JSON NOT NULL,
  ringkasan    VARCHAR(500) NOT NULL,
  INDEX idx_riwayat_konfig_jenis (jenis, pada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
