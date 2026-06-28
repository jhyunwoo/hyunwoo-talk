"use client";

import { formatKst, parseCoord, type VisitRow } from "../../lib/admin";
import styles from "./dashboard.module.css";

interface VisitsTableProps {
  visits: VisitRow[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRowFocus: (focus: { lat: number; lng: number }) => void;
}

function location(v: VisitRow): string {
  return [v.city, v.region, v.country].filter(Boolean).join(" · ") || "—";
}

function device(v: VisitRow): string {
  return [v.deviceType, v.os, v.browser].filter(Boolean).join(" · ") || "—";
}

export function VisitsTable({
  visits,
  hasMore,
  loadingMore,
  onLoadMore,
  onRowFocus,
}: VisitsTableProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>접속 기록 ({visits.length})</div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>시간 (KST)</th>
              <th>사용자</th>
              <th>위치</th>
              <th>IP</th>
              <th>기기</th>
              <th>네트워크</th>
              <th>페이지</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  기록이 없습니다.
                </td>
              </tr>
            )}
            {visits.map((v) => {
              const lat = parseCoord(v.latitude);
              const lng = parseCoord(v.longitude);
              const hasCoord = lat !== null && lng !== null;
              return (
                <tr
                  key={v.id}
                  className={hasCoord ? styles.rowClickable : undefined}
                  onClick={
                    hasCoord ? () => onRowFocus({ lat, lng }) : undefined
                  }
                  title={hasCoord ? "지도에서 보기" : undefined}
                >
                  <td className={styles.nowrap}>{formatKst(v.createdAt)}</td>
                  <td>
                    {v.userId ? (
                      <span className={styles.userTag}>{v.userId}</span>
                    ) : (
                      <span className={styles.dim}>비로그인</span>
                    )}
                  </td>
                  <td>{location(v)}</td>
                  <td className={styles.mono}>{v.ip ?? "—"}</td>
                  <td>{device(v)}</td>
                  <td className={styles.dim}>{v.asOrganization ?? "—"}</td>
                  <td className={styles.dim}>{v.page ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      )}
    </div>
  );
}
