import type { AppGateways } from "@/core/ports/gateways";
import { authMock } from "@/infrastructure/mock/gateways/auth";
import { profilMock } from "@/infrastructure/mock/gateways/profil";
import { attendanceMock } from "@/infrastructure/mock/gateways/attendance";
import { enrollmentMock } from "@/infrastructure/mock/gateways/enrollment";
import { requestMock } from "@/infrastructure/mock/gateways/requests";
import { adminMock } from "@/infrastructure/mock/gateways/admin";
import { liburMock } from "@/infrastructure/mock/gateways/libur";

/** Kumpulan pintu data contoh (tanpa backend). */
export function createMockGateways(): AppGateways {
  return {
    auth: authMock,
    profil: profilMock,
    attendance: attendanceMock,
    enrollment: enrollmentMock,
    request: requestMock,
    admin: adminMock,
    libur: liburMock,
  };
}
