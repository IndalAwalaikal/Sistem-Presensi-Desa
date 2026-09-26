import type { AppGateways } from "@/core/ports/gateways";
import { authHttp } from "@/infrastructure/http/gateways/auth";
import { profilHttp } from "@/infrastructure/http/gateways/profil";
import { attendanceHttp } from "@/infrastructure/http/gateways/attendance";
import { enrollmentHttp } from "@/infrastructure/http/gateways/enrollment";
import { requestHttp } from "@/infrastructure/http/gateways/requests";
import { adminHttp } from "@/infrastructure/http/gateways/admin";
import { liburHttp } from "@/infrastructure/http/gateways/libur";

/** Kumpulan pintu data via HTTP — mengacu pada kontrak API backend Go. */
export function createHttpGateways(): AppGateways {
  return {
    auth: authHttp,
    profil: profilHttp,
    attendance: attendanceHttp,
    enrollment: enrollmentHttp,
    request: requestHttp,
    admin: adminHttp,
    libur: liburHttp,
  };
}
