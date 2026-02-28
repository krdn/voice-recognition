import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Recognition",
  description: "AI 음성 인식 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
