-- =====================================================================
-- Backfill selisih menit presensi satu kali (jadwal aktif kini).
--
-- Baris lama (sebelum kolom selisih_menit ada) menyimpan 0. Tanpa backfill,
-- rekap bulan berjalan tetap menghitung ulang dari jadwal aktif - benar
-- untuk data baru, tetapi baris lama yang statusnya dinilai thd jadwal lama
-- bisa tampil "terlambat 1 kali = 0 menit". Backfill ini menilai ulang
-- seluruh baris thd jadwal aktif (id=1) supaya angka konsisten; presensi
-- berikutnya menyimpan selisihnya sendiri dan tak lagi bergantung jadwal.
-- Idempoten: dijalankan sekali via schema_migrations; pengulangan aman
-- (UPDATE deterministik thd jadwal aktif).
-- =====================================================================
-- waktu_server tersimpan UTC; TIMESTAMP(string WITA) ditafsir dalam zona sesi
-- (+08:00, WITA) sehingga selisih terhadap waktu_server perlu koreksi +480 mnt.
UPDATE presensi p
JOIN jadwal j ON j.id = 1
SET p.selisih_menit = CASE
  WHEN p.jenis = 'CHECK_IN' AND p.status = 'TERLAMBAT'
    THEN GREATEST(0, TIMESTAMPDIFF(MINUTE,
      TIMESTAMP(CONCAT(p.tanggal, ' ', TIME_FORMAT(j.batas_masuk, '%H:%i:00'))),
      CONVERT_TZ(p.waktu_server, '+00:00', '+08:00')))
  WHEN p.jenis = 'CHECK_OUT' AND p.status = 'PULANG_CEPAT'
    THEN LEAST(0, TIMESTAMPDIFF(MINUTE,
      TIMESTAMP(CONCAT(p.tanggal, ' ', TIME_FORMAT(j.jam_pulang, '%H:%i:00'))),
      CONVERT_TZ(p.waktu_server, '+00:00', '+08:00')))
  WHEN p.jenis = 'CHECK_OUT' AND p.status = 'LEBIH_KERJA'
    THEN GREATEST(0, TIMESTAMPDIFF(MINUTE,
      TIMESTAMP(CONCAT(p.tanggal, ' ', TIME_FORMAT(j.batas_pulang, '%H:%i:00'))),
      CONVERT_TZ(p.waktu_server, '+00:00', '+08:00')))
  ELSE 0
END;
