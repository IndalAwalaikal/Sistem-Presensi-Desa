# =====================================================================
# Pengajuan massal (mis. cuti bersama): satu kiriman pengelola akun untuk
# banyak perangkat sekaligus. Setiap perangkat tetap punya barisnya sendiri
# — rekap & hari yang "sudah dijelaskan" tidak berubah — tetapi baris-baris
# itu diberi penanda batch yang sama supaya dapat ditelusuri dan diputuskan
# sebagai satu kesatuan.
#
# CATATAN: satu pernyataan per berkas migrasi - pelaksana migrasi Go
# (database/sql) tidak memahami DELIMITER/PROCEDURE/CALL multi-baris, dan
# dua pernyataan DDL dalam satu berkas membuat yang pertama sudah ter-commit
# ketika yang kedua gagal. Indeksnya dipasang di berkas terpisah (0012).
# =====================================================================
ALTER TABLE pengajuan ADD COLUMN batch_id VARCHAR(64) NULL AFTER catatan_keputusan;
