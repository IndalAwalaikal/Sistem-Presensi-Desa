import { describe, expect, it } from "vitest";
import { evaluateGeofence } from "@/core/domain/attendance";
import {
  RADIUS_MAKS_METER,
  RADIUS_MIN_METER,
  rapikanKantor,
  validasiKantor,
} from "@/core/usecase/kantor";

const dasar = {
  name: "Kantor Desa Anabanua",
  latitude: -4.4680072,
  longitude: 119.713862,
  radiusMeters: 100,
};

describe("validasiKantor", () => {
  it("menerima titik & radius yang wajar", () => {
    expect(validasiKantor(dasar)).toEqual({ sah: true, galat: [] });
  });

  it("menerima batas ekstrem yang masih sah", () => {
    const selatan = { ...dasar, latitude: -90, longitude: -180, radiusMeters: RADIUS_MIN_METER };
    const utara = { ...dasar, latitude: 90, longitude: 180, radiusMeters: RADIUS_MAKS_METER };
    expect(validasiKantor(selatan).sah).toBe(true);
    expect(validasiKantor(utara).sah).toBe(true);
  });

  it("menolak nama kantor yang kosong atau hanya spasi", () => {
    expect(validasiKantor({ ...dasar, name: "   " }).galat.join(" ")).toMatch(
      /Nama kantor wajib diisi/,
    );
  });

  it("menolak lintang di luar -90 sampai 90", () => {
    expect(validasiKantor({ ...dasar, latitude: 91 }).galat.join(" ")).toMatch(/lintang/i);
    expect(validasiKantor({ ...dasar, latitude: -90.5 }).galat.join(" ")).toMatch(/lintang/i);
  });

  it("menolak bujur di luar -180 sampai 180", () => {
    expect(validasiKantor({ ...dasar, longitude: 181 }).galat.join(" ")).toMatch(/bujur/i);
    expect(validasiKantor({ ...dasar, longitude: -200 }).galat.join(" ")).toMatch(/bujur/i);
  });

  it("menolak koordinat kosong — bukan membacanya sebagai 0", () => {
    // Isian kosong di layar menjadi NaN; bila lolos, titik kantor tanpa sengaja
    // pindah ke (0, 0) di Samudra Atlantik dan seluruh presensi jadi di luar area.
    expect(validasiKantor({ ...dasar, latitude: Number.NaN }).sah).toBe(false);
    expect(validasiKantor({ ...dasar, longitude: Number.NaN }).sah).toBe(false);
  });

  it("menolak radius di luar 20 sampai 1000 meter", () => {
    expect(validasiKantor({ ...dasar, radiusMeters: 10 }).galat.join(" ")).toMatch(
      /Radius geofence/,
    );
    expect(validasiKantor({ ...dasar, radiusMeters: 1001 }).galat.join(" ")).toMatch(
      /Radius geofence/,
    );
  });

  it("menolak radius pecahan karena radius tersimpan dalam meter bulat", () => {
    expect(validasiKantor({ ...dasar, radiusMeters: 120.5 }).sah).toBe(false);
  });

  it("mengumpulkan seluruh galat, bukan hanya yang pertama", () => {
    const hasil = validasiKantor({ ...dasar, name: "", latitude: 95, radiusMeters: 5 });
    expect(hasil.galat.length).toBeGreaterThan(2);
  });
});

describe("rapikanKantor", () => {
  it("memangkas spasi nama dan membulatkan radius", () => {
    const hasil = rapikanKantor({ ...dasar, name: "  Balai Desa  ", radiusMeters: 149.6 });
    expect(hasil).toEqual({
      name: "Balai Desa",
      latitude: dasar.latitude,
      longitude: dasar.longitude,
      radiusMeters: 150,
    });
  });
});

describe("titik yang diambil dari perangkat membuat presensi lolos", () => {
  it("perangkat di titik kantor dianggap di dalam area", () => {
    // Inilah alur kerja pengelola akun: buka /jadwal di komputer meja kerja,
    // tekan "Pakai lokasi perangkat ini", lalu simpan — presensi dari perangkat
    // itu pasti INSIDE karena titik kantor sama dengan posisi perangkat.
    const command = rapikanKantor({
      ...dasar,
      latitude: -4.4680123,
      longitude: 119.7138701,
    });
    const kantor = {
      id: "ofc-1",
      name: command.name,
      point: { latitude: command.latitude, longitude: command.longitude },
      radiusMeters: command.radiusMeters,
    };

    const hasil = evaluateGeofence(
      { latitude: -4.46801, longitude: 119.713865 },
      25,
      kantor,
      50,
    );
    expect(hasil.verdict).toBe("INSIDE");
    expect(hasil.distanceMeters).toBeLessThan(1);
  });

  it("perangkat dengan akurasi melebihi batas tetap ditolak walau titiknya sama", () => {
    // Titik yang dipaku tidak menghapus penjagaan akurasi: sinyal yang terlalu
    // kabur tetap tidak dapat dipakai sebagai bukti kehadiran.
    const kantor = {
      id: "ofc-1",
      name: dasar.name,
      point: { latitude: dasar.latitude, longitude: dasar.longitude },
      radiusMeters: dasar.radiusMeters,
    };
    const hasil = evaluateGeofence(
      { latitude: dasar.latitude, longitude: dasar.longitude },
      2500,
      kantor,
      50,
    );
    expect(hasil.verdict).toBe("INACCURATE");
  });
});
