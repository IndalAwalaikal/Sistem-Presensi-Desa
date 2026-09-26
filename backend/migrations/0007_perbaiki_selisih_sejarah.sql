-- =====================================================================
-- Skema basis data Sistem Presensi Desa Anabanua (MySQL 8) — bagian 6:
-- perbaikan selisih menit baris lama memakai jadwal yang berlaku saat itu.
--
-- 0006 menilai ulang baris lama terhadap jadwal AKTIF (id=1) saat migrasi
-- dijalankan. Untuk jadwal yang tidak pernah berubah itu benar, tetapi bila
-- jam kerja pernah diubah di tengah bulan, baris yang statusnya dinilai
-- terhadap jadwal lama bisa jatuh di luar ambang jadwal baru sehingga
-- selisihnya terpotong 0 (GREATEST(0, …)). Akibatnya rekap tetap berbunyi
-- "terlambat 19 kali, total 0 menit" — persis keresahan yang mau ditutup.
--
-- Sumber kebenaran jam kerja yang berlaku pada suatu saat adalah jejak audit
-- MENGUBAH_JADWAL: setiap barisnya mencatat jadwal lama → jadwal baru pada
-- `pada` (UTC, sama seperti presensi.waktu_server). Untuk tiap baris presensi
-- dipilih baris audit TERAKHIR yang `pada`-nya tidak melewati waktu transaksi,
-- lalu ambang jadwal itulah yang dipakai menilai selisihnya.
--
--   * waktu literal 1–4 pada detail = jadwal lama (masuk, batas masuk,
--     pulang, batas pulang), 5–8 = jadwal baru — jadi batas masuk era itu
--     adalah waktu literal ke-6, jam pulang ke-7, batas pulang ke-8.
--   * REGEXP_SUBSTR dipakai agar pemisah teksnya tidak perlu ditafsirkan.
--   * Baris yang lebih tua dari jejak audit pertama (atau basis data baru
--     tanpa baris presensi) memakai jadwal aktif sebagai cadangan — sama
--     seperti 0006.
--   * Hanya baris yang masih 0 dan berstatus bukan TEPAT_WAKTU yang disentuh:
--     nilai yang sudah tersimpan sejak presensi berlangsung tidak pernah
--     ditimpa, sehingga pengulangan berkas ini aman (idempoten).
--
-- CATATAN: satu pernyataan per berkas migrasi - pelaksana migrasi Go
-- (database/sql) tidak memahami DELIMITER/PROCEDURE/CALL multi-baris.
-- =====================================================================
UPDATE presensi p
JOIN jadwal j ON j.id = 1
SET p.selisih_menit = CASE
  WHEN p.jenis = 'CHECK_IN' AND p.status = 'TERLAMBAT'
    THEN GREATEST(0, TIMESTAMPDIFF(MINUTE,
      TIMESTAMP(CONCAT(p.tanggal, ' ', COALESCE(
        (SELECT REGEXP_SUBSTR(a.detail, '[0-9]{2}:[0-9]{2}', 1, 6)
           FROM audit a
          WHERE a.aksi = 'MENGUBAH_JADWAL' AND a.pada <= p.waktu_server
          ORDER BY a.pada DESC LIMIT 1),
        TIME_FORMAT(j.batas_masuk, '%H:%i')), ':00')),
      CONVERT_TZ(p.waktu_server, '+00:00', '+08:00')))
  WHEN p.jenis = 'CHECK_OUT' AND p.status = 'PULANG_CEPAT'
    THEN LEAST(0, TIMESTAMPDIFF(MINUTE,
      TIMESTAMP(CONCAT(p.tanggal, ' ', COALESCE(
        (SELECT REGEXP_SUBSTR(a.detail, '[0-9]{2}:[0-9]{2}', 1, 7)
           FROM audit a
          WHERE a.aksi = 'MENGUBAH_JADWAL' AND a.pada <= p.waktu_server
          ORDER BY a.pada DESC LIMIT 1),
        TIME_FORMAT(j.jam_pulang, '%H:%i')), ':00')),
      CONVERT_TZ(p.waktu_server, '+00:00', '+08:00')))
  WHEN p.jenis = 'CHECK_OUT' AND p.status = 'LEBIH_KERJA'
    THEN GREATEST(0, TIMESTAMPDIFF(MINUTE,
      TIMESTAMP(CONCAT(p.tanggal, ' ', COALESCE(
        (SELECT REGEXP_SUBSTR(a.detail, '[0-9]{2}:[0-9]{2}', 1, 8)
           FROM audit a
          WHERE a.aksi = 'MENGUBAH_JADWAL' AND a.pada <= p.waktu_server
          ORDER BY a.pada DESC LIMIT 1),
        TIME_FORMAT(j.batas_pulang, '%H:%i')), ':00')),
      CONVERT_TZ(p.waktu_server, '+00:00', '+08:00')))
  ELSE p.selisih_menit
END
WHERE p.selisih_menit = 0 AND p.status <> 'TEPAT_WAKTU';
