/**
 * Sanitasi dan escaping sel CSV untuk mencegah Formula Injection (CSV Injection).
 * Bila nilai diawali dengan karakter formula spreadsheet (=, +, -, @, \t, \r),
 * beri awalan tanda petik tunggal (') agar dievaluasi sebagai teks murni di Excel/Calc.
 * Setiap tanda petik ganda (") digandakan ("") sesuai spesifikasi RFC 4180.
 */
export function amankanSelCsv(nilai: string | number | null | undefined): string {
  if (nilai === null || nilai === undefined) {
    return '""';
  }
  let s = String(nilai);
  // Hindari eksekusi formula di spreadsheet
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replaceAll('"', '""')}"`;
}
