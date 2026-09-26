import type {
  AttendanceFilters,
  AttendanceGateway,
  AttendanceStatus,
  OfficeLocation,
  PresensiResult,
  SubmitPresensiCommand,
  TodayStatus,
  WorkSchedule,
} from "@/core/ports/gateways";
import { api } from "@/infrastructure/http/client";

interface KonfigurasiAktif {
  office: OfficeLocation;
  schedule: WorkSchedule;
  maxAccuracyMeters: number;
}

export const attendanceHttp: AttendanceGateway = {
  getTodayStatus(userId: string): Promise<TodayStatus> {
    return api.get<TodayStatus>("/presensi/hari-ini", { userId });
  },

  listMine(filters?: AttendanceFilters) {
    return api.get("/presensi/saya", {
      dari: filters?.from,
      sampai: filters?.to,
      status: filters?.status as AttendanceStatus | undefined,
    });
  },

  getActiveConfig(): Promise<KonfigurasiAktif> {
    return api.get<KonfigurasiAktif>("/konfigurasi");
  },

  submitPresensi(command: SubmitPresensiCommand): Promise<PresensiResult> {
    return api.post<PresensiResult>("/presensi", command);
  },
};
