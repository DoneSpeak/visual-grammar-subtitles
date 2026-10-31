const pad = (n: number): string => String(n).padStart(2, '0');

/** `MM-DD HH:mm` in the builder's local time zone; surfaced so a stale in-page bundle is obvious. */
const formatStamp = (iso: string): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

/** `v0.3.0 · 10-31 13:07` — manifest version plus the build time baked in at compile. */
export const buildLabel = (): string => `v${chrome.runtime.getManifest().version} · ${formatStamp(__BUILD_STAMP__)}`;
