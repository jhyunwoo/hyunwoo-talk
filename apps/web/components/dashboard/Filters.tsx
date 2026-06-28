"use client";

import type { VisitStats } from "../../lib/admin";
import styles from "./dashboard.module.css";

export type RangePreset = "24h" | "7d" | "30d" | "all";

export const PRESET_MS: Record<Exclude<RangePreset, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const PRESET_LABELS: Record<RangePreset, string> = {
  "24h": "24시간",
  "7d": "7일",
  "30d": "30일",
  all: "전체",
};

export interface FilterState {
  preset: RangePreset;
  country: string;
  deviceType: string;
  browser: string;
  q: string;
}

interface FiltersProps {
  value: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onRefresh: () => void;
  stats: VisitStats | null;
}

export function Filters({ value, onChange, onRefresh, stats }: FiltersProps) {
  return (
    <div className={styles.filters}>
      <div className={styles.presetRow}>
        {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.preset} ${value.preset === p ? styles.presetOn : ""}`}
            onClick={() => onChange({ preset: p })}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      <select
        className={styles.select}
        value={value.country}
        onChange={(e) => onChange({ country: e.target.value })}
      >
        <option value="">모든 국가</option>
        {stats?.byCountry.map((c) => (
          <option key={c.key ?? "—"} value={c.key ?? ""}>
            {(c.key || "(미상)") + ` (${c.count})`}
          </option>
        ))}
      </select>

      <select
        className={styles.select}
        value={value.deviceType}
        onChange={(e) => onChange({ deviceType: e.target.value })}
      >
        <option value="">모든 기기</option>
        {stats?.byDevice.map((d) => (
          <option key={d.key ?? "—"} value={d.key ?? ""}>
            {(d.key || "(미상)") + ` (${d.count})`}
          </option>
        ))}
      </select>

      <select
        className={styles.select}
        value={value.browser}
        onChange={(e) => onChange({ browser: e.target.value })}
      >
        <option value="">모든 브라우저</option>
        {stats?.byBrowser.map((b) => (
          <option key={b.key ?? "—"} value={b.key ?? ""}>
            {(b.key || "(미상)") + ` (${b.count})`}
          </option>
        ))}
      </select>

      <input
        className={styles.search}
        type="search"
        placeholder="IP·도시·사용자 검색"
        value={value.q}
        onChange={(e) => onChange({ q: e.target.value })}
      />

      <button type="button" className={styles.refresh} onClick={onRefresh}>
        새로고침
      </button>
    </div>
  );
}
