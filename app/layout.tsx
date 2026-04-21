// C:\Users\Varun Shetty\Desktop\New folder\bludash\app\layout.tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-dm-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BLUDASH",
  description: "Analytics Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${dmSans.variable} ${dmSerif.variable}`}>
      <body className="m-0 p-0 w-full min-h-screen">{children}</body>
    </html>
  );
}