import { resolveCenterAdministrativeRegion } from "@/lib/geo/kakaoRegion";
import type { GeoPoint } from "@/lib/geo/distance";

type SgisEnvelope<T> = {
  result?: T;
  errCd?: number;
  errMsg?: string;
};

type SgisAuthResult = {
  accessToken: string;
  accessTimeout?: string;
};

type SgisStageItem = {
  cd: string;
  addr_name: string;
  full_addr?: string;
};

type SgisPopulationItem = {
  adm_cd?: string;
  adm_nm?: string;
  tot_ppltn?: string;
  avg_age?: string;
  ppltn_dnsty?: string;
  tot_family?: string;
  avg_fmember_cnt?: string;
  tot_house?: string;
  corp_cnt?: string;
  employee_cnt?: string;
};

type SgisCompanyItem = {
  adm_cd?: string;
  adm_nm?: string;
  corp_cnt?: string;
  tot_worker?: string;
};

export type SgisStatsSnapshot = {
  source: "SGIS";
  sourceKind: "official-statistical";
  providerHost: string;
  year: number;
  area: {
    kakaoAdministrativeName: string;
    sgisAdmCd: string;
    sgisAdmName: string;
  };
  population: {
    totalPopulation: number | null;
    averageAge: number | null;
    densityPerKm2: number | null;
    households: number | null;
    averageHouseholdSize: number | null;
    houses: number | null;
  };
  business: {
    establishments: number | null;
    workers: number | null;
    themeCd?: string;
  };
  retrievedAt: string;
  warning: string;
};

const SGIS_HOSTS = ["https://sgisapi.mods.go.kr/OpenAPI3", "https://sgisapi.kostat.go.kr/OpenAPI3"] as const;
const TOKEN_REFRESH_SAFETY_MS = 60_000;

let tokenCache: { token: string; expiresAt: number; host: string } | null = null;

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "" || value === "N/A") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value = "") {
  return value.replace(/\s+/g, "").replace(/특별자치도|특별자치시|특별시|광역시/g, "").trim();
}

function lastToken(value = "") {
  return value.trim().split(/\s+/).filter(Boolean).at(-1) ?? value;
}

function chooseStageItem(items: SgisStageItem[], target: string): SgisStageItem | undefined {
  const normalizedTarget = normalizeName(target);
  const targetLast = normalizeName(lastToken(target));

  return items.find((item) => normalizeName(item.addr_name) === normalizedTarget)
    ?? items.find((item) => normalizeName(item.full_addr ?? "").endsWith(normalizedTarget))
    ?? items.find((item) => normalizeName(item.addr_name) === targetLast)
    ?? items.find((item) => normalizeName(item.full_addr ?? "").endsWith(targetLast));
}

async function requestJson<T>(host: string, path: string, params: URLSearchParams): Promise<SgisEnvelope<T>> {
  const response = await fetch(`${host}${path}?${params}`, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`SGIS request failed (${response.status}): ${text.slice(0, 220)}`);

  let parsed: SgisEnvelope<T>;
  try {
    parsed = JSON.parse(text) as SgisEnvelope<T>;
  } catch {
    throw new Error(`SGIS returned a non-JSON response: ${text.slice(0, 220)}`);
  }

  if (parsed.errCd !== undefined && parsed.errCd !== 0) {
    throw new Error(`SGIS API error ${parsed.errCd}: ${parsed.errMsg || "Unknown error"}`);
  }
  return parsed;
}

async function authenticate(): Promise<{ token: string; host: string }> {
  const consumerKey = process.env.SGIS_CONSUMER_KEY;
  const consumerSecret = process.env.SGIS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error("SGIS_CONSUMER_KEY and SGIS_CONSUMER_SECRET are not configured");
  }

  if (tokenCache && tokenCache.expiresAt - TOKEN_REFRESH_SAFETY_MS > Date.now()) {
    return { token: tokenCache.token, host: tokenCache.host };
  }

  let lastError: unknown;
  for (const host of SGIS_HOSTS) {
    try {
      const params = new URLSearchParams({ consumer_key: consumerKey, consumer_secret: consumerSecret });
      const envelope = await requestJson<SgisAuthResult>(host, "/auth/authentication.json", params);
      if (!envelope.result?.accessToken) throw new Error("SGIS authentication response did not include an access token");

      const rawTimeout = Number(envelope.result.accessTimeout);
      const expiresAt = Number.isFinite(rawTimeout) && rawTimeout > Date.now()
        ? rawTimeout
        : Date.now() + 30 * 60 * 1000;
      tokenCache = { token: envelope.result.accessToken, expiresAt, host };
      return { token: tokenCache.token, host };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("SGIS authentication failed");
}

async function sgisRequest<T>(path: string, params: Record<string, string | undefined>): Promise<{ result: T; host: string }> {
  const { token, host } = await authenticate();
  const searchParams = new URLSearchParams({ accessToken: token });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") searchParams.set(key, value);
  });

  const envelope = await requestJson<T>(host, path, searchParams);
  if (envelope.result === undefined) throw new Error(`SGIS ${path} returned no result`);
  return { result: envelope.result, host };
}

