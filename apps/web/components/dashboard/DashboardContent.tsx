"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminRequestError,
  fetchVisitStats,
  fetchVisits,
  type VisitFilters,
  type VisitRow,
  type VisitStats,
} from "../../lib/admin";
import { Charts } from "./Charts";
import { Filters, PRESET_MS, type FilterState } from "./Filters";
import { VisitsMap } from "./VisitsMap";
import { VisitsTable } from "./VisitsTable";
import styles from "./dashboard.module.css";

const PAGE = 500;

interface DashboardContentProps {
  token: string;
  onLock: () => void;
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

export function DashboardContent({ token, onLock }: DashboardContentProps) {
  const [filter, setFilter] = useState<FilterState>({
    preset: "7d",
    country: "",
    deviceType: "",
    browser: "",
    q: "",
  });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [stats, setStats] = useState<VisitStats | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    nonce: number;
  } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);

  // Debounce the free-text search so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filter.q.trim()), 350);
    return () => clearTimeout(t);
  }, [filter.q]);

  const buildFilters = useCallback((): VisitFilters => {
    const from =
      filter.preset === "all" ? undefined : Date.now() - PRESET_MS[filter.preset];
    return {
      from,
      country: filter.country || undefined,
      deviceType: filter.deviceType || undefined,
      browser: filter.browser || undefined,
      q: debouncedQ || undefined,
    };
  }, [filter.preset, filter.country, filter.deviceType, filter.browser, debouncedQ]);

  // Reload stats + the first page whenever the filters (or a manual refresh) change.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const filters = buildFilters();
    Promise.all([
      fetchVisitStats(token, filters),
      fetchVisits(token, filters, { limit: PAGE }),
    ])
      .then(([s, v]) => {
        if (!active) return;
        setStats(s);
        setVisits(v.visits);
        setHasMore(v.hasMore);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof AdminRequestError && e.status === 401) onLock();
        else setError("데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, buildFilters, refreshKey, onLock]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || visits.length === 0) return;
    setLoadingMore(true);
    try {
      const before = visits[visits.length - 1]!.createdAt;
      const page = await fetchVisits(token, buildFilters(), {
        before,
        limit: PAGE,
      });
      setVisits((prev) => [...prev, ...page.visits]);
      setHasMore(page.hasMore);
    } catch (e) {
      if (e instanceof AdminRequestError && e.status === 401) onLock();
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, visits, token, buildFilters, onLock]);

  const onRowFocus = useCallback((f: { lat: number; lng: number }) => {
    setFocus({ ...f, nonce: Date.now() });
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const topCountry = stats?.byCountry[0];
  const topDevice = stats?.byDevice[0];

  return (
    <div className={styles.dashboard}>
      <header className={styles.topbar}>
        <div>
          <h1 className={styles.h1}>방문자 대시보드</h1>
          <p className={styles.sub}>
            접속 위치·시간·기기 분석 · 위치는 도시 수준(근사)
          </p>
        </div>
        <button type="button" className={styles.lock} onClick={onLock}>
          잠금
        </button>
      </header>

      <Filters
        value={filter}
        onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
        onRefresh={() => setRefreshKey((k) => k + 1)}
        stats={stats}
      />

      {error && <div className={styles.errorBar}>{error}</div>}

      <section className={styles.cards}>
        <Card label="총 방문" value={stats?.total ?? 0} />
        <Card label="고유 IP" value={stats?.uniqueIps ?? 0} />
        <Card
          label="상위 국가"
          value={topCountry?.key || "—"}
          sub={topCountry ? `${topCountry.count}건` : undefined}
        />
        <Card
          label="상위 기기"
          value={topDevice?.key || "—"}
          sub={topDevice ? `${topDevice.count}건` : undefined}
        />
      </section>

      <div ref={mapRef} className={styles.mapAnchor}>
        <VisitsMap visits={visits} focus={focus} />
      </div>

      {stats && <Charts stats={stats} />}

      <VisitsTable
        visits={visits}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onRowFocus={onRowFocus}
      />

      {loading && (
        <div className={styles.loadingOverlay}>
          <span className="spinner" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
