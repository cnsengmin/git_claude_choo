export type VWorldLayerVerification = "official-sample" | "catalog-verified" | "runtime-verified" | "planned";

export interface VWorldLayerEntry {
  id: string;
  title: string;
  serviceModes: Array<"wms" | "wfs" | "wmts" | "data-api">;
  wmsLayerName?: string;
  wfsTypeName?: string;
  datasetUrl?: string;
  verification: VWorldLayerVerification;
  extractable: boolean;
  notes: string;
}

export const VWORLD_LAYER_REGISTRY: VWorldLayerEntry[] = [
  {
    id: "lx-land-information-basemap",
    title: "LX맵 / 편집지적도 계열",
    serviceModes: ["wms"],
    wmsLayerName: "lt_c_landinfobasemap",
    verification: "official-sample",
    extractable: false,
    notes: "The official VWorld 2026 education sample uses this WMS layer. Treat it as display/verification until an extractable cadastral feature endpoint is runtime-verified.",
  },
  {
    id: "zoning-region-district",
    title: "용도지역·지구·구역",
    serviceModes: ["wms", "wfs"],
    datasetUrl: "https://www.data.go.kr/data/15058773/openapi.do",
    verification: "catalog-verified",
    extractable: true,
    notes: "Public-data catalog confirms VWorld WMS/WFS availability. Do not hard-code a typeName until it is verified against the project API key and current VWorld service catalog.",
  },
  {
    id: "vworld-2d-data",
    title: "VWorld 2D 데이터 API",
    serviceModes: ["data-api"],
    datasetUrl: "https://www.data.go.kr/data/15140372/openapi.do",
    verification: "catalog-verified",
    extractable: true,
    notes: "Nationwide 2D data API catalog entry. Individual Atlas layers still require a verified dataset/service identifier and layer-specific license metadata.",
  },
];

export const getVworldLayer = (id: string) => VWORLD_LAYER_REGISTRY.find((layer) => layer.id === id);
