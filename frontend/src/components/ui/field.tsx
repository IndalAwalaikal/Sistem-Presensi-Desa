"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

/** Label + kontrol form dengan pesan bantuan. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="label-arsip mb-1.5 block text-tinta-2">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-[12.5px] font-medium leading-snug text-tinta-2">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/**
 * Bidang isian — kertas yang agak tertekan ke dalam meja (bayangan dalam),
 * sehingga terasa sebagai tempat menulis, bukan persegi rata.
 */
const BIDANG_ISI =
  "w-full rounded-kendali border border-garis bg-folio px-3 text-[15px] text-tinta shadow-turun " +
  "placeholder:text-tinta/30 hover:border-tinta/25 " +
  "focus:border-primer focus:bg-putih focus:outline-none focus:ring-2 focus:ring-primer/20";

/** Elemen input teks. Mendukung tombol buka/tutup jika type="password". */
export function Input({
  className,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [bukaSandi, setBukaSandi] = useState(false);

  if (type === "password") {
    return (
      <div className="relative w-full">
        <input
          {...props}
          type={bukaSandi ? "text" : "password"}
          className={cn(BIDANG_ISI, "h-11 pr-11", className)}
        />
        <button
          type="button"
          onClick={() => setBukaSandi((b) => !b)}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-tinta/45 hover:text-tinta hover:bg-folio-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primer/30 transition-colors"
          title={bukaSandi ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          aria-label={bukaSandi ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        >
          {bukaSandi ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }

  return <input {...props} type={type} className={cn(BIDANG_ISI, "h-11", className)} />;
}

/** Input khusus kata sandi dengan kontrol buka/tutup (show/hide). */
export function InputPassword(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} type="password" />;
}

/** Area teks multi-baris. */
export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(BIDANG_ISI, "py-2.5 leading-6", className)}
    />
  );
}

/**
 * Dropdown pilihan. Chevron digambar lewat latar CSS (.bidang-pilih) supaya
 * Select tetap satu elemen — tidak perlu lapisan pembungkus yang membuat lebar
 * select menyimpang dari bidang isian lain.
 */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(BIDANG_ISI, "bidang-pilih h-11 appearance-none pr-9", className)}
    >
      {children}
    </select>
  );
}

