"use client";

import type { CountBucket, VisitStats } from "../../lib/admin";
import styles from "./dashboard.module.css";

/** Horizontal breakdown bars (country / device / browser). */
function BreakdownBars({
  title,
  data,
  emptyLabel = "(미상)",
}: {
  title: string;
  data: CountBucket[];
  emptyLabel?: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 1);
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.breakdown}>
        {data.length === 0 && <div className={styles.muted}>데이터 없음</div>}
        {data.map((d) => (
          <div key={d.key ?? "—"} className={styles.breakdownRow}>
            <span className={styles.breakdownLabel}>{d.key || emptyLabel}</span>
            <span className={styles.breakdownTrack}>
              <span
                className={styles.breakdownFill}
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </span>
            <span className={styles.breakdownCount}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 24-bucket time-of-day histogram in KST. */
function HourHistogram({ data }: { data: CountBucket[] }) {
  const counts = new Array<number>(24).fill(0);
  for (const d of data) {
    const h = Number(d.key);
    if (Number.isInteger(h) && h >= 0 && h < 24) counts[h] = d.count;
  }
  const max = Math.max(...counts, 1);
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>시간대별 접속 (KST)</div>
      <div className={styles.hours}>
        {counts.map((c, h) => (
          <div key={h} className={styles.hourCol} title={`${h}시 · ${c}건`}>
            <div className={styles.hourBarWrap}>
              <div
                className={styles.hourBar}
                style={{ height: `${(c / max) * 100}%` }}
              />
            </div>
            {h % 6 === 0 && <span className={styles.hourTick}>{h}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Daily trend across the selected range. */
function DailyTrend({ data }: { data: CountBucket[] }) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 1);
  const first = data[0]?.key ?? "";
  const last = data[data.length - 1]?.key ?? "";
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>일자별 추이 (KST)</div>
      <div className={styles.trend}>
        {data.length === 0 && <div className={styles.muted}>데이터 없음</div>}
        {data.map((d) => (
          <div
            key={d.key ?? "—"}
            className={styles.trendBar}
            style={{ height: `${(d.count / max) * 100}%` }}
            title={`${d.key} · ${d.count}건`}
          />
        ))}
      </div>
      {data.length > 0 && (
        <div className={styles.trendAxis}>
          <span>{first}</span>
          <span>{last}</span>
        </div>
      )}
    </div>
  );
}

export function Charts({ stats }: { stats: VisitStats }) {
  return (
    <>
      <div className={styles.chartsRow}>
        <HourHistogram data={stats.byHour} />
        <DailyTrend data={stats.byDay} />
      </div>
      <div className={styles.chartsRow}>
        <BreakdownBars
          title="국가별"
          data={stats.byCountry}
          emptyLabel="(미상 국가)"
        />
        <BreakdownBars title="기기별" data={stats.byDevice} />
        <BreakdownBars title="브라우저별" data={stats.byBrowser} />
      </div>
    </>
  );
}
