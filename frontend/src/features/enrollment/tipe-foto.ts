export interface Foto {
  dataUrl: string;
  /** Skor kualitas lama bersifat opsional dan tidak dipakai untuk keputusan. */
  quality?: number;
  capturedAt: string;
}
