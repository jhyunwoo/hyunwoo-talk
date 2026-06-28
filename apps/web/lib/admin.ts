import { API_BASE } from "./api";

// ── Types mirroring the /api/admin responses ─────────────────────────────────

/** A row from the `visits` table (subset of columns the dashboard uses). */
export interface VisitRow {
  id: number;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  page: string | null;
  referrer: string | null;
  language: string | null;
  timezone: string | null;
  screen: string | null;
  viewport: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  asn: number | null;
  asOrganization: string | null;
  httpProtocol: string | null;
  tlsVersion: string | null;
  connectionType: string | null;
  createdAt: number;
}

export interface CountBucket {
  key: string | null;
  count: number;
}

export interface CityBucket {
  city: string | null;
  country: string | null;
  lat: string | null;
  lng: string | null;
  count: number;
}

export interface VisitStats {
  total: number;
  uniqueIps: number;
  byCountry: CountBucket[];
  byDevice: CountBucket[];
  byBrowser: CountBucket[];
  byCity: CityBucket[];
  byHour: CountBucket[];
  byDay: CountBucket[];
}

export interface VisitFilters {
  from?: number;
  to?: number;
  country?: string;
  deviceType?: string;
  browser?: string;
  q?: string;
}

export interface VisitsPage {
  visits: VisitRow[];
  hasMore: boolean;
}

/** Thrown on non-2xx responses; `status === 401` means the token is invalid. */
export class AdminRequestError extends Error {
  constructor(public status: number) {
    super(`admin request failed: ${status}`);
    this.name = "AdminRequestError";
  }
}

// ── Client ──────────────────────────────────────────────────────────────────

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function buildParams(f: VisitFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from !== undefined) p.set("from", String(f.from));
  if (f.to !== undefined) p.set("to", String(f.to));
  if (f.country) p.set("country", f.country);
  if (f.deviceType) p.set("deviceType", f.deviceType);
  if (f.browser) p.set("browser", f.browser);
  if (f.q) p.set("q", f.q);
  return p;
}

/** Validate an admin password against the server. */
export async function adminVerify(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      method: "POST",
      headers: authHeaders(token),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchVisits(
  token: string,
  filters: VisitFilters,
  opts: { before?: number; limit?: number } = {},
): Promise<VisitsPage> {
  const params = buildParams(filters);
  if (opts.before !== undefined) params.set("before", String(opts.before));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const res = await fetch(`${API_BASE}/api/admin/visits?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new AdminRequestError(res.status);
  return (await res.json()) as VisitsPage;
}

export async function fetchVisitStats(
  token: string,
  filters: VisitFilters,
): Promise<VisitStats> {
  const params = buildParams(filters);
  const res = await fetch(`${API_BASE}/api/admin/stats?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new AdminRequestError(res.status);
  return (await res.json()) as VisitStats;
}

// ── Helpers shared by the dashboard UI ───────────────────────────────────────

/** Format an epoch-ms timestamp in KST (the app's home timezone). */
export function formatKst(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Parse a latitude/longitude text column to a finite number, or null. */
export function parseCoord(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
