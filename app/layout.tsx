import type { Metadata } from "next";
import "./globals.css";
import HeaderGlobal from "@/components/HeaderGlobal";
import UrbiWrapper from "@/components/urbi/UrbiWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import SessionTracker from "@/components/SessionTracker";

export const metadata: Metadata = {
  title: "URBIS",
  description: "Sistema de análise e gestão urbanística",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('urbis-theme') || 'dark';
            if (t === 'dark') document.documentElement.classList.add('dark');
          } catch(e) {}
        `}} />
      </head>
      <body style={{ margin: 0 }}>
        <ThemeProvider>
          <HeaderGlobal />
          {children}
          <UrbiWrapper />
          <SessionTracker />
        </ThemeProvider>
      </body>
    </html>
  );
}