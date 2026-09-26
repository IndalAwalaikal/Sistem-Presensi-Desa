import type { AccountStatus, User } from "@/core/domain/user";
import {
  bolehKelolaAkun,
  bolehKelolaJadwal,
  bolehTetapkanRole,
  isAdminRole,
  ROLE_LABEL,
} from "@/core/domain/user";
import type {
  Attendance,
  WorkSchedule,
  OfficeLocation,
  JadwalKhusus,
} from "@/core/domain/attendance";
import { kalenderLibur } from "@/core/domain/libur";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import {
  UNDANGAN_MASA_BERLAKU_HARI,
  type Undangan,
} from "@/core/domain/undangan";
import type {
  AdminGateway,
  AkunBaru,
  AttendanceListItem,
  CreateMassalCommand,
  CreateUserCommand,
  CreateJadwalKhususCommand,
  DecideCommand,
  HasilMassal,
  MonthlyRecapRow,
  UpdateOfficeCommand,
  UpdateScheduleCommand,
} from "@/core/ports/gateways";
import type {
  AuditLog,
  RequestStatus,
  WorkRequest,
} from "@/core/domain/requests";
import { validasiAkunBaru } from "@/core/usecase/akun";
import { rapikanJadwal, validasiJadwal } from "@/core/usecase/jadwal";
import { hariDijelaskan, hitungHariPengajuanBulan, tanpaKeteranganBulan } from "@/core/usecase/kehadiran";
import { ringkasanSelisih } from "@/core/usecase/attendance-status";
import { tanggalISO } from "@/lib/waktu";
import type { StoredUser } from "@/infrastructure/mock/seed-users";
import {
  catatAudit,
  gugurkanUndangan,
  idPenggunaBaru,
  keUser,
  penggunaSession,
  terbitkanUndangan,
} from "@/infrastructure/mock/helpers";
import { muat, simpan } from "@/infrastructure/mock/store";

