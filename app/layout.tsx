import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ConvexClientProvider } from "./providers";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Dental Task OS",
  description: "Simple task management for your practice, personal life, and family",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TaskOS",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0e0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-[family-name:var(--font-inter)] antialiased min-h-dvh">
        <ServiceWorkerRegistrar />
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
