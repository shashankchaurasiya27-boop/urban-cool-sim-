import "@/styles/globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata = {
  title: "UrbanCoolSim — AI Urban Heat Intelligence & Decision Twin",
  description: "Physics-informed surface energy balance digital twin, LightGBM surrogate acceleration, and NSGA-II multi-objective decision support platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('urbancoolsim_theme');
                if (savedTheme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-surface-base text-ink-primary antialiased overflow-x-hidden transition-colors duration-150">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}

