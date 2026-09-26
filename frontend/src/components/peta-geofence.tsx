"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { AlertTriangle, Check, Locate, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Ikon bangunan monokrom untuk marker kantor — SVG sebaris, bukan emote.
 * Marker Leaflet adalah HTML mentah di luar pohon React, jadi ikonnya digambar
 * sebagai string SVG yang mewarisi `color` dari badge-nya (`currentColor`).
 */
const SVG_KANTOR = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4Z"/></svg>`;

export interface PetaGeofenceProps {
  userLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  } | null;
  officeLocation: {
    latitude: number;
    longitude: number;
    name?: string;
    radiusMeters: number;
  } | null;
  distanceMeters: number | null;
  isInside: boolean;
  className?: string;
}

export function PetaGeofence({
  userLocation,
  officeLocation,
  distanceMeters,
  isInside,
  className,
}: PetaGeofenceProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Titik kantor fallback jika belum terisi (Kantor Desa Anabanua)
  const officeLat = officeLocation?.latitude ?? -4.4680072;
  const officeLng = officeLocation?.longitude ?? 119.713862;
  const officeRadius = officeLocation?.radiusMeters ?? 1000;
  const officeName = officeLocation?.name ?? "Kantor Desa Anabanua";

  // Titik user
  const userLat = userLocation?.latitude;
  const userLng = userLocation?.longitude;
  const userAccuracy = userLocation?.accuracyMeters ?? null;

  const warnaTema = isInside ? "#177a45" : "#b3352c";
  const warnaIsi = isInside ? "rgba(23, 122, 69, 0.12)" : "rgba(179, 53, 44, 0.12)";

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Bersihkan instance peta sebelumnya jika ada
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const centerLat = userLat ?? officeLat;
    const centerLng = userLng ?? officeLng;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    // Tile layer OpenStreetMap standar yang bersih
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
    }).addTo(map);

    // Kontrol atribusi kecil di sudut bawah
    L.control
      .attribution({
        position: "bottomright",
        prefix: false,
      })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>')
      .addTo(map);

    // Kontrol Zoom di sudut kiri atas
    L.control
      .zoom({
        position: "topleft",
      })
      .addTo(map);

    // 1. Lingkaran Geofence Kantor
    const circleGeofence = L.circle([officeLat, officeLng], {
      radius: officeRadius,
      color: warnaTema,
      weight: 2,
      dashArray: "5, 5",
      fillColor: warnaIsi,
      fillOpacity: 0.15,
    }).addTo(map);

    circleGeofence.bindTooltip(
      `<b>${officeName}</b><br/>Radius Geofence: ${officeRadius} m`,
      { direction: "top", offset: [0, -10] },
    );

    // 2. Marker Kantor Desa
    const ikonKantor = L.divIcon({
      className: "custom-marker-kantor",
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
          <div style="background: #0f3d26; color: #fff; border: 2px solid #d4af37; border-radius: 20px; padding: 3px 8px; font-size: 11px; font-weight: 600; white-space: nowrap; box-shadow: 0 3px 8px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-flex; align-items: center;">${SVG_KANTOR}</span> ${officeName}
          </div>
          <div style="width: 2px; height: 8px; background: #d4af37;"></div>
          <div style="width: 6px; height: 6px; background: #d4af37; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.4);"></div>
        </div>
      `,
      iconSize: [0, 0],
    });

    L.marker([officeLat, officeLng], { icon: ikonKantor })
      .addTo(map)
      .bindPopup(`<b>${officeName}</b><br/>Pusat radius presensi kantor.`);

    // 3. Marker & Akurasi Lokasi Pengguna (jika ada koordinat)
    if (userLat !== undefined && userLng !== undefined) {
      // Lingkaran akurasi GPS jika ada
      if (userAccuracy && userAccuracy > 0) {
        L.circle([userLat, userLng], {
          radius: userAccuracy,
          color: "#2563eb",
          weight: 1,
          dashArray: "3, 3",
          fillColor: "#3b82f6",
          fillOpacity: 0.08,
        }).addTo(map);
      }

      // Marker titik pengguna dengan denyut animasi
      const ikonPengguna = L.divIcon({
        className: "custom-marker-user",
        html: `
          <div style="position: relative; width: 28px; height: 28px; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: 0; border-radius: 50%; background: ${warnaTema}; opacity: 0.35; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 15px; height: 15px; border-radius: 50%; background: ${warnaTema}; border: 3px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>
          </div>
        `,
        iconSize: [28, 28],
      });

      const userMarker = L.marker([userLat, userLng], { icon: ikonPengguna }).addTo(map);
      userMarker.bindTooltip(
        `<b>Lokasi Anda</b><br/>${distanceMeters !== null ? `Jarak: ${Math.round(distanceMeters)} m` : ""}${userAccuracy ? `<br/>Akurasi: ±${Math.round(userAccuracy)} m` : ""}`,
        { direction: "top", offset: [0, -14], permanent: false },
      );

      // Garis penghubung titik user ke kantor
      L.polyline(
        [
          [officeLat, officeLng],
          [userLat, userLng],
        ],
        {
          color: warnaTema,
          weight: 1.5,
          dashArray: "4, 6",
          opacity: 0.8,
        },
      ).addTo(map);

      // Sesuaikan pembesaran dan batas layar (fitBounds) agar kedua titik terlihat nyaman
      const bounds = L.latLngBounds([
        [officeLat, officeLng],
        [userLat, userLng],
      ]);
      // Pastikan lingkaran geofence juga masuk dalam pandangan
      bounds.extend(circleGeofence.getBounds());
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17 });
    } else {
      map.setView([officeLat, officeLng], 15);
    }

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [
    officeLat,
    officeLng,
    officeRadius,
    officeName,
    userLat,
    userLng,
    userAccuracy,
    distanceMeters,
    warnaTema,
    warnaIsi,
  ]);

  // Tombol untuk memusatkan kembali peta ke lokasi pengguna
  const pusatkanKePengguna = () => {
    if (!mapInstanceRef.current) return;
    if (userLat !== undefined && userLng !== undefined) {
      mapInstanceRef.current.flyTo([userLat, userLng], 17, { duration: 0.8 });
    } else {
      mapInstanceRef.current.flyTo([officeLat, officeLng], 16, { duration: 0.8 });
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Kontainer Peta Interaktif */}
      <div className="relative h-[290px] w-full overflow-hidden rounded-xl border border-garis bg-meja/40 shadow-inner sm:h-[320px]">
        <div ref={mapContainerRef} className="h-full w-full z-0" />

        {/* Tombol pintasan pusatkan lokasi */}
        {mapReady && (
          <button
            type="button"
            onClick={pusatkanKePengguna}
            title="Pusatkan peta ke lokasi Anda"
            aria-label="Pusatkan peta ke lokasi Anda"
            className="absolute bottom-3 left-3 z-[400] flex h-8 items-center gap-1.5 rounded-lg border border-garis bg-putih/95 px-2.5 py-1 text-[11px] font-semibold text-tinta shadow-md backdrop-blur-sm transition-colors hover:bg-putih active:scale-95"
          >
            <Locate className="h-3.5 w-3.5 text-primer" />
            <span>Pusatkan</span>
          </button>
        )}

        {/* Badge status di sudut kanan atas peta */}
        <div className="absolute right-3 top-3 z-[400] flex items-center gap-1.5 rounded-lg border border-garis/80 bg-putih/95 px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm">
          {isInside ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-primer" />
              <span className="text-primer">Di Dalam Radius</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-3.5 w-3.5 text-bahaya" />
              <span className="text-bahaya">Di Luar Radius</span>
            </>
          )}
        </div>
      </div>

      {/* Ringkasan Parameter Lokasi & Jarak */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-garis-folio bg-putih/60 p-2.5 text-center text-[11.5px]">
        <div>
          <p className="label-arsip text-[9px] text-tinta/45">Jarak Kantor</p>
          <p className="angka-ukur mt-0.5 font-bold text-tinta">
            {distanceMeters !== null ? `${Math.round(distanceMeters)} m` : "—"}
          </p>
        </div>
        <div className="border-x border-garis-folio">
          <p className="label-arsip text-[9px] text-tinta/45">Radius Maks</p>
          <p className="angka-ukur mt-0.5 font-bold text-tinta">
            {officeRadius} m
          </p>
        </div>
        <div>
          <p className="label-arsip text-[9px] text-tinta/45">Akurasi GPS</p>
          <p className="angka-ukur mt-0.5 font-bold text-info">
            {userAccuracy !== null ? `±${Math.round(userAccuracy)} m` : "—"}
          </p>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-tinta/65">
        {isInside ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-primer" aria-hidden />
            <span className="font-medium text-primer">
              Koordinat Anda berada di dalam batas area presensi kantor desa.
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-bahaya" aria-hidden />
            <span className="font-medium text-bahaya">
              Posisi Anda terdeteksi di luar batas radius area kantor desa.
            </span>
          </>
        )}
      </p>
    </div>
  );
}
