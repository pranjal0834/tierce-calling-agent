import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tierce Voice Agent",
  description: "Next-generation AI voice calling platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-neutral-50 text-neutral-900 min-h-screen`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Toaster position="top-right" toastOptions={{ style: { background: "#ffffff", color: "#111827", border: "1px solid #E5E7EB" } }} />
      </body>
    </html>
  );
}
