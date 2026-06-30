import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "Vaaniq Voice Agent",
  description: "Next-generation AI voice calling platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-neutral-50 text-neutral-900 min-h-screen">
        {children}
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
      </body>
    </html>
  );
}
