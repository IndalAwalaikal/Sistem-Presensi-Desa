import { describe, expect, it } from "vitest";
import {
  ringkasanHasilPresensi,
  type InfoHasilPresensi,
} from "@/core/usecase/hasil-presensi";
import type {
  Attendance,
  AttendanceStatus,
  AttendanceType,
  OfficeLocation,
  VerificationMeta,
  WorkSchedule,
} from "@/core/domain/attendance";
import type { PresensiResult } from "@/core/ports/gateways";

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

const info: InfoHasilPresensi = {
  nama: "Perangkat Uji C",
  office: { name: kantor.name, radiusMeters: kantor.radiusMeters },
  lokasi: { accuracyMeters: 8 },
  jadwal,
};

/**
 * Waktu server selalu ditulis dengan offset +08:00 supaya jam yang ditampilkan
 * ("07.41") sama di mesin mana pun — formatter memakai zona WITA, bukan zona
 * mesin yang menjalankan test.
 */
const WAKTU_TERLAMBAT = "2026-09-24T07:41:00+08:00";
const WAKTU_TEPAT = "2026-09-24T07:58:00+08:00";

function verifikasi(serverTime: string, jarak = 42): VerificationMeta {
  return {
    faceMatch: true,
    faceScore: 0.92,
    liveness: true,
    livenessScore: 0.85,
    geofence: { verdict: "INSIDE", distanceMeters: jarak, accuracyMeters: 8 },
    serverTime,
  };
}

function transaksi(tambahan: Partial<Attendance> = {}): Attendance {
  const serverTime = tambahan.verification?.serverTime ?? WAKTU_TERLAMBAT;
  return {
    id: "att-1",
    userId: "usr-1",
    userName: "Perangkat Uji C",
    type: "CHECK_IN" as AttendanceType,
    mode: "WFO",
    status: "TERLAMBAT" as AttendanceStatus,
    selisihMenit: 0,
    office: { id: kantor.id, name: kantor.name },
    verification: verifikasi(serverTime),
    ...tambahan,
  };
}

function diterima(a: Attendance): PresensiResult {
  return { accepted: true, attendance: a, verification: a.verification };
}

describe("ringkasanHasilPresensi — ditolak", () => {
  const tolak = (code: PresensiResult["rejection"] extends undefined ? never : NonNullable<PresensiResult["rejection"]>["code"], message: string): PresensiResult => ({
    accepted: false,
    rejection: { code, message },
  });

  it("cap merah memakai alasan server apa adanya", () => {
    const r = ringkasanHasilPresensi(
      tolak("OUTSIDE_GEOFENCE", "Anda 148 m dari Kantor Desa Anabanua (batas 100 m)."),
      info,
      "CHECK_IN",
    );
    expect(r.diterima).toBe(false);
    expect(r.nada).toBe("bahaya");
    expect(r.cap).toBe("tidak dicatat");
    expect(r.judul).toBe("Presensi Gagal");
    expect(r.pesan).toBe("Anda 148 m dari Kantor Desa Anabanua (batas 100 m).");
    expect(r.petunjuk).toBe("Dekati area kantor desa, lalu ulangi presensi.");
  });

  it("tidak pernah menampilkan waktu server pada tolakan", () => {
    const r = ringkasanHasilPresensi(tolak("FACE_FAILED", "Wajah tidak sesuai."), info);
    expect(r.waktu).toBeNull();
  });

  it("jenis yang dicoba ikut disebut, dan tidak dipaksakan bila tak diketahui", () => {
    const dengan = ringkasanHasilPresensi(tolak("FACE_FAILED", "Wajah tidak sesuai."), info, "CHECK_OUT");
    expect(dengan.baris[0]).toEqual({ label: "Jenis", nilai: "Pulang" });
    expect(dengan.baris.find((b) => b.label === "Kode tolakan")).toEqual({
      label: "Kode tolakan",
      nilai: "FACE_FAILED",
      nada: "bahaya",
    });

    const tanpa = ringkasanHasilPresensi(tolak("FACE_FAILED", "Wajah tidak sesuai."), info);
    expect(tanpa.baris.some((b) => b.label === "Jenis")).toBe(false);
    expect(tanpa.baris[0].label).toBe("Kode tolakan");
  });

  it("tiap kode tolakan punya langkah berikutnya yang berbeda", () => {
    const kode = [
      "BIOMETRIC_INACTIVE",
      "FACE_FAILED",
      "LIVENESS_FAILED",
      "GPS_INACCURATE",
      "OUTSIDE_GEOFENCE",
      "SUDAH_PRESENSI",
      "BELUM_PRESENSI_MASUK",
      "SERVER_ERROR",
    ] as const;

    const petunjuk = kode.map((k) => ringkasanHasilPresensi(tolak(k, "alasan"), info).petunjuk);
    petunjuk.forEach((p) => expect(p.length).toBeGreaterThan(10));
    expect(new Set(petunjuk).size).toBe(kode.length);
  });

  it("jawaban server yang tidak lengkap tetap terbaca sebagai gagal", () => {
    const kosong = ringkasanHasilPresensi({ accepted: false }, info, "CHECK_IN");
    expect(kosong.judul).toBe("Presensi Gagal");
    expect(kosong.pesan).toBe("Terjadi gangguan saat memeriksa presensi Anda.");
    expect(kosong.petunjuk).toContain("laporkan ke sekretaris desa");

    // `accepted: true` tanpa transaksi tidak boleh diklaim berhasil.
    const separuh = ringkasanHasilPresensi({ accepted: true }, info);
    expect(separuh.diterima).toBe(false);
    expect(separuh.baris[0].nilai).toBe("SERVER_ERROR");
  });
});

