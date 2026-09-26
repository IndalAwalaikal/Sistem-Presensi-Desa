/**
 * Liveness demo: bandingkan dua potret berjarak ±400 ms.
 * Wajah manusia nyata selalu bergerak sedikit; foto statis tidak.
 * Pada produksi, fungsi ini digantikan panggilan layanan AI (Python).
 */
export function skorLiveness(
  frameA: ImageData,
  frameB: ImageData,
): number {
  const a = frameA.data;
  const b = frameB.data;
  let totalBeda = 0;
  let n = 0;
  // Sampel tiap 64 byte (16 piksel) agar cepat.
  for (let i = 0; i < a.length && i < b.length; i += 64) {
    totalBeda += Math.abs(a[i] - b[i]);
    n++;
  }
  if (n === 0) return 0;
  const rataBeda = totalBeda / n;
  // 0 = diam sempurna; ≥18 = gerakan wajar. Petakan ke 0–1 dengan batas 1.
  return Math.min(1, rataBeda / 18);
}

/** Potret frame video saat ini sebagai ImageData untuk perbandingan. */
export function potretFrame(video: HTMLVideoElement): ImageData | null {
  if (!video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Skor wajah demo: deterministik dari isi gambar (bukan model sungguhan).
 * Digantikan face verification dari layanan AI saat backend tersambung.
 */
export function skorWajahDemo(dataUrl: string): number {
  let h = 0;
  for (let i = 0; i < dataUrl.length; i += 97) {
    h = (h * 31 + dataUrl.charCodeAt(i)) >>> 0;
  }
  return 0.9 + (h % 900) / 10_000;
}
