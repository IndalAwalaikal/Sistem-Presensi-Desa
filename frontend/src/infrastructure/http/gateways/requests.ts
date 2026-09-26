import type {
  CreateRequestCommand,
  RequestGateway,
} from "@/core/ports/gateways";
import type { WorkRequest } from "@/core/domain/requests";
import { api } from "@/infrastructure/http/client";

export const requestHttp: RequestGateway = {
  listMine(userId: string): Promise<WorkRequest[]> {
    return api.get<WorkRequest[]>("/pengajuan/saya", { userId });
  },

  create(
    userId: string,
    _userName: string,
    command: CreateRequestCommand,
  ): Promise<WorkRequest> {
    return api.post<WorkRequest>("/pengajuan", { userId, ...command });
  },

  cancel(requestId: string): Promise<WorkRequest> {
    return api.post<WorkRequest>(`/pengajuan/${encodeURIComponent(requestId)}/batalkan`);
  },
};
