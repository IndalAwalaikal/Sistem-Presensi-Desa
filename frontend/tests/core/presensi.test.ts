import { describe, expect, it } from "vitest";
import { decidePresensi, type PresensiContext } from "@/core/usecase/presensi";
import type { OfficeLocation, WorkSchedule } from "@/core/domain/attendance";

const kantor: OfficeLocation = {
  id: "ofc-1",
  name: "Kantor Desa Anabanua",
  point: { latitude: -3.77273, longitude: 119.62739 },
  radiusMeters: 100,
};

const jadwal: WorkSchedule = {
  id: "sch-1",
  name: "Kantor",
  checkInStart: "07:30",
  checkInDeadline: "08:00",
  checkOutStart: "16:00",
  checkOutEnd: "17:00",
  workDays: [1, 2, 3, 4, 5, 6],
};

function titikDekat(meter: number) {
  const dLat = meter / 111_320;
  return { latitude: kantor.point.latitude + dLat, longitude: kantor.point.longitude };
}

const serverTime = new Date(2026, 8, 10, 7, 45, 30);

function ctx(tambahan: Partial<PresensiContext> = {}): PresensiContext {
  return {
    biometricStatus: "ACTIVE",
    office: kantor,
    schedule: jadwal,
    maxAccuracyMeters: 50,
    serverTime,
    sudahPresensi: [],
    ...tambahan,
  };
};

const perintahDasar = {
  type: "CHECK_IN" as const,
  mode: "WFO" as const,
  faceScore: 0.92,
  livenessScore: 0.85,
  location: titikDekat(37),
  accuracyMeters: 8,
};

describe("decidePresensi — diterima", () => {
  it("check-in tepat waktu lengkap dengan metadata verifikasi", () => {
    const hasil = decidePresensi(perintahDasar, ctx());
    expect(hasil.accepted).toBe(true);
    expect(hasil.attendance?.status).toBe("TEPAT_WAKTU");
    expect(hasil.verification?.geofence.distanceMeters).toBeCloseTo(37, 0);
    expect(hasil.verification?.serverTime).toBe(serverTime.toISOString());
  });

  it("check-out dalam rentang pulang bernilai tepat waktu", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, type: "CHECK_OUT" },
      ctx({
        serverTime: new Date(2026, 8, 10, 16, 10),
        sudahPresensi: ["CHECK_IN"],
      }),
    );
    expect(hasil.attendance?.status).toBe("TEPAT_WAKTU");
  });

  it("check-out sebelum jam pulang tercatat pulang cepat", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, type: "CHECK_OUT" },
      ctx({
        serverTime: new Date(2026, 8, 10, 15, 30),
        sudahPresensi: ["CHECK_IN"],
      }),
    );
    expect(hasil.attendance?.status).toBe("PULANG_CEPAT");
  });

  it("datang lebih awal tetap tepat waktu", () => {
    const hasil = decidePresensi(
      perintahDasar,
      ctx({ serverTime: new Date(2026, 8, 10, 7, 5) }),
    );
    expect(hasil.attendance?.status).toBe("TEPAT_WAKTU");
  });

  it("datang setelah batas masuk tercatat terlambat", () => {
    const hasil = decidePresensi(
      perintahDasar,
      ctx({ serverTime: new Date(2026, 8, 10, 8, 1) }),
    );
    expect(hasil.attendance?.status).toBe("TERLAMBAT");
  });
});

/**
 * Jenis presensi dipilih pengguna (datang atau pulang), jadi urutannya bukan
 * urusan antarmuka saja: aturan yang sama harus ditegakkan di sini, karena
 * pintu data dan backend memanggil fungsi ini.
 */
