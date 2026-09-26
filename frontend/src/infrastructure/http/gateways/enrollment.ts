import type {
  EnrollmentGateway,
  SubmitEnrollmentCommand,
} from "@/core/ports/gateways";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import { api } from "@/infrastructure/http/client";

export const enrollmentHttp: EnrollmentGateway = {
  getMine(userId: string): Promise<FaceEnrollment | null> {
    return api.get<FaceEnrollment | null>("/enrollment/saya", { userId });
  },

  async validatePhoto(image: string): Promise<void> {
    await api.post<{ valid: boolean }>("/enrollment/validasi-foto", { image });
  },

  submit(
    userId: string,
    command: SubmitEnrollmentCommand,
  ): Promise<FaceEnrollment> {
    return api.post<FaceEnrollment>("/enrollment", { userId, ...command });
  },
};
