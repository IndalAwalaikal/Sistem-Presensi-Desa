import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  APPROVER_ROLES,
  akunDapatMasuk,
  bolehKelolaAkun,
  bolehTetapkanRole,
  isAdminRole,
  isApproverRole,
  peranYangBolehDibuat,
  ROLE_LABEL,
  ROLES,
} from "@/core/domain/user";
import {
  normalkanKode,
  pesanKodeTidakSah,
  samarkanEmail,
  sisaHariUndangan,
  undanganSah,
  type Undangan,
} from "@/core/domain/undangan";
import {
  PANJANG_SANDI_MIN,
  validasiAkunBaru,
  validasiAktivasiAkun,
  validasiKataSandi,
} from "@/core/usecase/akun";

const KINI = new Date("2026-09-01T00:00:00.000Z");
const SEHARI = 86_400_000;

function undangan(tambahan: Partial<Undangan> = {}): Undangan {
  return {
    kode: "ANB-7K3M-QP2X",
    userId: "u-nurul",
    nama: "Nurul Hidayah",
    email: "nurul@anabanua.id",
    dibuatPada: KINI.toISOString(),
    kedaluwarsaPada: new Date(KINI.getTime() + 7 * SEHARI).toISOString(),
    ...tambahan,
  };
}

describe("normalkanKode", () => {
  it("menyamakan huruf besar dan membuang spasi", () => {
    expect(normalkanKode(" anb-7k3m-qp2x ")).toBe("ANB-7K3M-QP2X");
  });
});

describe("undanganSah", () => {
  it("sah selama belum dipakai dan belum kedaluwarsa", () => {
    expect(undanganSah(undangan(), KINI)).toBe(true);
  });

  it("tidak sah bila sudah dipakai", () => {
    expect(undanganSah(undangan({ dipakaiPada: KINI.toISOString() }), KINI)).toBe(false);
  });

  it("tidak sah bila sudah kedaluwarsa", () => {
    expect(undanganSah(undangan(), new Date(KINI.getTime() + 8 * SEHARI))).toBe(false);
  });

  it("tidak sah bila tidak ada", () => {
    expect(undanganSah(null, KINI)).toBe(false);
  });
});

describe("pesanKodeTidakSah", () => {
  it("menjelaskan kode yang tidak dikenal", () => {
    expect(pesanKodeTidakSah(null, KINI)).toContain("tidak dikenal");
  });

  it("menjelaskan kode yang sudah dipakai", () => {
    expect(
      pesanKodeTidakSah(undangan({ dipakaiPada: KINI.toISOString() }), KINI),
    ).toContain("sudah pernah dipakai");
  });

  it("menjelaskan kode yang kedaluwarsa", () => {
    expect(pesanKodeTidakSah(undangan(), new Date(KINI.getTime() + 8 * SEHARI))).toContain(
      "kedaluwarsa",
    );
  });
});

describe("sisaHariUndangan", () => {
  it("dibulatkan ke atas", () => {
    expect(sisaHariUndangan(undangan(), new Date(KINI.getTime() + SEHARI / 4))).toBe(7);
  });

  it("nol setelah lewat", () => {
    expect(sisaHariUndangan(undangan(), new Date(KINI.getTime() + 9 * SEHARI))).toBe(0);
  });
});

