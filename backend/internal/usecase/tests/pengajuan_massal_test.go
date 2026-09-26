package usecase_test

import (
	"context"
	"testing"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/usecase"
)

// Pengajuan massal adalah wewenang pengelola akun: perangkat tidak boleh
// mengajukan cuti atas nama rekannya.
func TestPengajuanMassalHanyaPengelolaAkun(t *testing.T) {
	repo := &pengajuanStub{}
	uc := usecase.PengajuanBaru(repo, &userStub{daftar: perangkatUji()}, auditStub{})

	_, err := uc.KirimMassal(context.Background(),
		&domain.User{ID: "usr-1", FullName: "Budi", Role: domain.PerangkatDesa},
		usecase.CmdPengajuanMassal{
			Type: domain.ReqCuti, StartDate: tanggalUji, EndDate: tanggalUji,
			Reason: "Cuti bersama", UserIDs: []string{"usr-2"},
		})
	if err == nil {
		t.Fatal("perangkat desa tidak boleh mengirim pengajuan massal")
	}
	if len(repo.disimpan) != 0 {
		t.Fatalf("tidak ada yang boleh tersimpan: %+v", repo.disimpan)
	}
}

// Satu kiriman menjadi SATU batch: seluruh baris berbagi batchId yang sama
// sehingga dapat ditelusuri kembali sebagai satu keputusan.
func TestPengajuanMassalMenulisSatuBatch(t *testing.T) {
	repo := &pengajuanStub{}
	uc := usecase.PengajuanBaru(repo, &userStub{daftar: perangkatUji()}, auditStub{})

	hasil, err := uc.KirimMassal(context.Background(), adminUji(), usecase.CmdPengajuanMassal{
		Type: domain.ReqCuti, StartDate: tanggalUji, EndDate: tanggalUji,
		Reason: "Cuti bersama akhir tahun", UserIDs: []string{"usr-1", "usr-2", "usr-3"},
	})
	if err != nil {
		t.Fatalf("kirim massal: %v", err)
	}
	if hasil.Jumlah != 3 || len(repo.disimpan) != 3 {
		t.Fatalf("ingin tiga pengajuan tersimpan, dapat %d", len(repo.disimpan))
	}
	if hasil.BatchID == "" {
		t.Fatal("batch id harus terisi")
	}
	for _, r := range repo.disimpan {
		if r.BatchID != hasil.BatchID {
			t.Fatalf("batch id tidak seragam: %+v", r)
		}
		if r.Status != domain.ReqMenunggu || r.Type != domain.ReqCuti {
			t.Fatalf("pengajuan massal harus menunggu keputusan: %+v", r)
		}
	}
}

// Id yang tidak dikenal menggagalkan SELURUH kiriman — lebih baik pengelola akun
// memperbaiki daftarnya daripada sebagian perangkat diam-diam tidak tercatat.
func TestPengajuanMassalMenolakPerangkatTidakDikenal(t *testing.T) {
	repo := &pengajuanStub{}
	uc := usecase.PengajuanBaru(repo, &userStub{daftar: perangkatUji()}, auditStub{})

	_, err := uc.KirimMassal(context.Background(), adminUji(), usecase.CmdPengajuanMassal{
		Type: domain.ReqCuti, StartDate: tanggalUji, EndDate: tanggalUji,
		Reason: "Cuti bersama", UserIDs: []string{"usr-1", "usr-hantu"},
	})
	if err == nil {
		t.Fatal("id yang tidak dikenal harus ditolak")
	}
	if len(repo.disimpan) != 0 {
		t.Fatalf("tidak boleh ada baris tersimpan saat daftar tidak sah: %+v", repo.disimpan)
	}
}

// Id kembar tidak menghasilkan baris kembar untuk perangkat yang sama.
func TestPengajuanMassalMengabaikanIdKembar(t *testing.T) {
	repo := &pengajuanStub{}
	uc := usecase.PengajuanBaru(repo, &userStub{daftar: perangkatUji()}, auditStub{})

	hasil, err := uc.KirimMassal(context.Background(), adminUji(), usecase.CmdPengajuanMassal{
		Type: domain.ReqIzin, StartDate: tanggalUji, EndDate: tanggalUji,
		Reason: "Rapat desa", UserIDs: []string{"usr-2", "usr-2", " usr-2 "},
	})
	if err != nil {
		t.Fatalf("kirim massal: %v", err)
	}
	if hasil.Jumlah != 1 || len(repo.disimpan) != 1 {
		t.Fatalf("id kembar harus menyisakan satu baris, dapat %d", len(repo.disimpan))
	}
}
