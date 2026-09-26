-- =====================================================================
-- Skema basis data Sistem Presensi Desa Anabanua (MySQL 8) — bagian 3.
-- Dijalankan otomatis oleh backend saat mulai (idempoten per berkas).
--
-- Indeks kinerja untuk tabel `enrollment`:
--   * Kolom `foto` menyimpan JSON berisi 3–5 data URL foto (ratusan KB
--     sampai beberapa MB per baris). Setiap kueri yang memilih kolom itu
--     DAN mengurutkan barisnya memaksa MySQL menyortir di memori
--     (filesort). Begitu antrean verifikasi menumpuk, server menolak
--     dengan "Error 1038 (HY001): Out of sort memory" — halaman antrean
--     verifikasi dan status pendaftaran wajah pengguna ikut gagal (500).
--   * Indeks gabungan berikut membuat urutan dibaca langsung dari indeks
--     (tanpa filesort) dan sekaligus mempercepat penyaringan status.
-- =====================================================================

ALTER TABLE enrollment
  ADD INDEX idx_enrollment_antrean (status, dikirim_pada),
  ADD INDEX idx_enrollment_terbaru (pengguna_id, dibuat_pada);
