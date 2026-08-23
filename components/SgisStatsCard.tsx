"use client";

import { useState } from "react";
import type { SgisStatsSnapshot } from "@/lib/sgis/client";

type Props = {
  center: { lng: number; lat: number };
};

const formatNumber = (value: number | null, digits = 0) =>
  value === null ? "-" : value.toLocaleString("ko-KR", { maximumFractionDigits: digits });

export default function SgisStatsCard({ center }: Props) {
  const [year, setYear] = useState(2024);
  const [data, setData] = useState<SgisStatsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        x: String(center.lng),
        y: String(center.lat),
        year: String(year),
      });
      const response = await fetch(`/api/stats/sgis?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `SGIS request failed: ${response.status}`);
      setData(payload as SgisStatsSnapshot);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "SGIS 통계 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="official-stats-card">
      <div className="official-stats-heading">
        <div>
          <strong>SGIS 공식 통계</strong>
          <small>지도 중심이 속한 행정동의 인구·사업체·종사자를 조회합니다.</small>
        </div>
        <span>OFFICIAL</span>
      </div>

      <div className="official-stats-controls">
        <label>
          <span>기준연도</span>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            <option value={2024}>2024</option>
            <option value={2023}>2023</option>
            <option value={2022}>2022</option>
            <option value={2021}>2021</option>
            <option value={2020}>2020</option>
          </select>
        </label>
        <button type="button" onClick={loadStats} disabled={loading}>
          {loading ? "조회 중…" : "현재 위치 공식통계 조회"}
        </button>
      </div>

      {error && <div className="error compact">{error}</div>}

      {data && (
        <>
          <div className="official-area-strip">
            <div>
              <span>행정동</span>
              <strong>{data.area.sgisAdmName}</strong>
            </div>
            <div>
              <span>SGIS 코드</span>
              <strong>{data.area.sgisAdmCd}</strong>
            </div>
            <div>
              <span>기준연도</span>
              <strong>{data.year}</strong>
            </div>
          </div>

          <div className="official-stat-grid">
            <div><span>총인구</span><b>{formatNumber(data.population.totalPopulation)}</b><small>명</small></div>
            <div><span>사업체</span><b>{formatNumber(data.business.establishments)}</b><small>개</small></div>
            <div><span>종사자</span><b>{formatNumber(data.business.workers)}</b><small>명</small></div>
            <div><span>평균연령</span><b>{formatNumber(data.population.averageAge, 1)}</b><small>세</small></div>
            <div><span>인구밀도</span><b>{formatNumber(data.population.densityPerKm2, 1)}</b><small>명/㎢</small></div>
            <div><span>가구</span><b>{formatNumber(data.population.households)}</b><small>가구</small></div>
          </div>

          <div className="official-provenance">
            <strong>SGIS · 공식 집계통계</strong>
            <span>조회 {new Date(data.retrievedAt).toLocaleString("ko-KR")}</span>
            <small>{data.warning}</small>
          </div>
        </>
      )}
    </section>
  );
}
