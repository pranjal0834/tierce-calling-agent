export interface Contact {
  phone_number: string;
  name?: string;
  company?: string;
  email?: string;
}

export const IST = "Asia/Kolkata";

export const FREE_PLAN_BULK_LIMIT = 3;

export function toUTC(iso: string) {
  return iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
}

export function fmtDuration(s?: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function sentimentLabel(score?: number | null) {
  if (score == null) return null;
  if (score >= 7) return "Positive";
  if (score >= 4) return "Neutral";
  return "Negative";
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(toUTC(iso)).toLocaleString("en-IN", {
    timeZone: IST, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(toUTC(iso));
    if (isNaN(d.getTime())) return iso;
    const hasExplicitTime = /T\d{2}:\d{2}/.test(iso) && !/T00:00(:00)?(Z|$)/.test(iso);
    if (hasExplicitTime) {
      return d.toLocaleString("en-IN", {
        timeZone: IST, weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
    }
    return d.toLocaleString("en-IN", {
      timeZone: IST, weekday: "short", day: "2-digit", month: "short",
    });
  } catch {
    return iso;
  }
}

export const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string; pulse?: boolean }> = {
  completed:    { label: "Completed",   dot: "bg-success-400",              text: "text-success-700", bg: "bg-success-50"  },
  in_progress:  { label: "Live",        dot: "bg-brand-400 animate-pulse",  text: "text-brand-700",   bg: "bg-brand-50",    pulse: true },
  ringing:      { label: "Ringing",     dot: "bg-warning-400 animate-pulse",  text: "text-warning-700",   bg: "bg-warning-50",    pulse: true },
  initiated:    { label: "Initiated",   dot: "bg-warning-400",                text: "text-warning-700",   bg: "bg-warning-50"    },
  not_answered: { label: "No Answer",   dot: "bg-neutral-400",              text: "text-neutral-600", bg: "bg-neutral-100" },
  failed:       { label: "Failed",      dot: "bg-error-400",                  text: "text-error-700",     bg: "bg-error-50"      },
  voicemail:    { label: "Voicemail",   dot: "bg-orange-400",               text: "text-orange-700",  bg: "bg-orange-50"   },
  cancelled:    { label: "Cancelled",   dot: "bg-neutral-400",              text: "text-neutral-600", bg: "bg-neutral-100" },
};

export const INTEREST_COLOR: Record<string, string> = {
  high: "text-success-600",
  medium: "text-warning-600",
  low: "text-orange-600",
  not_interested: "text-error-600",
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function SentimentDot({ score }: { score: number }) {
  const label = score >= 7 ? "Positive" : score >= 4 ? "Neutral" : "Negative";
  const color = score >= 7 ? "bg-success-400" : score >= 4 ? "bg-warning-400" : "bg-error-400";
  return (
    <span title={`Sentiment: ${label} · ${(score * 10).toFixed(0)}%`} className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
  );
}

function normalizePhone(raw: any): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = n.toLocaleString("fullwide", { useGrouping: false });
  }
  const hasPlus = s.trimStart().startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (hasPlus ? "+" : "") + digits;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classifyHeader(h: string): "phone" | "name" | "company" | "email" | null {
  const k = h.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return null;
  if (k.includes("email") || k.includes("mail")) return "email";
  if (k.includes("phone") || k.includes("mobile") || k.includes("cell") ||
      k.includes("whatsapp") || k.includes("contactno") || k.includes("contactnumber") ||
      k.includes("number") || k === "no" || k === "ph" || k === "tel" ||
      k.includes("msisdn") || k.includes("contactnum")) return "phone";
  if (k.includes("company") || k.includes("organi") || k.includes("business") ||
      k.includes("firm")) return "company";
  if (k.includes("name") || k.includes("customer") || k.includes("lead") ||
      k.includes("person") || k.includes("client")) return "name";
  return null;
}

export async function parseFile(file: File): Promise<Contact[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const contacts: Contact[] = [];
  const seen = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1, defval: "", blankrows: false,
    });
    if (!rows.length) continue;

    let headerIdx = -1;
    const colKind: Record<number, ReturnType<typeof classifyHeader>> = {};
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const row = rows[r] || [];
      const hasPhone = row.some((c) => normalizePhone(c));
      const labels = row.map((c) => classifyHeader(String(c ?? "")));
      if (!hasPhone && labels.some((l) => l !== null)) {
        headerIdx = r;
        labels.forEach((l, i) => { if (l) colKind[i] = l; });
        break;
      }
    }
    const colOf = (kind: string) =>
      Number(Object.keys(colKind).find((i) => colKind[+i] === kind) ?? -1);
    const phoneCol = colOf("phone");
    const nameCol = colOf("name");
    const companyCol = colOf("company");
    const emailCol = colOf("email");

    for (let r = 0; r < rows.length; r++) {
      if (r === headerIdx) continue;
      const row = rows[r];
      if (!row || !row.length) continue;

      let phone = phoneCol >= 0 ? normalizePhone(row[phoneCol]) : null;
      if (!phone) {
        for (const cell of row) { phone = normalizePhone(cell); if (phone) break; }
      }
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const pick = (col: number) =>
        col >= 0 && row[col] != null && String(row[col]).trim()
          ? String(row[col]).trim() : undefined;

      let email = pick(emailCol);
      if (!email) {
        for (const cell of row) {
          const v = String(cell ?? "").trim();
          if (EMAIL_RE.test(v)) { email = v; break; }
        }
      }
      let name = pick(nameCol);
      if (!name) {
        for (const cell of row) {
          const v = String(cell ?? "").trim();
          if (v && !normalizePhone(cell) && !EMAIL_RE.test(v) && /[a-z]/i.test(v)) {
            name = v; break;
          }
        }
      }

      contacts.push({ phone_number: phone, name, company: pick(companyCol), email });
    }
  }

  return contacts;
}

export function parseTextNumbers(text: string): Contact[] {
  const out: Contact[] = [];
  const seen = new Set<string>();
  for (const token of text.split(/[\n,;]+/)) {
    const phone = normalizePhone(token);
    if (phone && !seen.has(phone)) { seen.add(phone); out.push({ phone_number: phone }); }
  }
  return out;
}