describe("ringkasanHasilPresensi — diterima", () => {

  it("cap hijau memuat waktu server resmi dan nada primer", () => {
    const r = ringkasanHasilPresensi(
      diterima(transaksi({ status: "TEPAT_WAKTU", selisihMenit: 0, verification: verifikasi(WAKTU_TEPAT) })),
      info,
    );
    expect(r.diterima).toBe(true);
    expect(r.nada).toBe("primer");
    expect(r.cap).toBe("tercatat");
    expect(r.judul).toBe("Presensi Berhasil");
    expect(r.waktu).toBe("07.58");
  });

  it("tepat waktu menyebut ambang jadwal, bukan selisih kosong", () => {
    const r = ringkasanHasilPresensi(
      diterima(transaksi({ status: "TEPAT_WAKTU", selisihMenit: 0, verification: verifikasi(WAKTU_TEPAT) })),
      info,
    );
    expect(r.pesan).toBe("Datang tepat waktu — sebelum batas masuk 08:00.");
    expect(r.petunjuk).toBe("Presensi pulang menanti setelah pukul 16:00.");
  });

  it("durasi keterlambatan tersimpan dipakai apa adanya walau jadwal berubah", () => {
    // Skenario rekap lama: batas masuk sudah berpindah ke 13:00, sedangkan
    // transaksi tercatat 191 menit setelah batas masuk yang berlaku saat itu.
    const jadwalBaru: WorkSchedule = { ...jadwal, checkInDeadline: "13:00" };
    const r = ringkasanHasilPresensi(
      diterima(transaksi({ status: "TERLAMBAT", selisihMenit: 191 })),
      { ...info, jadwal: jadwalBaru },
    );
    expect(r.pesan).toBe("terlambat 3 jam 11 mnt dari batas masuk 13:00");
    expect(r.pesan).not.toContain("0 mnt");
    expect(r.baris.find((b) => b.label === "Status")).toEqual({
      label: "Status",
      nilai: "Terlambat",
      nada: "bahaya",
    });
  });

  it("pulang cepat bernada peringatan dan lebih kerja menyebut batas pulang", () => {
    const cepat = ringkasanHasilPresensi(
      diterima(transaksi({ type: "CHECK_OUT", status: "PULANG_CEPAT", selisihMenit: -55 })),
      info,
    );
    expect(cepat.pesan).toBe("pulang cepat 55 mnt dari jam pulang 16:00");
    expect(cepat.baris.find((b) => b.label === "Status")?.nada).toBe("peringatan");
    expect(cepat.petunjuk).toBe("Kehadiran hari ini lengkap.");

    const lebih = ringkasanHasilPresensi(
      diterima(transaksi({ type: "CHECK_OUT", status: "LEBIH_KERJA", selisihMenit: 40 })),
      info,
    );
    expect(lebih.pesan).toBe("lebih kerja 40 mnt dari batas pulang 17:00");
  });

  it("status menyimpang yang durasinya tak terhitung tidak disebut tepat waktu", () => {
    // Tepat di ambang (16:00) selisihnya nol, padahal statusnya menyimpang:
    // kalimatnya menyebut status, bukan mengklaim "tepat waktu".
    const r = ringkasanHasilPresensi(
      diterima(
        transaksi({
          type: "CHECK_OUT",
          status: "PULANG_CEPAT",
          selisihMenit: 0,
          verification: verifikasi("2026-09-24T16:00:00+08:00"),
        }),
      ),
      info,
    );
    expect(r.pesan).toBe("Pulang Cepat — durasi tidak tercatat pada transaksi ini.");
  });

  it("tanpa jadwal, cap tetap menyebut sumber waktunya", () => {
    const r = ringkasanHasilPresensi(
      diterima(transaksi({ status: "TEPAT_WAKTU", selisihMenit: 0, verification: verifikasi(WAKTU_TEPAT) })),
      { ...info, jadwal: null },
    );
    expect(r.pesan).toBe("Tercatat pada waktu server resmi.");
    expect(r.petunjuk).toBe("Kehadiran Anda tercatat hari ini.");
    expect(r.waktu).toBe("07.58");
  });

  it("rincian menyebut nama, jenis, lokasi, mode, dan skor verifikasi", () => {
    const r = ringkasanHasilPresensi(diterima(transaksi()), info);
    expect(r.baris).toEqual([
      { label: "Perangkat", nilai: "Perangkat Uji C" },
      { label: "Jenis", nilai: "Masuk" },
      { label: "Status", nilai: "Terlambat", nada: "bahaya" },
      { label: "Lokasi", nilai: "Kantor Desa Anabanua · 42 m" },
      { label: "Mode", nilai: "WFO" },
      { label: "Verifikasi", nilai: "kemiripan wajah 0.92 · skor keaslian 0.85" },
    ]);
  });
});
