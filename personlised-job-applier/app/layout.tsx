import type { Metadata } from "next";

import "./globals.css";

import { fontGTPlanar, fontGTStandardMono, fontPlain } from "./fonts";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Personalised Job Applier",
  description:
    "Discover jobs, generate tailored application materials, and automate form fills with Stagehand and Browserbase.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={cn(
          fontPlain.variable,
          fontGTPlanar.variable,
          fontGTStandardMono.variable,
        )}
      >
        {children}
      </body>
    </html>
  );
}