describe("decidePresensi — urutan datang lalu pulang", () => {
  it("menolak datang kedua kali pada hari yang sama", () => {
    const hasil = decidePresensi(perintahDasar, ctx({ sudahPresensi: ["CHECK_IN"] }));
    expect(hasil.rejection?.code).toBe("SUDAH_PRESENSI");
    expect(hasil.attendance).toBeUndefined();
  });

  it("menolak pulang kedua kali pada hari yang sama", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, type: "CHECK_OUT" },
      ctx({ sudahPresensi: ["CHECK_IN", "CHECK_OUT"] }),
    );
    expect(hasil.rejection?.code).toBe("SUDAH_PRESENSI");
  });

  it("menolak pulang sebelum ada catatan datang", () => {
    const hasil = decidePresensi({ ...perintahDasar, type: "CHECK_OUT" }, ctx());
    expect(hasil.rejection?.code).toBe("BELUM_PRESENSI_MASUK");
  });

  it("urutan diperiksa sebelum verifikasi kamera, jadi biometrik tidak dievaluasi", () => {
    // Penolakan urutan datang lebih awal agar pengguna tidak membuang waktu
    // menyalakan kamera untuk presensi yang memang tidak mungkin dicatat.
    const hasil = decidePresensi(
      { ...perintahDasar, faceScore: 0.1 },
      ctx({ sudahPresensi: ["CHECK_IN"] }),
    );
    expect(hasil.rejection?.code).toBe("SUDAH_PRESENSI");
  });
});

describe("decidePresensi — ditolak", () => {
  it("biometrik belum aktif", () => {
    const hasil = decidePresensi(perintahDasar, ctx({ biometricStatus: "PENDING_VERIFICATION" }));
    expect(hasil.rejection?.code).toBe("BIOMETRIC_INACTIVE");
  });

  it("skor wajah di bawah ambang", () => {
    const hasil = decidePresensi({ ...perintahDasar, faceScore: 0.5 }, ctx());
    expect(hasil.rejection?.code).toBe("FACE_FAILED");
  });

  it("skor liveness di bawah ambang", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, livenessScore: 0.2 },
      ctx(),
    );
    expect(hasil.rejection?.code).toBe("LIVENESS_FAILED");
  });

  it("akurasi GPS di atas batas", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, accuracyMeters: 80 },
      ctx(),
    );
    expect(hasil.rejection?.code).toBe("GPS_INACCURATE");
  });

  it("di luar geofence", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, location: titikDekat(1_200) },
      ctx(),
    );
    expect(hasil.rejection?.code).toBe("OUTSIDE_GEOFENCE");
  });

  it("penolakan tidak menyertakan transaksi", () => {
    const hasil = decidePresensi({ ...perintahDasar, faceScore: 0.1 }, ctx());
    expect(hasil.attendance).toBeUndefined();
    expect(hasil.verification).toBeUndefined();
  });
});

/**
 * WFH dan dinas luar tetap wajib presensi, jadi modenya membebaskan radius
 * kantor — tetapi hanya bila pengajuannya benar-benar disetujui. Tanpa aturan
 * kedua, siapa pun dapat lolos geofence hanya dengan mengirim mode WFH.
 */
describe("decidePresensi — mode WFH/dinas luar", () => {
  const jauh = titikDekat(12_000);

  it("menolak mode WFH tanpa pengajuan yang disetujui", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, mode: "WFH", location: jauh },
      ctx(),
    );
    expect(hasil.rejection?.code).toBe("MODE_TIDAK_DISETUJUI");
  });

  it("menerima mode WFH di luar radius bila pengajuannya disetujui", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, mode: "WFH", location: jauh, accuracyMeters: 80 },
      ctx({ modeDisetujui: ["WFH"] }),
    );
    expect(hasil.accepted).toBe(true);
    expect(hasil.attendance?.mode).toBe("WFH");
    // Vonis menjawab "apakah syarat lokasi terpenuhi"; jaraknya tetap tercatat.
    expect(hasil.verification?.geofence.verdict).toBe("INSIDE");
    expect(hasil.verification?.geofence.distanceMeters).toBeCloseTo(12_000, -3);
  });

  it("mode dinas luar tidak dibebaskan oleh pengajuan WFH", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, mode: "DINAS_LUAR", location: jauh },
      ctx({ modeDisetujui: ["WFH"] }),
    );
    expect(hasil.rejection?.code).toBe("MODE_TIDAK_DISETUJUI");
  });

  it("mode WFO tetap terkena geofence walau ada pengajuan WFH", () => {
    const hasil = decidePresensi(
      { ...perintahDasar, mode: "WFO", location: jauh },
      ctx({ modeDisetujui: ["WFH"] }),
    );
    expect(hasil.rejection?.code).toBe("OUTSIDE_GEOFENCE");
  });
});