function dalamBulan(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** Baris presensi untuk daftar/monitoring: jabatan diambil dari data pengguna. */
function keListItem(
  a: Attendance,
  db: { users: StoredUser[] },
): AttendanceListItem {
  const user = db.users.find((u) => u.id === a.userId);
  return {
    id: a.id,
    userId: a.userId,
    userName: a.userName,
    position: user?.official.position ?? "—",
    type: a.type,
    mode: a.mode,
    status: a.status,
    at: a.verification.serverTime,
    selisihMenit: a.selisihMenit ?? 0,
    distanceMeters: a.verification.geofence.distanceMeters,
  };
}

/**
 * Akun yang diperhitungkan pada laporan kedisiplinan: semua akun aktif. Sekretaris
 * dan kepala desa juga perangkat desa yang wajib presensi, jadi keduanya ikut
 * dihitung. Akun NONAKTIF dan yang belum diaktivasi tidak.
 */
function perangkatAktif(users: StoredUser[]): StoredUser[] {
  return users.filter((u) => u.accountStatus === "AKTIF");
}

export const adminMock: AdminGateway = {
  async listPendingEnrollments(): Promise<FaceEnrollment[]> {
    const db = muat();
    return db.enrollments.filter((e) => e.status === "SUBMITTED").map((e) => ({ ...e }));
  },

  async reviewEnrollment(
    enrollmentId: string,
    approve: boolean,
    note?: string,
  ): Promise<FaceEnrollment> {
    const reviewer = penggunaSession();
    const db = muat();
    const idx = db.enrollments.findIndex((e) => e.id === enrollmentId);
    if (idx === -1) throw new Error("Pendaftaran tidak ditemukan.");
    const enr = db.enrollments[idx];
    const hasil: FaceEnrollment = {
      ...enr,
      status: approve ? "APPROVED" : "REJECTED",
      reviewedAt: new Date().toISOString(),
      reviewerNote: note,
    };
    db.enrollments[idx] = hasil;
    const user = db.users.find((u) => u.id === hasil.userId);
    if (user) user.biometricStatus = approve ? "ACTIVE" : "REJECTED";
    catatAudit(
      reviewer,
      approve ? "MENYETUJUI_BIOMETRIK" : "MENOLAK_BIOMETRIK",
      "FaceEnrollment",
      hasil.id,
      `Biometrik ${hasil.userName} ${approve ? "disetujui" : "ditolak"}.${note ? ` Catatan: ${note}` : ""}`,
    );
    simpan();
    return hasil;
  },

  async listAllUsers(): Promise<User[]> {
    const db = muat();
    return db.users.map(keUser);
  },

  /**
   * Buat akun perangkat desa (dokumen §6). Akun lahir berstatus UNDANGAN tanpa
   * kata sandi: yang bersangkutan menetapkan sandinya sendiri lewat kode
   * undangan sekali pakai, sedangkan identitas kepegawaian diisi sekretaris atau
   * kepala desa dari sumber administrasi resmi supaya tidak dapat diklaim
   * sendiri.
   */
  async createUser(command: CreateUserCommand): Promise<AkunBaru> {
    const aktor = penggunaSession();
    const db = muat();

    const periksa = validasiAkunBaru(command);
    if (!periksa.sah) throw new Error(periksa.galat[0]);

    if (!bolehTetapkanRole(aktor.role, command.role)) {
      throw new Error(
        `Akun dengan peran ${ROLE_LABEL[command.role]} tidak dapat dibuat dari halaman ini.`,
      );
    }

    const email = command.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) {
      throw new Error("Email dinas sudah dipakai akun lain.");
    }
    const nip = command.employeeId.trim();
    if (db.users.some((u) => u.official.employeeId === nip)) {
      throw new Error("NIP/NIK administrasi sudah terdaftar pada akun lain.");
    }

    const user: StoredUser = {
      id: idPenggunaBaru(command.fullName),
      fullName: command.fullName.trim(),
      email,
      password: "",
      role: command.role,
      accountStatus: "UNDANGAN",
      biometricStatus: "NOT_ENROLLED",
      dibuatPada: new Date().toISOString(),
      official: {
        employeeId: nip,
        position: command.position.trim(),
        unit: command.unit.trim(),
        phoneNumber: command.phoneNumber?.trim() ?? "",
        address: command.address?.trim() ?? "Desa Anabanua, Kec. Barru, Kab. Barru",
      },
    };
    db.users.push(user);

    const undangan = terbitkanUndangan(db, user);
    catatAudit(
      aktor,
      "MEMBUAT_AKUN",
      "User",
      user.id,
      `Akun ${user.fullName} (${ROLE_LABEL[user.role]}) dibuat; kode undangan diterbitkan dan berlaku ${UNDANGAN_MASA_BERLAKU_HARI} hari.`,
    );
    simpan();
    return { user: keUser(user), undangan };
  },

  async listUndangan(): Promise<Undangan[]> {
    const db = muat();
    return [...db.undangan].sort((a, b) =>
      b.dibuatPada.localeCompare(a.dibuatPada),
    );
  },

  async setAccountStatus(userId: string, status: AccountStatus): Promise<User> {
    const aktor = penggunaSession();
    const db = muat();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("Pengguna tidak ditemukan.");
    if (user.id === aktor.id) {
      throw new Error("Status akun sendiri tidak dapat diubah dari halaman ini.");
    }
    if (!bolehKelolaAkun(aktor.role, user.role)) {
      throw new Error(
        `Akun dengan peran ${ROLE_LABEL[user.role]} tidak dapat dikelola dari halaman ini.`,
      );
    }

    user.accountStatus = status;
    // Menonaktifkan akun sekaligus menggugurkan kode undangan yang belum dipakai,
    // supaya akun nonaktif tidak dapat dihidupkan lewat kode lama.
    if (status !== "AKTIF") gugurkanUndangan(db, user.id);

    catatAudit(
      aktor,
      status === "AKTIF" ? "MENGAKTIFKAN_AKUN_ADMIN" : "MENONAKTIFKAN_AKUN",
      "User",
      user.id,
      `Status akun ${user.fullName} diubah menjadi ${status}.`,
    );
    simpan();
    return keUser(user);
  },

  async resetPassword(userId: string): Promise<AkunBaru> {
    const aktor = penggunaSession();
    const db = muat();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("Pengguna tidak ditemukan.");
    if (user.id === aktor.id) {
      throw new Error("Kata sandi akun sendiri tidak dapat direset dari halaman ini.");
    }
    if (!bolehKelolaAkun(aktor.role, user.role)) {
      throw new Error(
        `Akun dengan peran ${ROLE_LABEL[user.role]} tidak dapat dikelola dari halaman ini.`,
      );
    }

    // Kata sandi lama langsung tidak berlaku; pemulihan lewat kode baru.
    user.password = "";
    user.accountStatus = "UNDANGAN";
    const undangan = terbitkanUndangan(db, user);
    catatAudit(
      aktor,
      "MERESET_KATA_SANDI",
      "User",
      user.id,
      `Kata sandi ${user.fullName} direset; kode undangan baru diterbitkan dan berlaku ${UNDANGAN_MASA_BERLAKU_HARI} hari.`,
    );
    simpan();
    return { user: keUser(user), undangan };
  },

  async listAllRequests(status?: RequestStatus): Promise<WorkRequest[]> {
    const db = muat();
    return db.requests
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  },

  /**
   * Pengajuan massal contoh: perilakunya sama dengan server — satu batch untuk
   * seluruh baris, id tak dikenal menggagalkan semuanya, id kembar menyisakan
   * satu baris.
   */
  async kirimMassal(command: CreateMassalCommand): Promise<HasilMassal> {
    const aktor = penggunaSession();
    if (!isAdminRole(aktor.role)) {
      throw new Error("Hanya sekretaris atau kepala desa yang dapat mengirim pengajuan massal.");
    }
    if (command.startDate > command.endDate) {
      throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    }
    if (!command.reason.trim()) throw new Error("Alasan pengajuan wajib diisi.");
    const terlihat = new Set<string>();
    const unik: string[] = [];
    for (const id of command.userIds) {
      const rapih = id.trim();
      if (!rapih || terlihat.has(rapih)) continue;
      terlihat.add(rapih);
      unik.push(rapih);
    }
    if (unik.length === 0) throw new Error("Pilih minimal satu perangkat.");
    const db = muat();
    for (const id of unik) {
      if (!db.users.some((u) => u.id === id)) {
        throw new Error("Ada perangkat yang tidak ditemukan pada daftar pengguna.");
      }
    }
    const batchId = `bch-${Date.now()}`;
    const kini = new Date().toISOString();
    const dibuat: WorkRequest[] = unik.map((id, i) => {
      const u = db.users.find((x) => x.id === id);
      return {
        id: `req-${Date.now()}-${i}`,
        type: command.type,
        userId: id,
        userName: u?.fullName ?? "—",
        startDate: command.startDate,
        endDate: command.endDate,
        reason: command.reason.trim(),
        status: "MENUNGGU",
        createdAt: kini,
        batchId,
      };
    });
    db.requests.push(...dibuat);
    catatAudit(
      aktor,
      "MEMBUAT_PENGAJUAN_MASSAL",
      "WorkRequestBatch",
      batchId,
      `${command.type} massal untuk ${dibuat.length} perangkat.`,
    );
    simpan();
    return { batchId, jumlah: dibuat.length, pengajuan: dibuat.map((r) => ({ ...r })) };
  },

  async decideRequest(command: DecideCommand): Promise<WorkRequest> {
    const approver = penggunaSession();
    const db = muat();
    const req = db.requests.find((r) => r.id === command.requestId);
    if (!req) throw new Error("Pengajuan tidak ditemukan.");
    if (req.status !== "MENUNGGU") throw new Error("Pengajuan sudah diputuskan.");
    const hasil: WorkRequest = {
      ...req,
      status: command.approve ? "DISETUJUI" : "DITOLAK",
      decidedAt: new Date().toISOString(),
      decidedByName: approver.fullName,
      decisionNote: command.note,
    };
    Object.assign(req, hasil);
    catatAudit(
      approver,
      command.approve ? "MENYETUJUI_PENGAJUAN" : "MENOLAK_PENGAJUAN",
      "WorkRequest",
      req.id,
      `${req.type} ${req.userName}: ${command.approve ? "disetujui" : "ditolak"}.${command.note ? ` ${command.note}` : ""}`,
    );
    simpan();
    return hasil;
  },

  async listAttendance(filters?: { date?: string }): Promise<AttendanceListItem[]> {
    const db = muat();
    return db.attendance
      .filter(
        (a) =>
          !filters?.date ||
          tanggalISO(a.verification.serverTime) === filters.date,
      )
      .sort((a, b) =>
        b.verification.serverTime.localeCompare(a.verification.serverTime),
      )
      .map((a) => keListItem(a, db));
  },

  async listAuditLogs(): Promise<AuditLog[]> {
    const db = muat();
    return db.auditLogs.slice(0, 100).map((a) => ({ ...a }));
  },

  async getMonthlyRecap(year: number, month: number): Promise<MonthlyRecapRow[]> {
    const db = muat();
    return perangkatAktif(db.users).map((u) => {
      const presensi = db.attendance.filter(
        (a) =>
          a.userId === u.id &&
          a.type === "CHECK_IN" &&
          dalamBulan(a.verification.serverTime, year, month),
      );
      // Durasi penyimpangan jam kerja dihitung dari seluruh transaksi bulan itu
      // (masuk & pulang) terhadap jadwal — aturan yang sama dengan server.
      const transaksi = db.attendance.filter(
        (a) => a.userId === u.id && dalamBulan(a.verification.serverTime, year, month),
      );
      const selisih = ringkasanSelisih(transaksi, db.schedule);
      // Izin/sakit/cuti dihitung dalam HARI KERJA yang dicakup, bukan jumlah
      // berkas pengajuan, dan pengajuan lintas bulan tetap menyumbang hari yang
      // jatuh di bulan ini — paralel `domain.HariPengajuanBulan` backend.
      const hariDisetujui = (tipe: WorkRequest["type"]) =>
        hitungHariPengajuanBulan({
          pengajuan: db.requests.filter((r) => r.userId === u.id),
          tipe,
          tahun: year,
          bulan: month,
          jadwal: db.schedule,
          libur: kalenderLibur(db.hariLibur),
        });
      // Hari yang tanpa presensi: hari kerja tertutup tanpa presensi masuk dan
      // tanpa izin/sakit/cuti disetujui — aturan yang sama dengan server.
      const hadirHari = new Set(
        presensi.map((a) => tanggalISO(a.verification.serverTime)),
      );
      const dijelaskan = hariDijelaskan(
        db.requests.filter((r) => r.userId === u.id),
      );
      const tanpaKeterangan = tanpaKeteranganBulan({
        tahun: year,
        bulan: month,
        jadwal: db.schedule,
        // Kalender libur ikut: hari libur nasional, cuti bersama, dan libur lokal
        // tidak pernah dihitung sebagai tanpa keterangan.
        libur: kalenderLibur(db.hariLibur),
        sekarang: new Date(),
        hadir: hadirHari,
        dijelaskan,
        sejak: u.dibuatPada ? u.dibuatPada.slice(0, 10) : undefined,
      });
      return {
        userId: u.id,
        userName: u.fullName,
        employeeId: u.official.employeeId,
        position: u.official.position,
        hadir: presensi.length,
        terlambat: presensi.filter((a) => a.status === "TERLAMBAT").length,
        izin: hariDisetujui("IZIN"),
        sakit: hariDisetujui("SAKIT"),
        cuti: hariDisetujui("CUTI"),
        tanpaKeterangan,
        terlambatMenit: selisih.terlambatMenit,
        pulangCepatMenit: selisih.pulangCepatMenit,
      };
    });
  },

  /**
   * Tetapkan jam kerja kantor. Perubahan berlaku untuk semua perangkat — jam
   * inilah yang dipakai `getActiveConfig` dan `submitPresensi` berikutnya, jadi
   * tidak ada lagi jam masuk/pulang yang dipatri di kode.
   */
  async updateSchedule(command: UpdateScheduleCommand): Promise<WorkSchedule> {
    const aktor = penggunaSession();
    if (!bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat menetapkan jam kerja.",
      );
    }

    const periksa = validasiJadwal(command);
    if (!periksa.sah) throw new Error(periksa.galat[0]);

    const db = muat();
    const sebelum = db.schedule;
    const sesudah: WorkSchedule = { ...db.schedule, ...rapikanJadwal(command) };
    db.schedule = sesudah;

    catatAudit(
      aktor,
      "MENGUBAH_JADWAL",
      "WorkSchedule",
      sesudah.id,
      "Jam kerja diubah: " +
        `masuk ${sebelum.checkInStart}–${sebelum.checkInDeadline}, pulang ${sebelum.checkOutStart}–${sebelum.checkOutEnd} → ` +
        `masuk ${sesudah.checkInStart}–${sesudah.checkInDeadline}, pulang ${sesudah.checkOutStart}–${sesudah.checkOutEnd}; ` +
        `${sesudah.workDays.length} hari kerja.`,
    );
    simpan();
    return { ...sesudah, workDays: [...sesudah.workDays] };
  },

  /**
   * Tetapkan titik & radius geofence kantor (paralel dengan
   * `POST /admin/kantor` backend). Berlaku langsung untuk presensi berikutnya.
   */
  async updateOffice(command: UpdateOfficeCommand): Promise<OfficeLocation> {
    const aktor = penggunaSession();
    if (!bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat menetapkan lokasi kantor.",
      );
    }

    const nama = command.name.trim();
    if (!nama) throw new Error("Nama kantor wajib diisi.");
    if (command.latitude < -90 || command.latitude > 90) {
      throw new Error("Garis lintang harus antara -90 dan 90.");
    }
    if (command.longitude < -180 || command.longitude > 180) {
      throw new Error("Garis bujur harus antara -180 dan 180.");
    }
    if (command.radiusMeters < 20 || command.radiusMeters > 1000) {
      throw new Error("Radius geofence harus 20 sampai 1000 meter.");
    }

    const db = muat();
    const sesudah: OfficeLocation = {
      id: db.office.id,
      name: nama,
      point: { latitude: command.latitude, longitude: command.longitude },
      radiusMeters: command.radiusMeters,
    };
    db.office = sesudah;

    catatAudit(
      aktor,
      "MENGUBAH_KANTOR",
      "OfficeLocation",
      sesudah.id,
      `Lokasi kantor diubah: ${nama} (${command.latitude.toFixed(5)}, ${command.longitude.toFixed(5)}) radius ${command.radiusMeters} m.`,
    );
    simpan();
    return { ...sesudah, point: { ...sesudah.point } };
  },

  async listJadwalKhusus(): Promise<JadwalKhusus[]> {
    const db = muat();
    return (db.jadwalKhusus ?? []).map((j) => ({ ...j }));
  },

  async createJadwalKhusus(command: CreateJadwalKhususCommand): Promise<JadwalKhusus> {
    const aktor = penggunaSession();
    if (!aktor || !bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat mengelola jadwal khusus.",
      );
    }
    const periksa = validasiJadwal(command);
    if (!periksa.sah) throw new Error(periksa.galat[0]);
    if (!command.startDate || !command.endDate) {
      throw new Error("Tanggal mulai dan selesai wajib diisi.");
    }
    if (command.startDate > command.endDate) {
      throw new Error("Tanggal mulai tidak boleh melewati tanggal selesai.");
    }

    const db = muat();
    const id = `jk-${Date.now()}`;
    const jk: JadwalKhusus = {
      id,
      name: command.name.trim() || "Jadwal Khusus",
      startDate: command.startDate,
      endDate: command.endDate,
      checkInStart: command.checkInStart,
      checkInDeadline: command.checkInDeadline,
      checkOutStart: command.checkOutStart,
      checkOutEnd: command.checkOutEnd,
      workDays: rapikanJadwal(command).workDays,
      createdBy: aktor.fullName,
      createdAt: new Date().toISOString(),
    };
    db.jadwalKhusus = [...(db.jadwalKhusus ?? []), jk];
    catatAudit(
      aktor,
      "MENAMBAH_JADWAL_KHUSUS",
      "JadwalKhusus",
      id,
      `Jadwal khusus dibuat: ${jk.name} (${jk.startDate} s/d ${jk.endDate}).`,
    );
    simpan();
    return { ...jk };
  },

  async deleteJadwalKhusus(id: string): Promise<void> {
    const aktor = penggunaSession();
    if (!aktor || !bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat mengelola jadwal khusus.",
      );
    }
    const db = muat();
    const ada = (db.jadwalKhusus ?? []).find((j) => j.id === id);
    db.jadwalKhusus = (db.jadwalKhusus ?? []).filter((j) => j.id !== id);
    catatAudit(
      aktor,
      "MENGHAPUS_JADWAL_KHUSUS",
      "JadwalKhusus",
      id,
      `Jadwal khusus dihapus: ${ada?.name ?? id}.`,
    );
    simpan();
  },

  /** Jumlah pengajuan MENUNGGU (paralel dengan `GET /admin/pengajuan/menunggu`). */
  async jumlahPengajuanMenunggu(): Promise<number> {
    const db = muat();
    return db.requests.filter((r) => r.status === "MENUNGGU").length;
  },
};
