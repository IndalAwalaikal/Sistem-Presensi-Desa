package usecase_test

import (
	"context"
	"testing"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
	"presensi-anabanua/backend/internal/usecase"
)

// konfigStub: KonfigRepo dalam memori — jadwal yang disimpan dikembalikan apa
// adanya sehingga uji menilai hasil penerapan, bukan efek samping basis data.
type konfigStub struct{ jadwal domain.WorkSchedule }

func (s *konfigStub) Ambil(context.Context) (*domain.KonfigurasiAktif, error) {
	k := domain.KonfigurasiAktif{
		Office:            domain.OfficeLocation{ID: "ofc-1", Name: "Kantor Desa", RadiusMeters: 100},
		Schedule:          s.jadwal,
		MaxAccuracyMeters: 50,
	}
	return &k, nil
}

func (s *konfigStub) SimpanJadwal(_ context.Context, j *domain.WorkSchedule) error {
	s.jadwal = *j
	return nil
}

func (s *konfigStub) SimpanKantor(context.Context, *domain.OfficeLocation) error { return nil }

type auditStub struct{}

func (auditStub) Create(context.Context, domain.AuditLog) error   { return nil }
func (auditStub) List(context.Context) ([]domain.AuditLog, error) { return nil, nil }

var (
	_ port.KonfigRepo = (*konfigStub)(nil)
	_ port.AuditRepo  = auditStub{}
)

// Jadwal kerja adalah satu-satunya ambang penilaian kedisiplinan seluruh
// perangkat: rentang jam yang silang/paradoks (mis. batas masuk 16:00 sedangkan
// jam pulang 08:00) harus ditolak sebelum tersimpan — kalau tidak, perhitungan
// terlambat dan pulang cepat menghasilkan selisih negatif yang tak berarti.
func TestSimpanJadwalMenolakRentangSilang(t *testing.T) {
	sekretaris := &domain.User{ID: "usr-2", FullName: "Rahmat", Role: domain.SekretarisDesa}

	kasus := []struct {
		nama  string
		cmd   usecase.CmdJadwal
		ingin string // pesan galat yang diharapkan; "" = jadwal sah
	}{
		{
			nama: "jadwal wajar diterima",
			cmd: usecase.CmdJadwal{
				CheckInStart: "07:30", CheckInDeadline: "08:00",
				CheckOutStart: "16:00", CheckOutEnd: "17:00", WorkDays: []int{1, 2, 3, 4, 5, 6},
			},
		},
		{
			nama: "batas masuk setelah jam pulang ditolak",
			cmd: usecase.CmdJadwal{
				CheckInStart: "07:30", CheckInDeadline: "16:30",
				CheckOutStart: "08:00", CheckOutEnd: "17:00", WorkDays: []int{1, 2, 3, 4, 5, 6},
			},
			ingin: "Batas masuk harus sebelum jam pulang.",
		},
		{
			nama: "batas pulang sama dengan jam pulang ditolak",
			cmd: usecase.CmdJadwal{
				CheckInStart: "07:30", CheckInDeadline: "08:00",
				CheckOutStart: "16:00", CheckOutEnd: "16:00", WorkDays: []int{1, 2, 3, 4, 5, 6},
			},
			ingin: "Batas pulang harus setelah jam pulang.",
		},
		{
			nama: "jam masuk melewati batas masuk ditolak",
			cmd: usecase.CmdJadwal{
				CheckInStart: "08:30", CheckInDeadline: "08:00",
				CheckOutStart: "16:00", CheckOutEnd: "17:00", WorkDays: []int{1, 2, 3, 4, 5, 6},
			},
			ingin: "Jam masuk tidak boleh melewati batas masuk.",
		},
		{
			nama: "tanpa hari kerja ditolak",
			cmd: usecase.CmdJadwal{
				CheckInStart: "07:30", CheckInDeadline: "08:00",
				CheckOutStart: "16:00", CheckOutEnd: "17:00", WorkDays: nil,
			},
			ingin: "Pilih minimal satu hari kerja.",
		},
	}

	for _, k := range kasus {
		t.Run(k.nama, func(t *testing.T) {
			repo := &konfigStub{}
			uc := usecase.KonfigurasiBaru(repo, auditStub{}, nil)

			hasil, err := uc.SimpanJadwal(context.Background(), sekretaris, k.cmd)
			if k.ingin == "" {
				if err != nil {
					t.Fatalf("jadwal wajar ditolak: %v", err)
				}
				if hasil.CheckInDeadline != k.cmd.CheckInDeadline || repo.jadwal.CheckOutStart != k.cmd.CheckOutStart {
					t.Fatalf("jadwal tersimpan tidak sama dengan yang dikirim: %+v", hasil)
				}
				return
			}
			if err == nil {
				t.Fatalf("jadwal %q seharusnya ditolak", k.nama)
			}
			if err.Error() != k.ingin {
				t.Fatalf("pesan galat %q, ingin %q", err.Error(), k.ingin)
			}
			if repo.jadwal.CheckInStart != "" {
				t.Fatalf("jadwal tidak sah tidak boleh tersimpan: %+v", repo.jadwal)
			}
		})
	}
}

// Hanya sekretaris/kepala desa yang boleh menetapkan jam kerja.
func TestSimpanJadwalMenolakBukanPengelolaAkun(t *testing.T) {
	uc := usecase.KonfigurasiBaru(&konfigStub{}, auditStub{}, nil)
	perangkat := &domain.User{ID: "usr-1", FullName: "Ahmad", Role: domain.PerangkatDesa}
	_, err := uc.SimpanJadwal(context.Background(), perangkat, usecase.CmdJadwal{
		CheckInStart: "07:30", CheckInDeadline: "08:00",
		CheckOutStart: "16:00", CheckOutEnd: "17:00", WorkDays: []int{1, 2, 3, 4, 5, 6},
	})
	if err == nil {
		t.Fatal("perangkat desa tidak boleh mengubah jam kerja")
	}
	if _, ok := err.(*domain.GalatKewenangan); !ok {
		t.Fatalf("galat seharusnya GalatKewenangan (403), dapat %T: %v", err, err)
	}
}
