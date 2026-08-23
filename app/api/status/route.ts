import { NextResponse } from "next/server";

export async function GET() {
  const kakao = Boolean(process.env.KAKAO_REST_API_KEY);
  const naver = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  const google = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  const dataGoKr = Boolean(process.env.DATA_GO_KR_SERVICE_KEY);

  return NextResponse.json({
    app: "atlas-kr",
    version: "0.2.0",
    providers: {
      kakao: { configured: kakao, requires: ["KAKAO_REST_API_KEY"] },
      naver: { configured: naver, requires: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] },
      google: { configured: google, requires: ["GOOGLE_MAPS_API_KEY"] },
      hira: {
        configured: kakao && dataGoKr,
        requires: ["KAKAO_REST_API_KEY", "DATA_GO_KR_SERVICE_KEY"],
        note: "Kakao is used only to resolve the map radius to Korean legal-dong regions before the official HIRA query.",
      },
    },
  });
}
