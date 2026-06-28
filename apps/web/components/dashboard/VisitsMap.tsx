"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";
import { formatKst, parseCoord, type VisitRow } from "../../lib/admin";
import styles from "./dashboard.module.css";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// DEMO_MAP_ID is Google's always-available map id; Advanced Markers require one.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

/** A cluster of visits that share (roughly) the same city coordinate. */
interface CityGroup {
  key: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  visits: VisitRow[];
}

/** Group visits by coordinate rounded to ~city precision. */
function groupByCity(visits: VisitRow[]): CityGroup[] {
  const groups = new Map<string, CityGroup>();
  for (const v of visits) {
    const lat = parseCoord(v.latitude);
    const lng = parseCoord(v.longitude);
    if (lat === null || lng === null) continue;
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, lat, lng, city: v.city, country: v.country, visits: [] };
      groups.set(key, g);
    }
    g.visits.push(v);
  }
  for (const g of groups.values()) {
    g.visits.sort((a, b) => b.createdAt - a.createdAt);
  }
  return [...groups.values()].sort((a, b) => b.visits.length - a.visits.length);
}

/** Pans/zooms to a focus coordinate when the table requests it. */
function FocusController({
  focus,
}: {
  focus: { lat: number; lng: number; nonce: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !focus) return;
    map.panTo({ lat: focus.lat, lng: focus.lng });
    map.setZoom(Math.max(map.getZoom() ?? 6, 9));
  }, [map, focus]);
  return null;
}

interface VisitsMapProps {
  visits: VisitRow[];
  focus: { lat: number; lng: number; nonce: number } | null;
}

export function VisitsMap({ visits, focus }: VisitsMapProps) {
  const groups = useMemo(() => groupByCity(visits), [visits]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const maxCount = groups.reduce((m, g) => Math.max(m, g.visits.length), 1);
  const selected = groups.find((g) => g.key === selectedKey) ?? null;

  if (!API_KEY) {
    return (
      <div className={`${styles.map} ${styles.mapEmpty}`}>
        지도를 표시하려면 <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>를
        설정하세요.
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={`${styles.map} ${styles.mapEmpty}`}>
        표시할 위치 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className={styles.map}>
      <APIProvider apiKey={API_KEY}>
        <GoogleMap
          mapId={MAP_ID}
          defaultZoom={2}
          defaultCenter={{ lat: groups[0]!.lat, lng: groups[0]!.lng }}
          gestureHandling="greedy"
          disableDefaultUI={false}
          colorScheme="DARK"
          style={{ width: "100%", height: "100%" }}
        >
          <FocusController focus={focus} />
          {groups.map((g) => {
            const scale = 0.5 + (g.visits.length / maxCount) * 0.5;
            return (
              <AdvancedMarker
                key={g.key}
                position={{ lat: g.lat, lng: g.lng }}
                onClick={() => setSelectedKey(g.key)}
              >
                <div
                  className={styles.mapPin}
                  style={{ transform: `scale(${scale})` }}
                >
                  {g.visits.length}
                </div>
              </AdvancedMarker>
            );
          })}
          {selected && (
            <InfoWindow
              position={{ lat: selected.lat, lng: selected.lng }}
              onCloseClick={() => setSelectedKey(null)}
            >
              <div className={styles.infoWindow}>
                <strong>
                  {selected.city ?? "알 수 없음"}
                  {selected.country ? `, ${selected.country}` : ""} ·{" "}
                  {selected.visits.length}회
                </strong>
                <ul>
                  {selected.visits.slice(0, 8).map((v) => (
                    <li key={v.id}>
                      {formatKst(v.createdAt)} · {v.userId ?? "비로그인"} ·{" "}
                      {v.deviceType ?? "-"}
                    </li>
                  ))}
                  {selected.visits.length > 8 && (
                    <li>…외 {selected.visits.length - 8}건</li>
                  )}
                </ul>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
