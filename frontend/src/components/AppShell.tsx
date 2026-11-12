"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  if (isLandingPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-obsidian-base text-obsidian-textPrimary antialiased selection:bg-botanical-light selection:text-black">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
