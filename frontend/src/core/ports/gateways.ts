/**
 * Port (kontrak) keluar dari inti aplikasi.
 * Presentasi dan use case hanya bergantung pada interface ini;
 * infrastruktur (HTTP client / mock) yang menyediakan implementasinya.
 */

import type {
  Attendance,
  AttendanceFilters,
  AttendanceListItem,
  AttendanceMode,
  AttendanceStatus,
  AttendanceType,
  OfficeLocation,
  TodayStatus,
  WorkSchedule,
  VerificationMeta,
  JadwalKhusus,
  CreateJadwalKhususCommand,
} from "@/core/domain/attendance";
import type {
  ENROLLMENT_MIN_PHOTOS,
  EnrollmentPhoto,
  FaceEnrollment,
} from "@/core/domain/enrollment";
import type {
  RequestStatus,
  RequestType,
  WorkRequest,
  AuditLog,
} from "@/core/domain/requests";
import type { User, Role, AccountStatus } from "@/core/domain/user";
import type { HariLibur, JenisLibur } from "@/core/domain/libur";
import type { Undangan } from "@/core/domain/undangan";

// ---------------------------------------------------------------------------
// Perintah (input) dan hasil
// ---------------------------------------------------------------------------

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
}

export interface SubmitPresensiCommand {
  readonly type: AttendanceType;
  readonly mode: AttendanceMode;
  /** Cosine similarity mentah dari AI (-1..1); bukan probabilitas kecocokan. */
  readonly faceScore: number;
  readonly livenessScore: number;
  readonly location: { readonly latitude: number; readonly longitude: number };
  readonly accuracyMeters: number;
  /**
   * Bingkai wajah (data URL) untuk diverifikasi ulang oleh backend melalui
   * layanan AI. Produksi wajib dikirim; pada mode demo boleh kosong.
   */
  readonly frameDataUrl?: string;
}

export interface PresensiRejection {
  readonly code:
    | "BIOMETRIC_INACTIVE"
    | "FACE_FAILED"
    | "LIVENESS_FAILED"
    | "GPS_INACCURATE"
    | "OUTSIDE_GEOFENCE"
    | "MODE_TIDAK_DISETUJUI"
    | "SUDAH_PRESENSI"
    | "BELUM_PRESENSI_MASUK"
    | "PENDING_SYNC"
    | "SERVER_ERROR";
  readonly message: string;
}

export interface PresensiResult {
  readonly accepted: boolean;
  readonly attendance?: Attendance;
  readonly verification?: VerificationMeta;
  readonly rejection?: PresensiRejection;
}

export interface SubmitEnrollmentCommand {
  readonly photos: readonly EnrollmentPhoto[];
}

export interface CreateRequestCommand {
  readonly type: RequestType;
  readonly startDate: string;
  readonly endDate: string;
  readonly reason: string;
}

export interface CreateMassalCommand {
  readonly type: RequestType;
  readonly startDate: string;
  readonly endDate: string;
  readonly reason: string;
  /** Id pengguna yang dicakup — tanpa duplikat, diperiksa oleh server. */
  readonly userIds: readonly string[];
}

export interface HasilMassal {
  readonly batchId: string;
  readonly jumlah: number;
  readonly pengajuan: readonly WorkRequest[];
}

export interface DecideCommand {
  readonly requestId: string;
  readonly approve: boolean;
  readonly note?: string;
}

/**
 * Pembuatan akun oleh sekretaris/kepala desa (dokumen §6): identitas kepegawaian
 * diisi dari sumber administrasi resmi, bukan diklaim sendiri oleh pengguna.
 */
export interface CreateUserCommand {
  readonly fullName: string;
  readonly email: string;
  readonly role: Role;
  /** NIP atau NIK administrasi desa. */
  readonly employeeId: string;
  readonly position: string;
  readonly unit: string;
  readonly phoneNumber?: string;
  readonly address?: string;
}

