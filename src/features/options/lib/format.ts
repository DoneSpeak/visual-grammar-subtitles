export const fmtSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;

export const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtClock = (seconds: number): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** Accepts `mm:ss` or `h:mm:ss`; returns null when the text is not a time point. */
export const parseClock = (text: string): number | null => {
  const parts = text.trim().split(':').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  const [a, b, c] = parts.map(Number);
  return parts.length === 2 ? a * 60 + b : a * 3600 + b * 60 + c;
};
