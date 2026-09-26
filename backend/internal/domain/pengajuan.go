package domain

import "time"

// ---------------------------------------------------------------------
// Pengajuan (WFH, izin, sakit, cuti, dinas luar, koreksi presensi) & audit
// ---------------------------------------------------------------------

type RequestType string

const (
	ReqWFH           RequestType = "WFH"
	ReqIzin          RequestType = "IZIN"
	ReqSakit         RequestType = "SAKIT"
	ReqCuti          RequestType = "CUTI"
	ReqDinasLuar     RequestType = "DINAS_LUAR"
	ReqKoreksiPresen RequestType = "KOREKSI_PRESENSI"
)

func (t RequestType) Sah() bool {
	switch t {
	case ReqWFH, ReqIzin, ReqSakit, ReqCuti, ReqDinasLuar, ReqKoreksiPresen:
		return true
	}
	return false
}

// MenutupKehadiran: pengajuan yang menjelaskan ketidakhadiran, sehingga hari
// kerja yang dicakupnya tidak dihitung "tanpa keterangan" dan tidak menuntut
// presensi.
//
// WFH dan dinas luar TIDAK termasuk: keduanya tetap wajib presensi (dengan mode
// WFH/DINAS_LUAR) — sama dengan aturan ringkasan monitoring harian, yang juga
// menghitung keduanya terpisah dari izin. KOREKSI_PRESENSI juga bukan penutup:
// ia memperbaiki transaksi, bukan menghapus kewajiban presensi.
func (t RequestType) MenutupKehadiran() bool {
	switch t {
	case ReqIzin, ReqSakit, ReqCuti:
		return true
	}
	return false
}

// ModeTerbuka: mode presensi yang diakui pengajuan yang TIDAK menutup kehadiran.
//
// WFH dan dinas luar tetap wajib presensi, hanya saja tanpa syarat radius
// kantor — karena itu keduanya memetakan ke satu mode presensi. Izin/sakit/cuti
// sudah menutup hari (tidak ada presensi yang perlu dimodekan), dan koreksi
// presensi memperbaiki transaksi, bukan memindahkan lokasi kerja.
//
// Fungsi ini dipakai dua arah: server menyarankan mode pada status harian, dan
// server memverifikasi mode yang dikirim klien — tanpa pengajuan yang cocok,
// menulis mode WFH/DINAS_LUAR tidak boleh meloloskan syarat geofence.
func (t RequestType) ModeTerbuka() (AttendanceMode, bool) {
	switch t {
	case ReqWFH:
		return ModeWFH, true
	case ReqDinasLuar:
		return ModeDinasLuar, true
	}
	return "", false
}

type RequestStatus string

const (
	ReqMenunggu  RequestStatus = "MENUNGGU"
	ReqDisetujui RequestStatus = "DISETUJUI"
	ReqDitolak   RequestStatus = "DITOLAK"
	ReqDibatal   RequestStatus = "DIBATALKAN"
)

func (s RequestStatus) Sah() bool {
	switch s {
	case ReqMenunggu, ReqDisetujui, ReqDitolak, ReqDibatal:
		return true
	}
	return false
}

type WorkRequest struct {
	ID            string        `json:"id"`
	Type          RequestType   `json:"type"`
	UserID        string        `json:"userId"`
	UserName      string        `json:"userName"`
	StartDate     string        `json:"startDate"`
	EndDate       string        `json:"endDate"`
	Reason        string        `json:"reason"`
	Status        RequestStatus `json:"status"`
	CreatedAt     string        `json:"createdAt"`
	DecidedAt     *string       `json:"decidedAt,omitempty"`
	DecidedByName *string       `json:"decidedByName,omitempty"`
	DecisionNote  *string       `json:"decisionNote,omitempty"`
	// BatchID: penanda pengajuan massal (satu keputusan pengelola akun untuk
	// banyak perangkat sekaligus, mis. cuti bersama). Kosong = pengajuan tunggal.
	BatchID string `json:"batchId,omitempty"`
}

// HariTercakup: tanggal-tanggal (ISO, WITA) yang dicakup pengajuan, inklusif.
// Rentang yang tidak dapat dibaca atau terbalik menghasilkan daftar kosong —
// lebih aman daripada menuduh seseorang tidak hadir karena data rusak.
func (r WorkRequest) HariTercakup() []string {
	mulai, errMulai := time.ParseInLocation("2006-01-02", r.StartDate, WITA)
	selesai, errSelesai := time.ParseInLocation("2006-01-02", r.EndDate, WITA)
	if errMulai != nil || errSelesai != nil || selesai.Before(mulai) {
		return []string{}
	}
	hasil := []string{}
	for d := mulai; !d.After(selesai); d = d.AddDate(0, 0, 1) {
		hasil = append(hasil, TanggalISO(d))
	}
	return hasil
}

type AuditLog struct {
	ID         string `json:"id"`
	At         string `json:"at"`
	ActorID    string `json:"actorId"`
	ActorName  string `json:"actorName"`
	Action     string `json:"action"`
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
	Detail     string `json:"detail"`
}

func AuditBaru(aktor *User, aksi, sasaranJenis, sasaranID, detail string, now time.Time) AuditLog {
	return AuditLog{
		ID:         IDBaru("aud"),
		At:         WaktuISO(now),
		ActorID:    aktor.ID,
		ActorName:  aktor.FullName,
		Action:     aksi,
		TargetType: sasaranJenis,
		TargetID:   sasaranID,
		Detail:     detail,
	}
}
