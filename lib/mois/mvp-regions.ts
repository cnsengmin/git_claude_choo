export type MvpRegionKind = "sido" | "sigungu" | "admin-dong";

export type MvpRegionNode = {
  code: string;
  name: string;
  kind: MvpRegionKind;
  parentCode: string | null;
  createdAt: string;
};

export const MVP_REGION_SNAPSHOT = {
  sourceDatasetId: "mois-kik-h-20260720",
  snapshotDate: "2026-07-20",
  scope: "Anyang MVP fixture extracted from the verified KIKcd_H.20260720 snapshot",
  limitation: "This fixture intentionally contains only Gyeonggi-do -> Anyang-si -> Manan/Dongan-gu -> current eup/myeon/dong rows. The parser supports the full national KIK file; a persistent national ingest is the next step.",
} as const;

/**
 * Verified current rows from the user-supplied official KIKcd_H.20260720 file.
 * Native 10-digit administrative codes are preserved as strings.
 *
 * The hierarchy is deliberately deeper than a fixed sido -> sigungu -> dong model:
 * Gyeonggi-do -> Anyang-si -> Dongan-gu -> Burim-dong.
 */
export const MVP_REGION_NODES: MvpRegionNode[] = [
  { code: "4100000000", name: "경기도", kind: "sido", parentCode: null, createdAt: "1988-04-23" },
  { code: "4117000000", name: "안양시", kind: "sigungu", parentCode: "4100000000", createdAt: "1988-04-23" },
  { code: "4117100000", name: "안양시 만안구", kind: "sigungu", parentCode: "4117000000", createdAt: "1992-10-01" },
  { code: "4117151000", name: "안양1동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117152000", name: "안양2동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117153000", name: "안양3동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117154000", name: "안양4동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117155000", name: "안양5동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117156000", name: "안양6동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117157000", name: "안양7동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117158200", name: "명학동", kind: "admin-dong", parentCode: "4117100000", createdAt: "2026-07-01" },
  { code: "4117158300", name: "병목안동", kind: "admin-dong", parentCode: "4117100000", createdAt: "2026-07-01" },
  { code: "4117159000", name: "석수1동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1996-12-31" },
  { code: "4117160000", name: "석수2동", kind: "admin-dong", parentCode: "4117100000", createdAt: "1992-10-01" },
  { code: "4117161100", name: "충훈동", kind: "admin-dong", parentCode: "4117100000", createdAt: "2024-01-01" },
  { code: "4117164000", name: "박달동", kind: "admin-dong", parentCode: "4117100000", createdAt: "2025-07-01" },
  { code: "4117165000", name: "호현동", kind: "admin-dong", parentCode: "4117100000", createdAt: "2025-07-01" },
  { code: "4117300000", name: "안양시 동안구", kind: "sigungu", parentCode: "4117000000", createdAt: "1992-10-01" },
  { code: "4117351000", name: "비산1동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117352000", name: "비산2동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117353000", name: "비산3동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117354000", name: "부흥동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117354600", name: "달안동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1993-05-20" },
  { code: "4117355200", name: "관양동", kind: "admin-dong", parentCode: "4117300000", createdAt: "2024-01-01" },
  { code: "4117355900", name: "인덕원동", kind: "admin-dong", parentCode: "4117300000", createdAt: "2024-01-01" },
  { code: "4117356600", name: "부림동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1993-01-15" },
  { code: "4117357000", name: "평촌동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117357600", name: "평안동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1993-01-15" },
  { code: "4117357800", name: "귀인동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1994-07-10" },
  { code: "4117358000", name: "호계1동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117359000", name: "호계2동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117360000", name: "호계3동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117361000", name: "범계동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1992-10-01" },
  { code: "4117362000", name: "신촌동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1993-01-15" },
  { code: "4117363000", name: "갈산동", kind: "admin-dong", parentCode: "4117300000", createdAt: "1993-05-20" },
];

const childCount = new Map<string, number>();
for (const node of MVP_REGION_NODES) {
  if (!node.parentCode) continue;
  childCount.set(node.parentCode, (childCount.get(node.parentCode) ?? 0) + 1);
}

export function listMvpRegionChildren(parentCode: string | null) {
  return MVP_REGION_NODES
    .filter((node) => node.parentCode === parentCode)
    .map((node) => ({ ...node, hasChildren: (childCount.get(node.code) ?? 0) > 0 }));
}

export function getMvpRegion(code: string) {
  return MVP_REGION_NODES.find((node) => node.code === code) ?? null;
}

export function getMvpRegionPath(code: string) {
  const path: MvpRegionNode[] = [];
  let current = getMvpRegion(code);
  while (current) {
    path.unshift(current);
    current = current.parentCode ? getMvpRegion(current.parentCode) : null;
  }
  return path;
}
