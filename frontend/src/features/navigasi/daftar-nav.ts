import {
  BarChart3,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  Clock,
  FileText,
  Fingerprint,
  LayoutDashboard,
  ScrollText,
  ScanFace,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface ItemNav {
  href: string;
  label: string;
  ikon: LucideIcon;
}

/** Navigasi utama semua pengguna. */
export const NAV_UTAMA: ItemNav[] = [
  { href: "/dashboard", label: "Dashboard", ikon: LayoutDashboard },
  { href: "/presensi", label: "Presensi", ikon: Fingerprint },
  { href: "/riwayat", label: "Riwayat", ikon: CalendarDays },
  { href: "/pengajuan", label: "Pengajuan", ikon: FileText },
  { href: "/profil", label: "Profil", ikon: UserRound },
];

/** Navigasi administrasi — hanya untuk sekretaris desa dan kepala desa. */
export const NAV_ADMIN: ItemNav[] = [
  { href: "/monitoring", label: "Monitoring", ikon: LayoutDashboard },
  { href: "/pengguna", label: "Pengguna", ikon: Users },
  { href: "/jadwal", label: "Jam Kerja", ikon: Clock },
  { href: "/hari-libur", label: "Hari Libur", ikon: CalendarOff },
  { href: "/verifikasi-wajah", label: "Verifikasi Wajah", ikon: ScanFace },
  { href: "/persetujuan", label: "Persetujuan", ikon: ClipboardCheck },
  { href: "/laporan", label: "Laporan", ikon: BarChart3 },
  { href: "/audit", label: "Audit", ikon: ScrollText },
];
