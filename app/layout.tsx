import type { Metadata } from "next";
import "./globals.css";
import HeaderGlobal from "@/components/HeaderGlobal";
import UrbiWrapper from "@/components/urbi/UrbiWrapper";

export const metadata: Metadata = {
  title: "URBIS",
  description: "Sistema de análise e gestão urbanística",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{
        margin: 0,
        backgroundColor: "#0b0f14",
        color: "#e6edf3",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}>
        <HeaderGlobal />
        {children}
        <UrbiWrapper />
      </body>
    </html>
  );
}
