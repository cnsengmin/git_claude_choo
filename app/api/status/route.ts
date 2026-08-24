import { NextResponse } from "next/server";

export async function GET() {
  const kakao = Boolean(process.env.KAKAO_REST_API_KEY);
  const naver = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  const google = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  const dataGoKr = Boolean(process.env.DATA_GO_KR_SERVICE_KEY);
  const sgis = Boolean(process.env.SGIS_CONSUMER_KEY && process.env.SGIS_CONSUMER_SECRET);
  const vworld = Boolean(process.env.VWORLD_API_KEY);
  const kosis = Boolean(process.env.KOSIS_API_KEY);

  return NextResponse.json({
    app: "atlas-kr",
    version: "0.4.0",
    providers: {
      kakao: { configured: kakao, requires: ["KAKAO_REST_API_KEY"] },
      naver: { configured: naver, requires: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] },
      google: { configured: google, requires: ["GOOGLE_MAPS_API_KEY"] },
      hira: {
        configured: kakao && dataGoKr,
        requires: ["KAKAO_REST_API_KEY", "DATA_GO_KR_SERVICE_KEY"],
        note: "Kakao is used only to resolve the map radius to Korean legal-dong regions before the official HIRA query.",
      },
      sgis: {
        configured: kakao && sgis,
        requires: ["KAKAO_REST_API_KEY", "SGIS_CONSUMER_KEY", "SGIS_CONSUMER_SECRET"],
        note: "The current UI uses Kakao to resolve the map center to an administrative-dong name before SGIS lookup. Direct SGIS administrative-code workflows can later bypass Kakao.",
      },
      vworld: {
        configured: vworld,
        requires: ["VWORLD_API_KEY"],
        note: "VWorld is registered as an Agent Grade B spatial provider. Atlas will prefer WFS/Data API for extractable features and WMS/WMTS for display/verification.",
      },
      kosis: {
        configured: kosis,
        requires: ["KOSIS_API_KEY"],
        note: "KOSIS is registered in the catalog; the table/indicator adapter is a next milestone.",
      },
    },
    catalog: {
      endpoint: "/api/catalog",
      analysisCrs: "EPSG:5179",
    },
  });
}