/** Aktivasi akun dengan kode undangan: data yang boleh diisi sendiri. */
export interface ActivateAccountCommand {
  readonly password: string;
  readonly phoneNumber: string;
  readonly address: string;
  /** Persetujuan pemrosesan data wajah — wajib sebelum enrollment. */
  readonly consentBiometrik: boolean;
}

/**
 * Kontak yang boleh diubah sendiri oleh pemilik akun. Nama, email, NIP/NIK,
 * jabatan, dan unit kerja TIDAK ada di sini: nilainya bersumber dari berkas
 * kepegawaian desa dan ditetapkan pengelola akun saat akun dibuat.
 */
export interface UpdateContactCommand {
  readonly phoneNumber: string;
  readonly address: string;
}

/**
 * Penggantian kata sandi oleh pemiliknya sendiri. Kata sandi lama disebut
 * sebagai bukti; pengelola akun tidak punya cara menetapkan sandi siapa pun
 * (reset hanya menerbitkan kode undangan baru).
 */
export interface ChangePasswordCommand {
  readonly sandiLama: string;
  readonly sandiBaru: string;
}

/** Penetapan jam kerja kantor oleh sekretaris/kepala desa. Yang berubah hanya
 * patokan waktunya; jam kerja ini berlaku untuk semua perangkat sampai diubah
 * lagi, sehingga tidak perlu ada perubahan kode saat kebijakan desa berubah.
 */
export interface UpdateScheduleCommand {
  /** Jam masuk — awal jendela presensi datang. */
  readonly checkInStart: string;
  /** Batas masuk — lewat jam ini presensi datang tercatat terlambat. */
  readonly checkInDeadline: string;
  /** Jam pulang — sebelum jam ini presensi pulang tercatat pulang cepat. */
  readonly checkOutStart: string;
  /** Batas pulang — setelah jam ini tercatat lebih dari jam kerja. */
  readonly checkOutEnd: string;
  /** 0 = Minggu … 6 = Sabtu. */
  readonly workDays: readonly number[];
}

/**
 * Penetapan lokasi kantor (titik GPS & radius geofence) oleh sekretaris/kepala
 * desa — melengkapi jam kerja: keduanya kini aturan yang diatur dari aplikasi,
 * bukan konstanta kode.
 */
export interface UpdateOfficeCommand {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
}

/**
 * Penetapan satu hari libur oleh pengelola akun. Kalender inilah yang membuat
 * hari libur nasional, cuti bersama, dan libur lokal tidak pernah dihitung
 * sebagai "tanpa keterangan" — karenanya tanggalnya wajib tepat.
 */
export interface SimpanLiburCommand {
  /** ISO "YYYY-MM-DD". */
  readonly tanggal: string;
  readonly nama: string;
  /** Kosong = libur lokal (bawaan server, mengikuti kebiasaan penambahan manual). */
  readonly jenis?: JenisLibur;
}

/** Ringkasan penarikan kalender resmi: apa yang benar-benar berubah. */
export interface HasilImporLibur {
  readonly tahun: number;
  /** Tanggal yang belum ada sebelumnya. */
  readonly baru: number;
  /** Tanggal yang namanya/jenisnya diperbarui. */
  readonly diubah: number;
  /** Catatan yang ditetapkan desa — sengaja tidak ditimpa. */
  readonly diabaikan: number;
  readonly hari: readonly HariLibur[];
}

/**
 * Hasil pembuatan akun atau reset kata sandi. Kode undangan hanya ditampilkan
 * sekali kepada pengelola akun; sistem tidak pernah menampilkan kata sandi siapa
 * pun.
 */
export interface AkunBaru {
  readonly user: User;
  readonly undangan: Undangan;
}

// ---------------------------------------------------------------------------
// Gateway per modul
// ---------------------------------------------------------------------------

