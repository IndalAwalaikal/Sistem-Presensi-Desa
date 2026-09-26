import type {
  EnrollmentGateway,
  SubmitEnrollmentCommand,
} from "@/core/ports/gateways";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import { catatAudit, penggunaSession } from "@/infrastructure/mock/helpers";
import { muat, simpan } from "@/infrastructure/mock/store";

export const enrollmentMock: EnrollmentGateway = {
  async validatePhoto() {
    // Mock tidak menjalankan model wajah; validasi biometrik hanya dilakukan
    // di mode backend. Data contoh tidak pernah dianggap bukti produksi.
  },

  async getMine(userId) {
    const db = muat();
    const found = db.enrollments.find((e) => e.userId === userId);
    return found ?? null;
  },

  async submit(userId, command: SubmitEnrollmentCommand): Promise<FaceEnrollment> {
    const user = penggunaSession();
    if (user.id !== userId) throw new Error("Tidak berhak mengubah data lain.");
    const db = muat();

    const existing = db.enrollments.find((e) => e.userId === userId);
    const enr: FaceEnrollment = {
      id: existing?.id ?? `enr-${Date.now()}`,
      userId,
      userName: user.fullName,
      status: "SUBMITTED",
      photos: [...command.photos],
      submittedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, enr);
    else db.enrollments.push(enr);

    user.biometricStatus = "PENDING_VERIFICATION";
    catatAudit(
      user,
      "MENGIRIM_PENDAFTARAN_WAJAH",
      "FaceEnrollment",
      enr.id,
      `${command.photos.length} foto wajah dikirim untuk verifikasi admin.`,
    );
    simpan();
    return { ...enr };
  },
};
