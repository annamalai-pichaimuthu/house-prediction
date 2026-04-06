import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/shared/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HousingAI Portal",
  description: "Housing price prediction and market analysis portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Skip-to-content link — visible on focus for keyboard/screen-reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100]
                     focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm
                     focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-blue-500"
        >
          Skip to main content
        </a>
        <Navbar />
        <main id="main-content" className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
