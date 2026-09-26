/**
 * Klien HTTP ke backend Go.
 * Kontrak endpoint didokumentasikan pada setiap gateway di folder ini;
 * cookie sesi HttpOnly disertakan pada setiap permintaan.
 */

const DASAR = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
// Hapus bearer token versi lama. Sesi sekarang disimpan pada cookie HttpOnly
// yang tidak dapat dibaca JavaScript.
if (typeof window !== "undefined") window.localStorage.removeItem("presensi-anabanua-token");

/** Kesalahan API dengan pesan dari server bila tersedia. */
export class KesalahanApi extends Error {
  readonly status: number;
  constructor(pesan: string, status: number) {
    super(pesan);
    this.name = "KesalahanApi";
    this.status = status;
  }
}

async function kirim<T>(
  jalur: string,
  metode: "GET" | "POST" | "DELETE",
  isi?: unknown,
  kueri?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(DASAR + jalur, window.location.origin);
  for (const [k, v] of Object.entries(kueri ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: metode,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: isi === undefined ? undefined : JSON.stringify(isi),
  });

  if (!res.ok) {
    let pesan: string | undefined;
    try {
      pesan = ((await res.json()) as { pesan?: string }).pesan;
    } catch {
      // Respons bukan JSON — pakai pesan umum.
    }
    throw new KesalahanApi(pesan ?? `Permintaan gagal (${res.status}).`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Pintu permintaan HTTP: get/post/delete dengan cookie sesi dan peta kueri. */
export const api = {
  get<T>(jalur: string, kueri?: Record<string, string | undefined>): Promise<T> {
    return kirim<T>(jalur, "GET", undefined, kueri);
  },
  post<T>(jalur: string, isi?: unknown): Promise<T> {
    return kirim<T>(jalur, "POST", isi);
  },
  delete<T>(jalur: string): Promise<T> {
    return kirim<T>(jalur, "DELETE");
  },
};
