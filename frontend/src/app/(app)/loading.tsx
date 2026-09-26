/**
 * Rangka muat: deretan slip kosong dengan kilau memudar dari kiri ke kanan,
 * supaya tata letak tidak "melompat" saat isi asli muncul.
 */
export default function Memuat() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="garis-foil h-[3px] w-9 rounded-full opacity-40" />
        <div className="h-8 w-56 animate-pulse rounded-kendali bg-meja-2" />
        <div className="h-3.5 w-72 animate-pulse rounded-kendali bg-meja" />
      </div>
      <div className="min-h-[10rem] animate-pulse rounded-lembar bg-meja-2" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[5.5rem] animate-pulse rounded-slip bg-meja-2" />
        ))}
      </div>
    </div>
  );
}
