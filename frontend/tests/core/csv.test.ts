import { describe, expect, it } from "vitest";
import { amankanSelCsv } from "@/lib/csv";

describe("amankanSelCsv", () => {
  it("menangani nilai kosong atau null/undefined", () => {
    expect(amankanSelCsv(null)).toBe('""');
    expect(amankanSelCsv(undefined)).toBe('""');
    expect(amankanSelCsv("")).toBe('""');
  });

  it("membungkus string biasa dengan tanda petik ganda", () => {
    expect(amankanSelCsv("Budi Santoso")).toBe('"Budi Santoso"');
    expect(amankanSelCsv(123)).toBe('"123"');
  });

  it("menggandakan tanda petik ganda dalam teks", () => {
    expect(amankanSelCsv('Halo "Dunia"')).toBe('"Halo ""Dunia"""');
  });

  it("mencegah formula injection dengan awalan karakter berisiko", () => {
    expect(amankanSelCsv("=cmd|'/C calc'!A0")).toBe('"\x27=cmd|\x27/C calc\x27!A0"');
    expect(amankanSelCsv("+12345")).toBe('"\x27+12345"');
    expect(amankanSelCsv("-12345")).toBe('"\x27-12345"');
    expect(amankanSelCsv("@SUM(A1:A10)")).toBe('"\x27@SUM(A1:A10)"');
    expect(amankanSelCsv("\tTAB")).toBe('"\x27\tTAB"');
  });
});
