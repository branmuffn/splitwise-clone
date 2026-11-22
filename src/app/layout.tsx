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
  // The page shrinks when the phone keyboard opens, so a focused box is never hidden behind it (Brian, 2026-11-22).
  interactiveWidget: "resizes-content",
  // Phone status bar matches the header (darker green in dark mode, see globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f8f74" },
    { color: "#1cc29f" },
  ],
};

// Profile > Appearance stores Light or Dark in a `theme` cookie (Auto = no cookie, follow the device). Applying it here,
// before the first paint, avoids a flash of the wrong colors. Reading it on the server would make every page dynamic.
const themeScript = `try{var m=document.cookie.match(/(?:^|; )theme=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script may add data-theme before React hydrates.
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
