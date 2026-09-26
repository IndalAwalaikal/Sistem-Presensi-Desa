/**
 * Sumber waktu resmi untuk keputusan presensi.
 *
 * Mode demo: memakai jam perangkat. Pada produksi, nilai ini wajib berasal
 * dari backend (mis. GET /waktu atau field serverTime pada respons API) —
 * jam perangkat tidak boleh dipercaya untuk menentukan status hadir.
 */
export function waktuServer(): Date {
  return new Date();
}
