import type {
  AdminGateway,
  AkunBaru,
  AttendanceListItem,
  CreateMassalCommand,
  CreateUserCommand,
  DecideCommand,
  HasilMassal,
  MonthlyRecapRow,
  OfficeLocation,
  UpdateOfficeCommand,
  UpdateScheduleCommand,
} from "@/core/ports/gateways";
import type { AccountStatus, User } from "@/core/domain/user";
import type { WorkSchedule, JadwalKhusus, CreateJadwalKhususCommand } from "@/core/domain/attendance";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import type { Undangan } from "@/core/domain/undangan";
import type {
  AuditLog,
  RequestStatus,
  WorkRequest,
} from "@/core/domain/requests";
import { api } from "@/infrastructure/http/client";

export const adminHttp: AdminGateway = {
  listPendingEnrollments(): Promise<FaceEnrollment[]> {
    return api.get<FaceEnrollment[]>("/admin/enrollment/menunggu");
  },

  reviewEnrollment(
    enrollmentId: string,
    approve: boolean,
    note?: string,
  ): Promise<FaceEnrollment> {
    return api.post<FaceEnrollment>(
      `/admin/enrollment/${encodeURIComponent(enrollmentId)}/putuskan`,
      { approve, note },
    );
  },

  listAllUsers(): Promise<User[]> {
    return api.get<User[]>("/admin/pengguna");
  },

  /** Buat akun + terbitkan kode undangan; backend mengembalikan keduanya. */
  createUser(command: CreateUserCommand): Promise<AkunBaru> {
    return api.post<AkunBaru>("/admin/pengguna", command);
  },

  listUndangan(): Promise<Undangan[]> {
    return api.get<Undangan[]>("/admin/undangan");
  },

  setAccountStatus(userId: string, status: AccountStatus): Promise<User> {
    return api.post<User>(
      `/admin/pengguna/${encodeURIComponent(userId)}/status`,
      { status },
    );
  },

  /** Reset kata sandi: backend menggugurkan sandi lama & menerbitkan kode baru. */
  resetPassword(userId: string): Promise<AkunBaru> {
    return api.post<AkunBaru>(
      `/admin/pengguna/${encodeURIComponent(userId)}/reset-sandi`,
    );
  },

  listAllRequests(status?: RequestStatus): Promise<WorkRequest[]> {
    return api.get<WorkRequest[]>("/admin/pengajuan", {
      status: status as RequestStatus | undefined,
    });
  },

  decideRequest(command: DecideCommand): Promise<WorkRequest> {
    return api.post<WorkRequest>("/admin/pengajuan/putuskan", command);
  },

  /**
   * Pengajuan massal: satu kiriman untuk banyak perangkat sekaligus. Server
   * mengembalikan seluruh baris beserta penanda batch yang sama — pemanggil
   * cukup melaporkan jumlahnya, bukan menampilkan satu-satu.
   */
  kirimMassal(command: CreateMassalCommand): Promise<HasilMassal> {
    return api.post<HasilMassal>("/admin/pengajuan/massal", command);
  },

  listAttendance(filters?: { date?: string }): Promise<AttendanceListItem[]> {
    return api.get<AttendanceListItem[]>("/admin/presensi", { tanggal: filters?.date });
  },

  listAuditLogs(): Promise<AuditLog[]> {
    return api.get<AuditLog[]>("/admin/audit");
  },

  getMonthlyRecap(year: number, month: number): Promise<MonthlyRecapRow[]> {
    return api.get<MonthlyRecapRow[]>("/admin/rekap", {
      tahun: String(year),
      bulan: String(month),
    });
  },

  /** Tetapkan jam kerja kantor; backend menyimpan sebagai konfigurasi aktif. */
  updateSchedule(command: UpdateScheduleCommand): Promise<WorkSchedule> {
    return api.post<WorkSchedule>("/admin/jadwal", command);
  },

  /** Tetapkan titik & radius geofence kantor. */
  updateOffice(command: UpdateOfficeCommand): Promise<OfficeLocation> {
    return api.post<OfficeLocation>("/admin/kantor", command);
  },

  listJadwalKhusus(): Promise<JadwalKhusus[]> {
    return api.get<JadwalKhusus[] | null>("/admin/jadwal-khusus").then((daftar) => daftar ?? []);
  },

  createJadwalKhusus(command: CreateJadwalKhususCommand): Promise<JadwalKhusus> {
    return api.post<JadwalKhusus>("/admin/jadwal-khusus", command);
  },

  deleteJadwalKhusus(id: string): Promise<void> {
    return api.delete<{ pesan: string }>(`/admin/jadwal-khusus/${encodeURIComponent(id)}`).then(() => undefined);
  },

  /** Jumlah pengajuan MENUNGGU untuk lencana notifikasi. */
  jumlahPengajuanMenunggu(): Promise<number> {
    return api.get<{ jumlah: number }>("/admin/pengajuan/menunggu").then((r) => r.jumlah);
  },
};
