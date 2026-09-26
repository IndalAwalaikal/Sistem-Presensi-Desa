import { describe, expect, it } from "vitest";
import {
  distanceMeters,
  evaluateGeofence,
  type OfficeLocation,
} from "@/core/domain/attendance";

const kantor: OfficeLocation = {
  id: "ofc-1",
  name: "Kantor Desa Anabanua",
  point: { latitude: -3.77273, longitude: 119.62739 },
  radiusMeters: 100,
};

/** Titik ±jarak tertentu ke timur dari kantor (untuk test deterministik). */
function titikTimur(meter: number) {
  const dLng = meter / (111_320 * Math.cos((kantor.point.latitude * Math.PI) / 180));
  return { latitude: kantor.point.latitude, longitude: kantor.point.longitude + dLng };
}

describe("distanceMeters", () => {
  it("nol untuk titik yang sama", () => {
    expect(distanceMeters(kantor.point, kantor.point)).toBe(0);
  });

  it("satu derajat lintang ≈ 111,32 km", () => {
    const jarak = distanceMeters(
      kantor.point,
      { latitude: kantor.point.latitude + 1, longitude: kantor.point.longitude },
    );
    expect(jarak).toBeGreaterThan(111_000);
    expect(jarak).toBeLessThan(111_600);
  });
});

describe("evaluateGeofence", () => {
  it("di dalam radius", () => {
    const hasil = evaluateGeofence(titikTimur(37), 8, kantor, 50);
    expect(hasil.verdict).toBe("INSIDE");
    expect(Math.round(hasil.distanceMeters)).toBe(37);
  });

  it("tepat di garis radius dianggap di dalam", () => {
    const hasil = evaluateGeofence(titikTimur(100), 8, kantor, 50);
    expect(hasil.verdict).toBe("INSIDE");
  });

  it("di luar radius", () => {
    expect(evaluateGeofence(titikTimur(101), 8, kantor, 50).verdict).toBe("OUTSIDE");
  });

  it("akurasi GPS di atas batas ditolak meski dekat", () => {
    const hasil = evaluateGeofence(titikTimur(37), 80, kantor, 50);
    expect(hasil.verdict).toBe("INACCURATE");
  });
});
