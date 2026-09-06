import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Source_Sans_3 } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const sans = Source_Sans_3({
  variable: "--font-source",
  subsets: ["latin"],
});

const heading = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guardian — Multichain Scan",
  description:
    "Paste-first token scanner for Solana, Ethereum, Base, Arbitrum, Robinhood Chain, and XRPL. Grades and patterns, not verdicts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${heading.variable} ${mono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </TooltipProvider>
      </body>
    </html>
  );
}
