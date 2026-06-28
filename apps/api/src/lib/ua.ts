/**
 * Tiny, dependency-free User-Agent parser. Good enough for telemetry/analytics
 * (browser, OS, coarse device type); not meant to be exhaustive. Runs on the
 * Workers runtime with only regex — no Node deps.
 */
export interface ParsedUa {
  browser: string | null;
  os: string | null;
  deviceType: string | null;
}

export function parseUserAgent(ua: string): ParsedUa {
  if (!ua) return { browser: null, os: null, deviceType: null };
  return {
    browser: parseBrowser(ua),
    os: parseOs(ua),
    deviceType: parseDeviceType(ua),
  };
}

// Order matters: more specific engines first, because Edge/Opera/Samsung UAs
// all also contain "Chrome", and Chrome's contains "Safari".
const BROWSERS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
  ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
  ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
  ["Safari", /Version\/([\d.]+).*Safari/],
];

function parseBrowser(ua: string): string {
  for (const [name, re] of BROWSERS) {
    const m = ua.match(re);
    if (m && m[1]) return `${name} ${m[1]}`;
  }
  if (/Safari/.test(ua)) return "Safari";
  return "Unknown";
}

const WINDOWS_VERSIONS: Record<string, string> = {
  "10.0": "10/11",
  "6.3": "8.1",
  "6.2": "8",
  "6.1": "7",
};

function parseOs(ua: string): string {
  let m = ua.match(/Windows NT ([\d.]+)/);
  if (m && m[1]) return `Windows ${WINDOWS_VERSIONS[m[1]] ?? m[1]}`;

  m = ua.match(/(?:iPhone OS|CPU OS) ([\d_]+)/);
  if (m && m[1]) return `iOS ${m[1].replace(/_/g, ".")}`;
  if (/iPad/.test(ua)) return "iPadOS";

  m = ua.match(/Mac OS X ([\d_]+)/);
  if (m && m[1]) return `macOS ${m[1].replace(/_/g, ".")}`;

  m = ua.match(/Android ([\d.]+)/);
  if (m && m[1]) return `Android ${m[1]}`;

  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function parseDeviceType(ua: string): string {
  if (/iPad|Tablet/.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile/.test(ua)) return "mobile";
  if (/Android/.test(ua)) return "tablet";
  return "desktop";
}
