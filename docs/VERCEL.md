# Vercel deployment notes

Atlas KR is intended to run as a Next.js app on Vercel.

## Current state

The connected Vercel account currently has no projects, so the repository must first be imported into Vercel before a Preview Deployment can be created from the `atlas-mvp` branch.

## Recommended setup

1. Import `cnsengmin/git_claude_choo` into Vercel.
2. Select the `atlas-mvp` branch for the first preview.
3. Framework preset: Next.js.
4. Add these environment variables in Preview first:
   - `KAKAO_REST_API_KEY`
   - `NAVER_CLIENT_ID`
   - `NAVER_CLIENT_SECRET`
   - `DATA_GO_KR_SERVICE_KEY` (decoded/general key; required for the HIRA layer)
   - `GOOGLE_MAPS_API_KEY` (optional initially)
   - `NEXT_PUBLIC_MAP_STYLE_URL` (optional)
5. Run the default build command (`npm run build`).
6. Keep the pull request in draft until the preview build and API routes are verified.

## Smoke test checklist

- `/` renders the MapLibre map.
- Kakao search for `카페`, `편의점`, `병원`, `영화관` returns POIs near the map center.
- Naver local search returns Korean place results without exposing API secrets in the browser.
- HIRA 공식 search for `병원` resolves the current map center to legal-dong areas, returns official hospital records, and distance-filters them to the selected radius.
- Google provider remains optional until a Google Maps Platform key is configured.
- Provider results display LIVE vs 공식 status and are not presented as a single authoritative establishment count.

## Next integrations after deploy

1. HIRA pharmacy/detail expansion.
2. LOCALDATA licensed-business layer.
3. SGIS/census 100m population and establishment grids.
4. Building footprints and building-to-business spatial matching.
5. deck.gl density/heatmap layers and 2.5D building activity view.
