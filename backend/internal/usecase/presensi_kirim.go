package usecase

import (
	"context"

	"presensi-anabanua/backend/internal/domain"
)

// Kirim: jalankan seluruh verifikasi lalu simpan bila diterima. Urutan tolak
// sama dengan aturan frontend: biometrik → urutan → wajah → liveness →
// geofence → jadwal; sumber waktu selalu server.
func (uc *PresensiUsecase) Kirim(ctx context.Context, userID string, cmd KirimPresensi) (*HasilPresensi, error) {
	if !cmd.Type.Sah() {
		return nil, galatValidasi("Jenis presensi tidak dikenal.")
	}
	if !cmd.Mode.Sah() {
		return nil, galatValidasi("Mode presensi tidak dikenal.")
	}

	u, err := uc.users.ByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !domain.BolehPresensi(u.BiometricStatus) {
		return ditolak("BIOMETRIC_INACTIVE",
			"Biometrik belum aktif. Selesaikan verifikasi pendaftaran wajah terlebih dahulu."), nil
	}

	now := uc.sekarang()
	tanggal := domain.TanggalISO(now)
	sudah, err := uc.presensi.SudahPresensi(ctx, userID, tanggal)
	if err != nil {
		return nil, err
	}
	for _, t := range sudah {
		if t == cmd.Type {
			pesan := "Presensi pulang hari ini sudah tercatat."
			if cmd.Type == domain.CheckIn {
				pesan = "Presensi datang hari ini sudah tercatat. Yang tersisa adalah presensi pulang."
			}
			return ditolak("SUDAH_PRESENSI", pesan), nil
		}
	}
	if cmd.Type == domain.CheckOut && !ada(sudah, domain.CheckIn) {
		return ditolak("BELUM_PRESENSI_MASUK",
			"Belum ada presensi datang hari ini. Lakukan presensi datang terlebih dahulu."), nil
	}

	cfg, err := uc.Konfigurasi(ctx)
	if err != nil {
		return nil, err
	}

	skorWajah, cocokWajah, skorHidup, hidup := uc.nilaiBiometrik(ctx, userID, cmd)
	if !cocokWajah {
		return ditolak("FACE_FAILED",
			"Wajah tidak sesuai atau kurang jelas. Ulangi dengan pencahayaan yang baik."), nil
	}
	if !hidup {
		return ditolak("LIVENESS_FAILED",
			"Deteksi keaslian gagal. Pastikan Anda berada di depan kamera, bukan foto atau video."), nil
	}

	// Mode WFH/dinas luar datang dari klien, jadi harus dibuktikan dengan
	// pengajuan yang disetujui dan mencakup hari ini; kalau tidak, siapa pun
	// dapat lolos radius kantor hanya dengan menulis mode WFH. Bila pengajuan
	// itu ada, syarat lokasi memang tidak berlaku: radius kantor maupun ambang
	// akurasi tidak menolak presensi — jarak & akurasi yang terukur tetap
	// dicatat apa adanya sebagai bahan audit.
	bebasGeofence, err := uc.modeTerbukaHariIni(ctx, userID, tanggal, cmd.Mode)
	if err != nil {
		return nil, err
	}
	if cmd.Mode.WajibPengajuan() && !bebasGeofence {
		return ditolak("MODE_TIDAK_DISETUJUI",
			"Mode "+string(cmd.Mode)+" hanya berlaku bagi pengajuan yang disetujui hari ini. Pilih mode WFO atau ajukan pengajuan terlebih dahulu."), nil
	}

	geofence := domain.EvaluateGeofence(cmd.Location, cmd.AccuracyMeters, cfg.Office, float64(cfg.MaxAccuracyMeters))
	if bebasGeofence {
		// Vonis menjawab "apakah syarat lokasi terpenuhi"; pada mode WFH/dinas
		// luar syarat itu memang tidak ada, sehingga INSIDE-lah jawaban yang
		// jujur. Jarak & akurasi tetap tersimpan apa adanya.
		geofence.Verdict = domain.Inside
	}
	switch geofence.Verdict {
	case domain.Inaccurate:
		return ditolak("GPS_INACCURATE",
			"Sinyal GPS tidak stabil (akurasi melewati batas). Cari tempat dengan sinyal lebih baik, lalu ulangi."), nil
	case domain.Outside:
		return ditolak("OUTSIDE_GEOFENCE",
			"Anda di luar area kerja. Pindah ke dalam radius kantor."), nil
	}

	hasil := domain.EvaluateCheckIn(cfg.Schedule, now)
	if cmd.Type == domain.CheckOut {
		hasil = domain.EvaluateCheckOut(cfg.Schedule, now)
	}

	verifikasi := domain.VerificationMeta{
		FaceMatch:     cocokWajah,
		FaceScore:     bulatkan(skorWajah),
		Liveness:      hidup,
		LivenessScore: bulatkan(skorHidup),
		Geofence:      geofence,
		ServerTime:    domain.WaktuISO(now),
	}
	sel := 0
	if hasil.Status == domain.Terlambat || hasil.Status == domain.PulangCepat || hasil.Status == domain.LebihKerja {
		sel = hasil.DeltaMenit
	}
	att := &domain.Attendance{
		ID:           domain.IDBaru("att"),
		UserID:       u.ID,
		UserName:     u.FullName,
		Type:         cmd.Type,
		Mode:         cmd.Mode,
		Status:       hasil.Status,
		SelisihMenit: sel,
		Office:       domain.OfficeRef{ID: cfg.Office.ID, Name: cfg.Office.Name},
		Verification: verifikasi,
	}
	if err := uc.presensi.Create(ctx, att); err != nil {
		return nil, err
	}
	// Kabar kedisiplinan: hanya setelah catatan presensi benar-benar tersimpan,
	// sehingga kanal luar tidak pernah mendahului data. Bila DisiplinUsecase
	// tidak dipasang (atau webhook belum diset), panggilan ini tidak berbuat apa-apa.
	if uc.disiplin != nil {
		uc.disiplin.LaporPresensi(ctx, *att)
	}
	return &HasilPresensi{Accepted: true, Attendance: att, Verification: &verifikasi}, nil
}

