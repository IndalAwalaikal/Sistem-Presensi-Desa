package domain

import "time"

type AttendanceType string

const (
	CheckIn  AttendanceType = "CHECK_IN"
	CheckOut AttendanceType = "CHECK_OUT"
)

func (t AttendanceType) Sah() bool { return t == CheckIn || t == CheckOut }

type AttendanceMode string

const (
	ModeWFO       AttendanceMode = "WFO"
	ModeWFH       AttendanceMode = "WFH"
	ModeDinasLuar AttendanceMode = "DINAS_LUAR"
)

func (m AttendanceMode) Sah() bool {
	return m == ModeWFO || m == ModeWFH || m == ModeDinasLuar
}

// WajibPengajuan: mode yang hanya sah bila ada pengajuan disetujui yang
// mencakup hari itu. Modenya datang dari klien, jadi tanpa pengecekan ini
// siapa pun dapat lolos radius kantor hanya dengan mengirim mode WFH.
func (m AttendanceMode) WajibPengajuan() bool {
	return m == ModeWFH || m == ModeDinasLuar
}

type AttendanceStatus string

const (
	TepatWaktu  AttendanceStatus = "TEPAT_WAKTU"
	Terlambat   AttendanceStatus = "TERLAMBAT"
	PulangCepat AttendanceStatus = "PULANG_CEPAT"
	LebihKerja  AttendanceStatus = "LEBIH_KERJA"
)

type GeofenceVerdict string

const (
	Inside     GeofenceVerdict = "INSIDE"
	Outside    GeofenceVerdict = "OUTSIDE"
	Inaccurate GeofenceVerdict = "INACCURATE"
)

type GeofenceCheck struct {
	Verdict        GeofenceVerdict `json:"verdict"`
	DistanceMeters float64         `json:"distanceMeters"`
	AccuracyMeters float64         `json:"accuracyMeters"`
}

// VerificationMeta: hasil verifikasi berlapis yang disimpan bersama transaksi.
type VerificationMeta struct {
	FaceMatch bool `json:"faceMatch"`
	// FaceScore cosine mentah dari model (-1..1), bukan persentase/probabilitas.
	FaceScore     float64       `json:"faceScore"`
	Liveness      bool          `json:"liveness"`
	LivenessScore float64       `json:"livenessScore"`
	Geofence      GeofenceCheck `json:"geofence"`
	ServerTime    string        `json:"serverTime"`
}

type OfficeRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Attendance struct {
	ID       string           `json:"id"`
	UserID   string           `json:"userId"`
	UserName string           `json:"userName"`
	Type     AttendanceType   `json:"type"`
	Mode     AttendanceMode   `json:"mode"`
	Status   AttendanceStatus `json:"status"`
	// SelisihMenit: selisih menit thd ambang jadwal SAAT transaksi dicatat
	// (positif = setelah ambang, negatif = sebelum ambang, 0 = tepat).
	SelisihMenit int              `json:"selisihMenit"`
	Office       OfficeRef        `json:"office"`
	Verification VerificationMeta `json:"verification"`
}

// TodayStatus: status harian seorang pengguna (bentuk union ala frontend).
//
// Kind IZIN hanya untuk pengajuan yang MENUTUP kehadiran (izin/sakit/cuti).
// WFH dan dinas luar tidak memakai kind ini: harinya tetap menuntut presensi,
// jadi yang dikirim adalah BELUM_PRESENSI/SUDAH_CHECKIN/SELESAI beserta
// `modeSaran`. Sebelumnya setiap pengajuan disetujui — termasuk WFH — mengunci
// pintu presensi, sehingga perangkat yang WFH tidak pernah tercatat hadir dan
// divonis "tanpa keterangan" di akhir bulan.
type TodayStatus struct {
	Kind       string      `json:"kind"` // BELUM_PRESENSI|SUDAH_CHECKIN|SELESAI|IZIN
	Attendance *Attendance `json:"attendance,omitempty"`
	CheckIn    *Attendance `json:"checkIn,omitempty"`
	CheckOut   *Attendance `json:"checkOut,omitempty"`
	IzinLabel  *string     `json:"label,omitempty"`
	// ModeSaran: mode presensi yang diakui pengajuan hari ini (WFH/dinas luar).
	// Presensi TETAP dapat dilakukan — nilainya hanya memandu mode yang sah,
	// sekaligus menjadi penanda bagi layar bahwa radius kantor tidak mengikat.
	ModeSaran *AttendanceMode `json:"modeSaran,omitempty"`
	// Libur: hari libur hari ini, bila ada. Presensi tetap boleh dilakukan
	// (kerja di hari libur), tetapi tidak ada kewajiban presensi — keterangan
	// inilah yang ditampilkan layar supaya pengguna tahu harinya libur.
	Libur *HariLibur `json:"libur,omitempty"`
}

// ---------------------------------------------------------------------
// Aturan status terhadap jadwal — sumber kebenaran ada di sini (server),
// frontend hanya menampilkan.
// ---------------------------------------------------------------------

type EvaluasiJadwal struct {
	Status     AttendanceStatus
	DeltaMenit int
}

// EvaluateCheckIn: terlambat bila melewati batas masuk.
func EvaluateCheckIn(j WorkSchedule, serverTime time.Time) EvaluasiJadwal {
	now := jamMenitWITA(serverTime)
	deadline := MenitOf(j.CheckInDeadline)
	if now > deadline {
		return EvaluasiJadwal{Status: Terlambat, DeltaMenit: now - deadline}
	}
	return EvaluasiJadwal{Status: TepatWaktu, DeltaMenit: now - deadline}
}

// EvaluateCheckOut: pulang cepat / tepat / lebih kerja.
func EvaluateCheckOut(j WorkSchedule, serverTime time.Time) EvaluasiJadwal {
	now := jamMenitWITA(serverTime)
	outStart, outEnd := MenitOf(j.CheckOutStart), MenitOf(j.CheckOutEnd)
	switch {
	case now < outStart:
		return EvaluasiJadwal{Status: PulangCepat, DeltaMenit: now - outStart}
	case now > outEnd:
		return EvaluasiJadwal{Status: LebihKerja, DeltaMenit: now - outEnd}
	}
	return EvaluasiJadwal{Status: TepatWaktu, DeltaMenit: 0}
}

// IsWorkDay: hari kerja menurut jadwal.
func (j WorkSchedule) IsWorkDay(t time.Time) bool {
	h := int(t.In(WITA).Weekday())
	for _, d := range j.WorkDays {
		if d == h {
			return true
		}
	}
	return false
}

// AttendanceListItem: baris presensi untuk daftar/monitoring (dipakai
// pengelola akun pada GET /api/admin/presensi).
type AttendanceListItem struct {
	ID       string           `json:"id"`
	UserID   string           `json:"userId"`
	UserName string           `json:"userName"`
	Position string           `json:"position"`
	Type     AttendanceType   `json:"type"`
	Mode     AttendanceMode   `json:"mode"`
	Status   AttendanceStatus `json:"status"`
	At       string           `json:"at"`
	// SelisihMenit: selisih menit thd ambang jadwal SAAT transaksi dicatat —
	// monitoring memakainya supaya konsisten walau jadwal berubah tengah hari.
	SelisihMenit   int     `json:"selisihMenit"`
	DistanceMeters float64 `json:"distanceMeters"`
}
