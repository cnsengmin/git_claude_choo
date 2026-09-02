import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas KR",
  description: "Korea-focused urban statistics and POI atlas",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
