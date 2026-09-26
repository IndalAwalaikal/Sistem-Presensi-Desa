# =====================================================================
# Seeder: akun administratif pertama. Dijalankan sekali setelah skema
# dibuat; kata sandi dari env (JANGAN ditulis di sini maupun di repositori).
# Peran akun administratif ditetapkan langsung di basis data (bukan dari
# aplikasi) — selaras dengan aturan frontend.
# =====================================================================

-- Contoh (isi sesuai kebutuhan; hash dibuat terpisah dengan bcrypt):
--
-- Catatan zona waktu: seluruh kolom DATETIME di aplikasi ini menyimpan WAKTU UTC
-- (DSN backend memakai `loc=UTC`), sedangkan container MySQL berjalan pada
-- +08:00 (WITA). Karena itu pakai UTC_TIMESTAMP(3) — bukan NOW(3) — supaya baris
-- yang disisipkan manual tidak berbeda delapan jam dari baris yang ditulis
-- backend.

-- 1) Buat hash:  backend/seeder/hash <kata-sandi>
-- 2) Sisipkan dengan SQL di bawah, ganti <HASH> dan email sesuai kebutuhan.

-- INSERT INTO pengguna
--   (id, nama_lengkap, email, hash_sandi, peran, status_akun, status_biometrik,
--    nip, jabatan, unit, telepon, alamat, dibuat_pada, diubah_pada)
-- VALUES
--   ('usr-sekretaris-01', 'Nama Sekretaris', 'sekretaris@anabanua.id', '<HASH>',
--    'SEKRETARIS_DESA', 'AKTIF', 'NOT_ENROLLED',
--    '<NIP>', 'Sekretaris Desa', 'Sekretariat Desa', '<telepon>', 'Desa Anabanua',
--    UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
--   ('usr-kepala-01', 'Nama Kepala Desa', 'kepala@anabanua.id', '<HASH>',
--    'KEPALA_DESA', 'AKTIF', 'NOT_ENROLLED',
--    '<NIP>', 'Kepala Desa', 'Pemerintah Desa', '<telepon>', 'Desa Anabanua',
--    UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));
