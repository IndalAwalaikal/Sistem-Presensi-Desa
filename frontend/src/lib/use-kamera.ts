"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type StatusKamera = "idle" | "meminta" | "aktif" | "ditolak" | "error";

export interface KotakPotong {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Area sumber yang tepat berada di balik oval pada video object-fit: cover. */
export function kotakPotongOval(
  lebarVideo: number,
  tinggiVideo: number,
  lebarTampil: number,
  tinggiTampil: number,
): KotakPotong | null {
  if ([lebarVideo, tinggiVideo, lebarTampil, tinggiTampil].some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const skala = Math.max(lebarTampil / lebarVideo, tinggiTampil / tinggiVideo);
  const lebarTerlihat = lebarTampil / skala;
  const tinggiTerlihat = tinggiTampil / skala;
  const width = lebarTerlihat * 0.52;
  const height = tinggiTerlihat * 0.62;
  return {
    x: (lebarVideo - width) / 2,
    y: (tinggiVideo - height) / 2,
    width,
    height,
  };
}

/**
 * Kontrol kamera depan untuk presensi dan pendaftaran wajah.
 * Frame ditangkap tanpa mirror (yang tampil terbalik hanyalah pratinjau).
 */
export function useKamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<StatusKamera>("idle");
  const [pesan, setPesan] = useState<string | null>(null);

  const mulai = useCallback(async () => {
    if (streamRef.current) return;
    setStatus("meminta");
    setPesan(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("aktif");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("ditolak");
        setPesan(
          "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini pada pengaturan browser, lalu ulangi.",
        );
      } else {
        setStatus("error");
        setPesan("Kamera tidak dapat diakses. Pastikan tidak dipakai aplikasi lain.");
      }
    }
  }, []);

  const hentikan = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /**
   * Tangkap area bingkai wajah saja (oval 52%×62% di tengah), skala ke 480 px,
   * JPEG kualitas 0.7 — prinsip minimisasi data biometrik: jangan kirim
   * frame penuh ke server.
   */
  const tangkap = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const potong = kotakPotongOval(
      video.videoWidth,
      video.videoHeight,
      video.clientWidth,
      video.clientHeight,
    );
    if (!potong) return null;

    const sasaranLebar = 480;
    const sasaranTinggi = Math.round((potong.height / potong.width) * sasaranLebar);
    const canvas = document.createElement("canvas");
    canvas.width = sasaranLebar;
    canvas.height = sasaranTinggi;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, potong.x, potong.y, potong.width, potong.height, 0, 0, sasaranLebar, sasaranTinggi);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  return { videoRef, status, pesan, mulai, hentikan, tangkap };
}
