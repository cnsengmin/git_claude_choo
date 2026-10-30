# Raw data staging

`data/raw/` is intentionally not tracked in the public Atlas KR code repository.

Atlas keeps source ZIP/SHP/CSV/GeoTIFF packages outside the code repo and commits only:

- acquisition/download receipt
- source URL or portal route
- request UI selections
- reference date/year
- original filename
- SHA-256
- file/package inventory
- CRS/encoding/schema findings
- normalization manifest
- reproducible ingestion code

Recommended raw-storage options, in order:

1. a separate **private data repository** using Git LFS when repository-based review is useful;
2. approved object/file storage when datasets are very large;
3. local staging during one-off inspection.

Do **not** mirror a provider's raw package to a public repository until redistribution/reuse terms are verified for that exact dataset.

Suggested private-repository layout:

```text
atlas-kr-data-private/
  raw/
    sgis/
      2025-boundary/
      2025-grid-100m/
      2024-grid-population-100m/
    vworld/
    data-go-kr/
  receipts/
  manifests/
```

After a raw package is inspected, record it in this code repository under `data/manifests/` and keep the original binary outside this repository.
