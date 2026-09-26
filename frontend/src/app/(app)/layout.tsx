import { AppShell } from "@/components/layout/app-shell";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