describe("samarkanEmail", () => {
  it("menyisakan huruf pertama & terakhir bagian lokal", () => {
    expect(samarkanEmail("nurul@anabanua.id")).toBe("n***l@anabanua.id");
  });

  it("tetap aman untuk bagian lokal yang sangat pendek", () => {
    expect(samarkanEmail("ab@anabanua.id")).toBe("a***@anabanua.id");
  });
});
describe("kewenangan peran", () => {
  it("lapisan domain hanya mengenal tiga peran berlabel lengkap", () => {
    expect(ROLES).toEqual(["PERANGKAT_DESA", "SEKRETARIS_DESA", "KEPALA_DESA"]);
    expect(Object.keys(ROLE_LABEL).sort()).toEqual([...ROLES].sort());
    expect(ROLE_LABEL.SEKRETARIS_DESA).toBe("Sekretaris Desa");
  });

  it("hanya sekretaris desa dan kepala desa yang berperan administratif", () => {
    expect(ADMIN_ROLES).toEqual(["SEKRETARIS_DESA", "KEPALA_DESA"]);
    expect(APPROVER_ROLES).toEqual(ADMIN_ROLES);
    expect(ROLES.filter(isAdminRole)).toEqual(["SEKRETARIS_DESA", "KEPALA_DESA"]);
    expect(isApproverRole("PERANGKAT_DESA")).toBe(false);
  });

  it("sekretaris desa dan kepala desa kedudukannya setara", () => {
    expect(isAdminRole("SEKRETARIS_DESA")).toBe(isAdminRole("KEPALA_DESA"));
    expect(isApproverRole("SEKRETARIS_DESA")).toBe(isApproverRole("KEPALA_DESA"));
    // Kewenangan kedua peran identik untuk setiap peran sasaran.
    for (const peran of ROLES) {
      expect(peranYangBolehDibuat("SEKRETARIS_DESA")).toEqual(
        peranYangBolehDibuat("KEPALA_DESA"),
      );
      expect(bolehKelolaAkun("SEKRETARIS_DESA", peran)).toBe(
        bolehKelolaAkun("KEPALA_DESA", peran),
      );
      expect(bolehTetapkanRole("SEKRETARIS_DESA", peran)).toBe(
        bolehTetapkanRole("KEPALA_DESA", peran),
      );
    }
  });

  it("dari aplikasi hanya akun perangkat desa yang boleh dibuat", () => {
    expect(peranYangBolehDibuat("SEKRETARIS_DESA")).toEqual(["PERANGKAT_DESA"]);
    expect(peranYangBolehDibuat("KEPALA_DESA")).toEqual(["PERANGKAT_DESA"]);
    // Perangkat desa tidak membuat akun siapa pun.
    expect(peranYangBolehDibuat("PERANGKAT_DESA")).toEqual([]);
  });

  it("tidak ada cara menaikkan hak akses lewat pembuatan akun", () => {
    expect(bolehTetapkanRole("SEKRETARIS_DESA", "PERANGKAT_DESA")).toBe(true);
    expect(bolehTetapkanRole("KEPALA_DESA", "PERANGKAT_DESA")).toBe(true);
    expect(bolehTetapkanRole("SEKRETARIS_DESA", "SEKRETARIS_DESA")).toBe(false);
    expect(bolehTetapkanRole("SEKRETARIS_DESA", "KEPALA_DESA")).toBe(false);
    expect(bolehTetapkanRole("KEPALA_DESA", "SEKRETARIS_DESA")).toBe(false);
    expect(bolehTetapkanRole("KEPALA_DESA", "KEPALA_DESA")).toBe(false);
    expect(bolehTetapkanRole("PERANGKAT_DESA", "PERANGKAT_DESA")).toBe(false);
  });

  it("hanya akun perangkat desa yang dapat dikelola dari aplikasi", () => {
    expect(bolehKelolaAkun("SEKRETARIS_DESA", "PERANGKAT_DESA")).toBe(true);
    expect(bolehKelolaAkun("KEPALA_DESA", "PERANGKAT_DESA")).toBe(true);
    // Keduanya setara — tidak saling mengelola.
    expect(bolehKelolaAkun("SEKRETARIS_DESA", "KEPALA_DESA")).toBe(false);
    expect(bolehKelolaAkun("KEPALA_DESA", "SEKRETARIS_DESA")).toBe(false);
    expect(bolehKelolaAkun("PERANGKAT_DESA", "PERANGKAT_DESA")).toBe(false);
  });
});

describe("akunDapatMasuk", () => {
  it("hanya akun aktif yang boleh masuk", () => {
    expect(akunDapatMasuk("AKTIF")).toBe(true);
    expect(akunDapatMasuk("UNDANGAN")).toBe(false);
    expect(akunDapatMasuk("NONAKTIF")).toBe(false);
  });
});

describe("validasiKataSandi", () => {
  it("menerima sandi yang memadai", () => {
    expect(
      validasiKataSandi({ password: "anabanua2026", konfirmasi: "anabanua2026" }).sah,
    ).toBe(true);
  });

  it("menolak sandi terlalu pendek", () => {
    const hasil = validasiKataSandi({ password: "ab1", konfirmasi: "ab1" });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat.join(" ")).toContain(String(PANJANG_SANDI_MIN));
  });

  it("menolak sandi tanpa angka", () => {
    expect(
      validasiKataSandi({ password: "anabanuadua", konfirmasi: "anabanuadua" }).sah,
    ).toBe(false);
  });

  it("menolak ulangan yang tidak sama", () => {
    expect(
      validasiKataSandi({ password: "anabanua2026", konfirmasi: "anabanua2027" }).galat,
    ).toContain("Ulangi kata sandi tidak sama.");
  });
});
describe("validasiAkunBaru", () => {
  const dasar = {
    fullName: "Nurul Hidayah",
    email: "nurul@anabanua.id",
    employeeId: "19950912 201902 2 015",
    position: "Kaur Perencanaan",
    unit: "Sekretariat Desa",
  };

  it("menerima data kepegawaian yang lengkap", () => {
    expect(validasiAkunBaru(dasar).sah).toBe(true);
  });

  it("menolak email yang bentuknya tidak sah", () => {
    expect(validasiAkunBaru({ ...dasar, email: "nurul@" }).sah).toBe(false);
  });

  it("menolak NIP yang terlalu pendek", () => {
    expect(validasiAkunBaru({ ...dasar, employeeId: "123" }).sah).toBe(false);
  });

  it("menolak jabatan kosong", () => {
    expect(validasiAkunBaru({ ...dasar, position: "" }).sah).toBe(false);
  });
});

describe("validasiAktivasiAkun", () => {
  const dasar = {
    password: "anabanua2026",
    konfirmasi: "anabanua2026",
    phoneNumber: "0852-4000-5001",
    address: "Desa Anabanua, Kec. Barru",
    consentBiometrik: true,
  };

  it("menerima aktivasi yang lengkap dengan persetujuan", () => {
    expect(validasiAktivasiAkun(dasar).sah).toBe(true);
  });

  it("menolak aktivasi tanpa persetujuan biometrik", () => {
    const hasil = validasiAktivasiAkun({ ...dasar, consentBiometrik: false });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat.join(" ")).toContain("Persetujuan");
  });

  it("menolak nomor telepon yang tidak masuk akal", () => {
    expect(validasiAktivasiAkun({ ...dasar, phoneNumber: "12" }).sah).toBe(false);
  });

  it("menolak alamat yang terlalu pendek", () => {
    expect(validasiAktivasiAkun({ ...dasar, address: "Barru" }).sah).toBe(false);
  });
});