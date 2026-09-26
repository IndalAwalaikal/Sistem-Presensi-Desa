# =====================================================================
# Indeks penanda batch pengajuan massal: dipakai untuk menelusuri seluruh
# baris satu batch (mis. saat pengelola akun membuka riwayat cuti bersama).
#
# CATATAN: dipisah dari 0011 agar setiap berkas migrasi berisi SATU
# pernyataan — lihat catatan pada 0011.
# =====================================================================
CREATE INDEX idx_pengajuan_batch ON pengajuan (batch_id);
