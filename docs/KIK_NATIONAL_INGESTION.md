# Atlas KR — National KIK ingestion workflow

## Purpose

This document records the repeatable route for turning the official `KIKcd_H`, `KIKcd_B` and `KIKmix` fixed-width files into Atlas KR region-registry artifacts.

The goal is to avoid rediscovering the file layout and hierarchy rules whenever a new KIK snapshot is released.

## Source files

For snapshot `2026-07-20` Atlas verified:

| File | Meaning | Rows excluding header | Encoding |
|---|---|---:|---|
| `KIKcd_H.20260720` | administrative agency / admin-dong codes | 3,924 | CP949/EUC-KR compatible |
| `KIKcd_B.20260720` | legal-dong codes | 20,570 | CP949/EUC-KR compatible |
| `KIKmix.20260720` | administrative ↔ legal jurisdiction relation | 21,836 | CP949/EUC-KR compatible |

The exact hashes and validation examples are stored in `data/manifests/kik-20260720.json`.

## Build command

```bash
npm run data:kik -- \
  --h /path/to/KIKcd_H.20260720 \
  --b /path/to/KIKcd_B.20260720 \
  --mix /path/to/KIKmix.20260720 \
  --date 20260720 \
  --out-dir data/generated/kik-20260720
```

The script is `scripts/build-kik-registry.mjs` and uses only Node built-ins.

Generated files:

```text
data/generated/kik-20260720/
├─ manifest.json
├─ admin-regions.json
├─ legal-regions.json
└─ admin-legal-crosswalk.json
```

## Why hierarchy inference needs explicit rules

A naive rule such as “take the longest zero-padded numeric-code prefix” is unsafe.

For example, sibling Seoul districts can share a numeric prefix that looks like a parent-child relationship even though they are independent districts. Therefore Atlas does **not** infer normal hierarchy from numeric prefix alone.

Current hierarchy rules:

1. `sido` roots are identified by the KIK row structure and the `XX00000000` root-code pattern.
2. `sigungu` rows first use `시도명` and `시군구명` semantics.
3. A district such as `안양시 동안구` is linked to `안양시` by the textual `시군구명` prefix within the same `시도명`.
4. Administrative-dong rows normally link to the exact matching `시군구명` row.
5. Sejong-like structures with a blank `시군구명` can use the single intermediate sigungu-equivalent row within the same source `시도명`.
6. Nested branch-office rows such as `돌산읍우두출장소` may use a parent administrative row only when **both** the administrative name prefix and zero-padded code-prefix relation agree.
7. Non-standard rows that still have no valid parent are reported as orphans rather than silently attached.

## Verified hierarchy examples

```text
경기도
└─ 안양시
   └─ 안양시 동안구
      └─ 부림동

4100000000
> 4117000000
> 4117300000
> 4117356600
```

```text
세종특별자치시
└─ intermediate 3611000000
   └─ 고운동

3600000000
> 3611000000
> 3611055000
```

```text
전남광주통합특별시
└─ 여수시
   └─ 돌산읍
      └─ 돌산읍우두출장소

1200000000
> 1213000000
> 1213025000
> 1213025100
```

## Current 2026-07-20 validation result

The verified source files produce:

```text
admin regions             3,924
legal regions            20,570
admin codes in crosswalk  3,924
standard root sido rows      16
```

Two non-standard administrative-office rows are deliberately reported as hierarchy orphans:

```text
4110500000  북부출장소
5110500000  동해출장소
```

They must not be automatically attached to another region merely because the numeric code looks similar.

## Crosswalk rule

`KIKmix` is kept as an independent versioned relation table.

```text
ADMIN REGION
   │
   └─ KIKmix relation
          │
          └─ LEGAL REGION
```

Atlas does not permanently add one legal-dong code column to an admin-dong row because one administrative unit may govern multiple legal units and the relation can change over time.

## Boundary geometry

KIK files provide codes and jurisdiction relationships, not trustworthy polygon geometry.

Boundary geometry must remain a separate versioned layer, for example:

```text
KIK region code registry
        +
versioned administrative boundary geometry
        +
CRS metadata
        ↓
Atlas spatial region layer
```

The default Atlas analysis CRS remains `EPSG:5179`, but source CRS is always preserved in layer metadata.

## Historical limitation

In the supplied `2026-07-20` KIK files, `말소일자` is blank throughout. Therefore this snapshot represents the current/active state and is not a complete historical ledger.

Historical reproducibility still needs:

- older ordered KIK snapshots, and/or
- official administrative-code change notices.

## Vibe-coding rule

When a newer KIK release appears:

```text
NEW KIK FILES
   ↓
npm run data:kik
   ↓
manifest counts / hashes / orphan review
   ↓
compare with previous snapshot
   ↓
Region Registry update
   ↓
record the verified result in docs / manifest
```

Do not rewrite the parser or hierarchy logic for every release unless the official layout itself changes.