// modeTerbukaHariIni: benar bila pengajuan WFH/dinas luar yang disetujui
// mencakup `tanggal` untuk pengguna ini **dengan mode yang diminta**. Inilah
// yang membuat mode kiriman klien tidak dapat dipakai untuk menghindari
// geofence tanpa dasar: mode WFO selalu dilayani seperti biasa, sedangkan
// WFH/DINAS_LUAR harus punya pengajuannya.
func (uc *PresensiUsecase) modeTerbukaHariIni(ctx context.Context, userID, tanggal string, mode domain.AttendanceMode) (bool, error) {
	if !mode.WajibPengajuan() {
		return false, nil
	}
	daftar, err := uc.pengajuan.DisetujuiMenggulung(ctx, tanggal)
	if err != nil {
		return false, err
	}
	for _, r := range daftar {
		if r.UserID != userID {
			continue
		}
		if sah, ok := r.Type.ModeTerbuka(); ok && sah == mode {
			return true, nil
		}
	}
	return false, nil
}

// nilaiBiometrik menentukan skor resmi: bila layanan AI aktif dan frame
// dikirim, skor dari AI terhadap embedding enrollment yang berwenang;
// skor klien hanya dipakai pada mode demo (AI tidak diset) — ditegaskan
// pada dokumentasi bahwa produksi wajib memakai AI + frame.
func (uc *PresensiUsecase) nilaiBiometrik(ctx context.Context, userID string, cmd KirimPresensi) (skorWajah float64, cocok bool, skorHidup float64, hidup bool) {
	skorWajah, cocok = cmd.FaceScore, cmd.FaceScore >= uc.ambangWajah
	skorHidup, hidup = cmd.LivenessScore, cmd.LivenessScore >= uc.ambangLiveness

	if !uc.aiAktif {
		return
	}
	// Jangan pernah menerima skor wajah/liveness dari browser saat AI aktif.
	// Frame wajib diverifikasi oleh layanan server agar klien tidak dapat
	// melewati pemeriksaan dengan mengirim skor buatan.
	if cmd.FrameDataUrl == "" {
		return 0, false, 0, false
	}

	referensi, err := uc.enroll.Embedding(ctx, userID)
	if err != nil || len(referensi) == 0 {
		// Tidak ada referensi — verifikasi tidak dapat dilakukan: gagal.
		return 0, false, 0, false
	}
	skorAI, liveAI, err := uc.wajah.Verify(ctx, cmd.FrameDataUrl, referensi)
	if err != nil {
		return 0, false, 0, false
	}
	skorWajah = skorAI
	cocok = skorAI >= uc.ambangWajah
	// Bila AI aktif dan frame dievaluasi, skor liveness dihitung oleh server
	// (tekstur Laplacian/distribusi warna citra nyata), bukan mengandalkan kiriman klien.
	skorHidup = liveAI
	hidup = liveAI >= uc.ambangLiveness
	return skorWajah, cocok, skorHidup, hidup
}
