import { describe, expect, it } from "vitest";
import { kotakPotongOval } from "@/lib/use-kamera";

describe("kotakPotongOval", () => {
  it("menyamakan crop dengan oval saat video landscape tampil portrait", () => {
    const crop = kotakPotongOval(1280, 720, 360, 480);
    expect(crop).not.toBeNull();
    expect(crop!.x + crop!.width / 2).toBeCloseTo(640);
    expect(crop!.y + crop!.height / 2).toBeCloseTo(360);
    // Area yang terlihat pada layar hanya 540×720 dari sensor 1280×720.
    expect(crop!.width).toBeCloseTo(540 * 0.52);
    expect(crop!.height).toBeCloseTo(720 * 0.62);
  });

  it("menolak ukuran sumber atau elemen video yang belum tersedia", () => {
    expect(kotakPotongOval(0, 720, 360, 480)).toBeNull();
    expect(kotakPotongOval(1280, 720, 0, 480)).toBeNull();
  });
});
