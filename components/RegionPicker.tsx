"use client";

import { useEffect, useState } from "react";

type SpatialLevel = "sigungu" | "admin-dong" | "grid-1km" | "grid-500m" | "grid-100m";
type RegionKind = "sido" | "sigungu" | "admin-dong";

type RegionNode = {
  code: string;
  name: string;
  kind: RegionKind;
  parentCode: string | null;
  createdAt: string;
  hasChildren?: boolean;
};

type LegalLink = {
  adminCode: string;
  legalCode: string;
  legalName: string;
  createdAt: string;
};

type RegionLevelState = {
  parent: string | null;
  selectedCode: string;
  options: RegionNode[];
};

type RegionResponse = {
  snapshot: {
    sourceDatasetId: string;
    snapshotDate: string;
    scope: string;
    limitation: string;
  };
  region?: RegionNode;
  path?: RegionNode[];
  levels?: RegionLevelState[];
  children?: RegionNode[];
  legalLinks?: LegalLink[];
  error?: string;
};

export type RegionSelection = {
  code: string;
  name: string;
  kind: RegionKind;
  path: RegionNode[];
  legalLinks: LegalLink[];
  ready: boolean;
  snapshotDate: string;
};

const DEFAULT_BY_LEVEL: Record<SpatialLevel, string> = {
  sigungu: "4117300000",
  "admin-dong": "4117356600",
  "grid-1km": "4117356600",
  "grid-500m": "4117356600",
  "grid-100m": "4117356600",
};

function targetKind(level: SpatialLevel): RegionKind {
  return level === "sigungu" ? "sigungu" : "admin-dong";
}

export default function RegionPicker({ level, onChange }: { level: SpatialLevel; onChange: (selection: RegionSelection | null) => void }) {
  const [levels, setLevels] = useState<RegionLevelState[]>([]);
  const [path, setPath] = useState<RegionNode[]>([]);
  const [legalLinks, setLegalLinks] = useState<LegalLink[]>([]);
  const [snapshotDate, setSnapshotDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/regions?code=${DEFAULT_BY_LEVEL[level]}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`regions ${response.status}`);
        return response.json() as Promise<RegionResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        const nextLevels = payload.levels ?? [];
        const nextPath = payload.path ?? [];
        const nextLinks = payload.legalLinks ?? [];
        setLevels(nextLevels);
        setPath(nextPath);
        setLegalLinks(nextLinks);
        setSnapshotDate(payload.snapshot.snapshotDate);
        const region = payload.region;
        if (!region) return onChange(null);
        onChange({
          code: region.code,
          name: region.name,
          kind: region.kind,
          path: nextPath,
          legalLinks: nextLinks,
          ready: region.kind === targetKind(level),
          snapshotDate: payload.snapshot.snapshotDate,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "지역 Registry를 불러오지 못했습니다.");
        onChange(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [level, onChange]);

  async function selectAt(index: number, code: string) {
    const current = levels[index];
    if (!current) return;
    const node = current.options.find((option) => option.code === code);
    if (!node) return;

    const nextLevels = levels.slice(0, index + 1).map((item, itemIndex) => itemIndex === index ? { ...item, selectedCode: code } : item);
    const nextPath = [...path.slice(0, index), node];
    let nextLinks: LegalLink[] = [];
    setLevels(nextLevels);
    setPath(nextPath);
    setLegalLinks([]);
    setError(null);

    if (node.kind === "admin-dong") {
      try {
        const detailResponse = await fetch(`/api/regions?code=${node.code}`);
        const detail = await detailResponse.json() as RegionResponse;
        if (!detailResponse.ok) throw new Error(detail.error || `regions ${detailResponse.status}`);
        nextLinks = detail.legalLinks ?? [];
        setLegalLinks(nextLinks);
        setSnapshotDate(detail.snapshot.snapshotDate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "법정동 Crosswalk를 불러오지 못했습니다.");
      }
    }

    onChange({
      code: node.code,
      name: node.name,
      kind: node.kind,
      path: nextPath,
      legalLinks: nextLinks,
      ready: node.kind === targetKind(level),
      snapshotDate,
    });

    if (!node.hasChildren) return;

    try {
      const response = await fetch(`/api/regions?parent=${node.code}`);
      const payload = await response.json() as RegionResponse;
      if (!response.ok) throw new Error(payload.error || `regions ${response.status}`);
      const options = payload.children ?? [];
      if (!options.length) return;
      setLevels((currentLevels) => [
        ...currentLevels.slice(0, index + 1),
        { parent: node.code, selectedCode: "", options },
      ]);
      setSnapshotDate(payload.snapshot.snapshotDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "하위 지역을 불러오지 못했습니다.");
    }
  }

  return (
    <div className="region-picker">
      <div className="region-picker-head">
        <div><strong>지역 선택</strong><small>KIK 행정기관 코드 · {snapshotDate || "…"}</small></div>
        <span>{level === "sigungu" ? "시군구" : "읍면동 기준"}</span>
      </div>

      {loading && <div className="region-picker-loading">행정구역 Registry를 불러오는 중…</div>}

      {!loading && levels.map((item, index) => (
        <label key={`${item.parent ?? "root"}-${index}`}>
          <span>{index === 0 ? "시도" : index === levels.length - 1 && item.options.some((option) => option.kind === "admin-dong") ? "읍면동" : "시군구"}</span>
          <select value={item.selectedCode} onChange={(event) => selectAt(index, event.target.value)}>
            <option value="">선택</option>
            {item.options.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
          </select>
        </label>
      ))}

      {path.length > 0 && (
        <div className="region-picker-path">
          <span>{path.map((item) => item.name).join(" › ")}</span>
          <b>{path[path.length - 1].code}</b>
        </div>
      )}

      {legalLinks.length > 0 && (
        <div className="region-legal-links">
          <strong>관할 법정동</strong>
          <div>{legalLinks.map((link) => <span key={`${link.adminCode}-${link.legalCode}`}>{link.legalName} <b>{link.legalCode}</b></span>)}</div>
        </div>
      )}

      {error && <div className="error compact">{error}</div>}
      <small className="region-picker-note">현재 UI는 검증된 2026-07-20 KIK 자료의 안양 MVP 범위를 사용합니다. 전국 KIK ingest로 교체해도 같은 API/선택 UI를 유지합니다.</small>
    </div>
  );
}
