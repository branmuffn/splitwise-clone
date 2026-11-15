import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Link previews (Brian, 2026-11-15): title, description and the card from app/opengraph-image.tsx.
const description = "Split costs with friends. Start with just your name, invite friends with a link, or try the demo. Free.";
export const metadata: Metadata = {
  metadataBase: new URL("https://split-tea.vercel.app"),
  title: "Splitwise clone",
  description,
  openGraph: { title: "Splitwise clone", description, siteName: "Splitwise clone", type: "website" },
  twitter: { card: "summary_large_image", title: "Splitwise clone", description },
};

export const viewport: Viewport = {
  themeColor: "#1cc29f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
