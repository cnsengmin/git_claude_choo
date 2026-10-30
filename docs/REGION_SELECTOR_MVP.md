# Atlas KR Region Selector MVP

## Purpose

The region selector is the first user-facing use of the versioned Korean region registry. It replaces the previous free-text `regionCode` input with a hierarchy backed by the verified MOIS KIK snapshot.

## Current source

- Source: `KIKcd_H.20260720`
- Snapshot date: `2026-07-20`
- Verified against the supplied XLSX version
- Native code: 10-digit administrative-agency/admin-dong code, preserved as text
- Layout reference: `docs/MOIS_KIK_20260720.md`
- Raw parser: `lib/mois/kik.ts`

The current deployed UI uses a small, verified Anyang fixture so the product flow is testable without committing the multi-megabyte national raw files into the web bundle.

```text
Gyeonggi-do
  -> Anyang-si
      -> Manan-gu
          -> eup/myeon/dong
      -> Dongan-gu
          -> eup/myeon/dong
```

Default MVP selection:

```text
Gyeonggi-do -> Anyang-si -> Dongan-gu -> Burim-dong
code: 4117356600
```

## Important hierarchy finding

Do **not** hard-code Korean administration as only:

```text
sido -> sigungu -> eup/myeon/dong
```

The KIK snapshot demonstrates nested `sigungu`-class administrative agencies. For example:

```text
4100000000  Gyeonggi-do
  4117000000  Anyang-si
    4117300000  Anyang-si Dongan-gu
      4117356600  Burim-dong
```

Sejong also has an intermediate KIK administrative code even when the `sigunguName` field is blank.

Atlas therefore resolves a KIK parent using the **longest zero-padded code prefix that actually exists in the same snapshot**, rather than assuming a fixed number of administrative levels.

Implementation: `resolveKikParentCode()` in `lib/mois/kik.ts`.

## API

### Browse children

```text
GET /api/regions
GET /api/regions?parent=<10-digit-code>
```

The response includes:

```text
snapshot metadata
parent code
children[]
  code
  name
  kind
  parentCode
  createdAt
  hasChildren
```

### Resolve a selected path

```text
GET /api/regions?code=4117356600
```

The response includes the selected region, full hierarchy path and dropdown levels needed to reconstruct the cascading selector.

## UI behavior

`components/RegionPicker.tsx` is provider-neutral at the UI boundary. The currently embedded Anyang fixture can later be replaced by the full national KIK ingest without changing the Data Catalog selection contract.

The Data Catalog sends the selected native KIK code into the Export Plan scope. Grid exports currently use the selected administrative dong as the containing region; the SGIS native grid itself remains an independent spatial entity.

## Current limitation

The UI fixture is intentionally scoped to Anyang. The raw parser has already been verified against all supplied national files, but a durable full-national storage strategy is still needed.

Preferred next step:

```text
KIK raw snapshot
  -> batch ingest
  -> compact Region Registry cache
  -> /api/regions
  -> same RegionPicker UI
```

Do not bundle every original KIK row plus all crosswalk rows into the client. Keep the national registry server-side/cache-backed and return only the requested hierarchy branch.

## Crosswalk

`KIKmix.20260720` stays separate from the administrative hierarchy. It is a versioned administrative-dong <-> legal-dong relation dataset and must not be flattened permanently into the selector hierarchy.

Example already verified:

```text
admin Burim-dong 4117356600
  -> legal Gwan-yang-dong 4117310200
```

This crosswalk becomes important when a selected administrative region is used to request cadastral, address, building or VWorld layers that are keyed to legal-dong geography.