export interface AuthGateway {
  login(command: LoginCommand): Promise<User>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  /**
   * Rincian undangan dari kode — untuk halaman aktivasi publik. Undangan yang
   * sudah dipakai/kedaluwarsa tetap dikembalikan agar halaman dapat menjelaskan
   * alasannya; null bila kode tidak dikenal.
   */
  getUndangan(kode: string): Promise<Undangan | null>;
  /** Aktivasi akun; sekaligus membuka sesi sehingga dapat lanjut ke enrollment. */
  aktifkan(kode: string, command: ActivateAccountCommand): Promise<User>;
}

/**
 * Data milik pemilik akun sendiri. Dipisahkan dari AuthGateway karena bukan
 * urusan masuk/keluar sesi, dan dari AdminGateway karena tidak menyentuh akun
 * siapa pun selain pemanggilnya.
 */
export interface ProfilGateway {
  /** Perbarui telepon & alamat sendiri; mengembalikan pengguna yang tersimpan. */
  perbaruiKontak(command: UpdateContactCommand): Promise<User>;
  /** Ganti kata sandi sendiri — sandi lama wajib benar. */
  ubahSandi(command: ChangePasswordCommand): Promise<void>;
}

export interface AttendanceGateway {
  /** Status presensi hari ini untuk pengguna. */
  getTodayStatus(userId: string): Promise<TodayStatus>;
  /** Riwayat presensi pengguna (paginasi sederhana). */
  listMine(filters?: AttendanceFilters): Promise<Attendance[]>;
  /** Konfigurasi aktif: lokasi kantor & jadwal. */
  getActiveConfig(): Promise<{ office: OfficeLocation; schedule: WorkSchedule; maxAccuracyMeters: number }>;
  submitPresensi(command: SubmitPresensiCommand): Promise<PresensiResult>;
}

/**
 * Kalender hari libur desa. Terpisah dari AdminGateway karena membacanya bukan
 * urusan administrasi: setiap perangkat berhak tahu hari mana yang diliburkan —
 * kalender ini yang menjelaskan mengapa sebuah tanggal tidak menuntut presensi.
 */
export interface LiburGateway {
  /** Hari libur satu tahun (ISO), terurut; tanpa argumen = tahun berjalan. */
  tahun(tahun?: number): Promise<HariLibur[]>;
  /** Tambah/ubah satu tanggal — hanya pengelola akun (sekretaris/kepala desa). */
  simpan(command: SimpanLiburCommand): Promise<HariLibur>;
  /** Buang satu tanggal (mis. cuti bersama yang dicabut). */
  hapus(tanggal: string): Promise<void>;
  /** Tarik kalender resmi satu tahun dari sumber yang diset di server. */
  impor(tahun: number): Promise<HasilImporLibur>;
}

export interface EnrollmentGateway {
  getMine(userId: string): Promise<FaceEnrollment | null>;
  /** Periksa foto dengan layanan wajah tanpa menyimpan atau mengajukannya. */
  validatePhoto(image: string): Promise<void>;
  submit(userId: string, command: SubmitEnrollmentCommand): Promise<FaceEnrollment>;
}

export interface RequestGateway {
  listMine(userId: string): Promise<WorkRequest[]>;
  create(userId: string, userName: string, command: CreateRequestCommand): Promise<WorkRequest>;
  cancel(requestId: string): Promise<WorkRequest>;
}

