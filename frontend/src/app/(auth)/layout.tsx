export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 bg-grid flex items-center justify-center px-4 py-8 sm:p-4">
      <div className="w-full max-w-[420px] animate-fade-in">
        {children}
      </div>
    </div>
  );
}
