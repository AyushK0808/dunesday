import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Unbounded } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Dunesday", template: "%s | Dunesday" },
  description: "Showtime tracker for Avengers: Doomsday and Dune: Part Three in Hyderabad.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#16131d", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${unbounded.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}
