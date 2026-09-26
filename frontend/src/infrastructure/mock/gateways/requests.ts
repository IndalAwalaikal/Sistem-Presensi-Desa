import type {
  CreateRequestCommand,
  RequestGateway,
} from "@/core/ports/gateways";
import type { WorkRequest } from "@/core/domain/requests";
import { catatAudit, penggunaSession } from "@/infrastructure/mock/helpers";
import { muat, simpan } from "@/infrastructure/mock/store";

export const requestMock: RequestGateway = {
  async listMine(userId) {
    const db = muat();
    return db.requests
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(
    userId: string,
    _userName: string,
    command: CreateRequestCommand,
  ): Promise<WorkRequest> {
    const user = penggunaSession();
    if (user.id !== userId) throw new Error("Tidak berhak.");
    const db = muat();
    const req: WorkRequest = {
      id: `req-${Date.now()}`,
      type: command.type,
      userId,
      userName: user.fullName,
      startDate: command.startDate,
      endDate: command.endDate,
      reason: command.reason,
      status: "MENUNGGU",
      createdAt: new Date().toISOString(),
    };
    db.requests.push(req);
    catatAudit(user, "MENGAJUKAN", "WorkRequest", req.id, `${command.type}: ${command.reason}`);
    simpan();
    return { ...req };
  },

  async cancel(requestId: string): Promise<WorkRequest> {
    const user = penggunaSession();
    const db = muat();
    const req = db.requests.find((r) => r.id === requestId);
    if (!req) throw new Error("Pengajuan tidak ditemukan.");
    if (req.userId !== user.id) {
      throw new Error("Tidak berhak membatalkan pengajuan lain.");
    }
    if (req.status !== "MENUNGGU") {
      throw new Error("Hanya pengajuan berstatus menunggu yang bisa dibatalkan.");
    }
    const hasil: WorkRequest = { ...req, status: "DIBATALKAN" };
    Object.assign(req, hasil);
    catatAudit(user, "MEMBATALKAN_PENGAJUAN", "WorkRequest", req.id, req.reason);
    simpan();
    return hasil;
  },
};