/** Operasi khusus peran administrasi (sekretaris desa dan kepala desa). */
export interface AdminGateway {
  listPendingEnrollments(): Promise<FaceEnrollment[]>;
  reviewEnrollment(
    enrollmentId: string,
    approve: boolean,
    note?: string,
  ): Promise<FaceEnrollment>;
  listAllUsers(): Promise<User[]>;
  /** Buat akun perangkat desa + terbitkan kode undangan sekali pakai. */
  createUser(command: CreateUserCommand): Promise<AkunBaru>;
  /** Riwayat kode undangan (terbaru lebih dulu), termasuk yang sudah dipakai. */
  listUndangan(): Promise<Undangan[]>;
  /** Nonaktifkan/aktifkan akun. Kode undangan yang belum dipakai ikut gugur. */
  setAccountStatus(userId: string, status: AccountStatus): Promise<User>;
  /**
   * Reset kata sandi: kata sandi lama dihapus dan kode undangan baru diterbitkan
   * — pengelola akun menyerahkan kode itu kepada yang bersangkutan, bukan sandi
   * baru.
   */
  resetPassword(userId: string): Promise<AkunBaru>;
  listAllRequests(status?: RequestStatus): Promise<WorkRequest[]>;
  decideRequest(command: DecideCommand): Promise<WorkRequest>;
  /**
   * Pengajuan massal (mis. cuti bersama): satu kiriman untuk banyak perangkat.
   * Paralel `POST /admin/pengajuan/massal` backend — satu batch, dibayar lunas
   * (semua baris tersimpan atau tidak sama sekali).
   */
  kirimMassal(command: CreateMassalCommand): Promise<HasilMassal>;
  listAttendance(filters?: { date?: string }): Promise<AttendanceListItem[]>;
  listAuditLogs(): Promise<AuditLog[]>;
  /** Rekap bulanan: [perangkat, jumlah hadir, terlambat]. */
  getMonthlyRecap(year: number, month: number): Promise<MonthlyRecapRow[]>;
  /**
   * Tetapkan jam kerja kantor (jam masuk, batas masuk, jam pulang, batas pulang,
   * hari kerja). Berlaku untuk semua perangkat dan langsung dipakai presensi
   * berikutnya — inilah pengganti penetapan jam di dalam kode.
   */
  updateSchedule(command: UpdateScheduleCommand): Promise<WorkSchedule>;
  /** Tetapkan titik & radius geofence kantor (admin). */
  updateOffice(command: UpdateOfficeCommand): Promise<OfficeLocation>;
  /** Daftar jadwal khusus (mis. Ramadan/shift) */
  listJadwalKhusus(): Promise<JadwalKhusus[]>;
  /** Tambah jadwal khusus baru */
  createJadwalKhusus(command: CreateJadwalKhususCommand): Promise<JadwalKhusus>;
  /** Hapus jadwal khusus */
  deleteJadwalKhusus(id: string): Promise<void>;
  /** Jumlah pengajuan berstatus MENUNGGU — untuk lencana notifikasi. */
  jumlahPengajuanMenunggu(): Promise<number>;
}

export interface MonthlyRecapRow {
  readonly userId: string;
  readonly userName: string;
  readonly employeeId: string;
  readonly position: string;
  readonly hadir: number;
  readonly terlambat: number;
  readonly izin: number;
  readonly sakit: number;
  readonly cuti: number;
  /** Hari kerja yang tutup buku tanpa presensi masuk & tanpa izin/sakit/cuti. */
  readonly tanpaKeterangan: number;
  /** Total menit keterlambatan bulan itu — "lambat berapa menit/jam". */
  readonly terlambatMenit: number;
  /** Total menit pulang lebih awal dari jam pulang — "cepat berapa menit/jam". */
  readonly pulangCepatMenit: number;
}

// ---------------------------------------------------------------------------
// Kumpulan port root aplikasi
// ---------------------------------------------------------------------------

export interface AppGateways {
  readonly auth: AuthGateway;
  readonly profil: ProfilGateway;
  readonly attendance: AttendanceGateway;
  readonly enrollment: EnrollmentGateway;
  readonly request: RequestGateway;
  readonly admin: AdminGateway;
  readonly libur: LiburGateway;
}

export type { Role, User, Attendance, AttendanceFilters, AttendanceListItem, AttendanceMode, AttendanceStatus, AttendanceType, OfficeLocation, WorkSchedule, TodayStatus, VerificationMeta, FaceEnrollment, EnrollmentPhoto, ENROLLMENT_MIN_PHOTOS, WorkRequest, RequestStatus, RequestType, AuditLog, AccountStatus, Undangan, HariLibur, JenisLibur, JadwalKhusus, CreateJadwalKhususCommand };