async function resolveSgisAdministrativeCode(center: GeoPoint): Promise<{ admCd: string; admName: string; kakaoName: string }> {
  const kakaoRegion = await resolveCenterAdministrativeRegion(center);
  if (!kakaoRegion) throw new Error("현재 지도 중심의 행정동을 Kakao에서 확인하지 못했습니다.");

  const provinces = await sgisRequest<SgisStageItem[]>("/addr/stage.json", {});
  const province = chooseStageItem(provinces.result, kakaoRegion.sidoName);
  if (!province) throw new Error(`SGIS 시도 코드 매칭 실패: ${kakaoRegion.sidoName}`);

  const sigungus = await sgisRequest<SgisStageItem[]>("/addr/stage.json", { cd: province.cd });
  const sigungu = chooseStageItem(sigungus.result, kakaoRegion.sigunguName);
  if (!sigungu) throw new Error(`SGIS 시군구 코드 매칭 실패: ${kakaoRegion.sigunguName}`);

  const dongs = await sgisRequest<SgisStageItem[]>("/addr/stage.json", { cd: sigungu.cd });
  const dong = chooseStageItem(dongs.result, kakaoRegion.dongName);
  if (!dong) throw new Error(`SGIS 행정동 코드 매칭 실패: ${kakaoRegion.dongName}`);

  return {
    admCd: dong.cd,
    admName: dong.addr_name,
    kakaoName: kakaoRegion.addressName,
  };
}

export async function getSgisStatsSnapshot(input: {
  center?: GeoPoint;
  admCd?: string;
  admName?: string;
  year?: number;
  themeCd?: string;
}): Promise<SgisStatsSnapshot> {
  const year = Math.max(2015, Math.min(input.year ?? 2024, 2024));
  let admCd = input.admCd?.trim();
  let admName = input.admName?.trim() || admCd || "SGIS 행정구역";
  let kakaoName = admName;

  if (!admCd) {
    if (!input.center) throw new Error("center or admCd is required");
    const resolved = await resolveSgisAdministrativeCode(input.center);
    admCd = resolved.admCd;
    admName = resolved.admName;
    kakaoName = resolved.kakaoName;
  }

  const populationPromise = sgisRequest<SgisPopulationItem[]>("/stats/population.json", {
    year: String(year),
    adm_cd: admCd,
    low_search: "0",
  });
  const companyPromise = sgisRequest<SgisCompanyItem[]>("/stats/company.json", {
    year: String(year),
    adm_cd: admCd,
    low_search: "0",
    theme_cd: input.themeCd?.trim() || undefined,
  });

  const [populationResponse, companyResponse] = await Promise.all([populationPromise, companyPromise]);
  const population = populationResponse.result[0];
  const company = companyResponse.result[0];

  if (!population && !company) throw new Error(`SGIS에 ${admCd} / ${year} 통계가 없습니다.`);

  return {
    source: "SGIS",
    sourceKind: "official-statistical",
    providerHost: populationResponse.host || companyResponse.host,
    year,
    area: {
      kakaoAdministrativeName: kakaoName,
      sgisAdmCd: admCd,
      sgisAdmName: population?.adm_nm || company?.adm_nm || admName,
    },
    population: {
      totalPopulation: numberOrNull(population?.tot_ppltn),
      averageAge: numberOrNull(population?.avg_age),
      densityPerKm2: numberOrNull(population?.ppltn_dnsty),
      households: numberOrNull(population?.tot_family),
      averageHouseholdSize: numberOrNull(population?.avg_fmember_cnt),
      houses: numberOrNull(population?.tot_house),
    },
    business: {
      establishments: numberOrNull(company?.corp_cnt),
      workers: numberOrNull(company?.tot_worker),
      themeCd: input.themeCd?.trim() || undefined,
    },
    retrievedAt: new Date().toISOString(),
    warning: "현재 MVP의 SGIS 값은 지도 반경 합계가 아니라 지도 중심이 속한 행정동의 공식 집계통계입니다. 100m 격자 통계는 별도 자료제공/격자 파이프라인으로 연결할 예정입니다.",
  };
}
