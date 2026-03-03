# Africa ATS Directory

A community-driven, open-source directory of African companies mapped to ATS (Applicant Tracking System) job board endpoints.

This repository stores auditable ATS mappings (`board_url`, `platform_metadata`, `verification`, `evidence`) so downstream tools can consume reliable metadata without custom scraping logic.

## Supported ATS Platforms

| Platform | Canonical Pattern | File |
|---|---|---|
| Greenhouse | `boards.greenhouse.io/{board_token}` | `companies/greenhouse.json` |
| Lever | `jobs.lever.co/{board_token}` | `companies/lever.json` |
| Ashby | `jobs.ashbyhq.com/{board_token}` | `companies/ashby.json` |
| SmartRecruiters | `jobs.smartrecruiters.com/{org_slug}` | `companies/smartrecruiters.json` |
| Workable | `apply.workable.com/{account_slug}` | `companies/workable.json` |
| BambooHR | `{subdomain}.bamboohr.com` | `companies/bamboohr.json` |
| Breezy HR | `{subdomain}.breezy.hr` | `companies/breezyhr.json` |
| Recruitee | `{subdomain}.recruitee.com` | `companies/recruitee.json` |

## Repository Layout

```text
africa-ats-directory/
├── schema/
│   └── company-entry.schema.json
├── companies/
│   ├── greenhouse.json
│   ├── lever.json
│   ├── ashby.json
│   ├── smartrecruiters.json
│   ├── workable.json
│   ├── bamboohr.json
│   ├── breezyhr.json
│   ├── recruitee.json
│   └── index.json
└── scripts/
    ├── detect-ats.ts
    ├── validate.ts
    └── build-index.ts
```

## Entry Shape (v1)

```json
{
  "id": "tala-ke",
  "company": "Tala",
  "ats": "lever",
  "country": "KE",
  "city": "Nairobi",
  "sector": "fintech",
  "sector_raw": "fintech",
  "status": "active",
  "careers_url": "https://tala.co/careers",
  "board_url": "https://jobs.lever.co/tala",
  "platform_metadata": {
    "board_token": "tala"
  },
  "verification": {
    "method": "auto-detected",
    "confidence": 0.95,
    "first_seen_at": "2026-03-02",
    "last_checked_at": "2026-03-02",
    "last_status_code": 200
  },
  "evidence": {
    "detected_from_url": "https://tala.co/careers",
    "resolved_board_url": "https://jobs.lever.co/tala",
    "detection_signals": ["redirect:jobs.lever.co"],
    "notes": "Direct redirect observed"
  },
  "source": {
    "submitted_by": "github:contributor-handle",
    "submitted_at": "2026-03-02"
  }
}
```

Full schema: `schema/company-entry.schema.json`.

## Scripts

```bash
pnpm install
pnpm validate
pnpm build-index
pnpm detect <careers-url>
```

Notes:

- `pnpm validate` performs schema checks, duplicate ID checks, ATS/file coherence checks, and board activity checks.
- Board checks classify failures as `soft-fail` (warning) or `hard-fail` (CI blocking).
- `pnpm build-index` regenerates `companies/index.json` in metadata+entries format.

## Detect ATS

```bash
pnpm detect https://tala.co/careers
```

Output includes:

- `ats`
- `board_url`
- `platform_metadata`
- `confidence`
- `detection_signals`

The script also prints a draft entry in v1 schema format.

## Contributing

See `CONTRIBUTING.md` for the exact workflow and PR acceptance criteria.

## License

MIT - see `LICENSE`.
