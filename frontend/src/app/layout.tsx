import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

// Self-hosted by Next (no external Google Fonts request) and exposed as a CSS
// variable so Tailwind's `font-sans` resolves to Inter reliably — previously the
// font only rendered if the visitor already had Inter installed locally.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Vaaniq Voice Agent",
  description: "Next-generation AI voice calling platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-neutral-50 text-neutral-900 min-h-screen">
        {children}
        <div role="status" aria-live="polite">
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#ffffff",
              color: "#0F0F0E",
              border: "1px solid #E8E8E6",
              borderRadius: "10px",
              boxShadow: "0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
              fontSize: "13px",
              fontWeight: "500",
              padding: "10px 14px",
            },
            success: { iconTheme: { primary: "#0B8A8F", secondary: "#fff" } },
          }}
        />
        </div>
      </body>
    </html>
  );
}
