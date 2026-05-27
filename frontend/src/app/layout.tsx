import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tierce Voice Agent",
  description: "Next-generation AI voice calling platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        {children}
        <Toaster position="top-right" toastOptions={{ style: { background: "#1f2937", color: "#f9fafb" } }} />
      </body>
    </html>
  );
}
