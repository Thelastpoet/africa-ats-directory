# Africa ATS Directory — Implementation Spec (v1)

A community-driven, open-source directory of African companies mapped to ATS (Applicant Tracking System) providers, with evidence and validation metadata suitable for reliable downstream ingestion.

## Scope

- Phase 1 focus is Kenya (`country=KE`) with a seed dataset.
- Non-Kenya records are allowed only if marked `status=watchlist` until Phase 2 opens.
- Phase 2 expands to Uganda, Tanzania, Rwanda.
- Phase 3 expands to Nigeria, Ghana, South Africa, Egypt.

## Goals

- Provide a public, machine-readable mapping from company to ATS board endpoint.
- Keep records auditable via explicit evidence and deterministic validation.
- Support contributor submissions with clear acceptance rules and low-maintenance CI.

## Non-Goals (v1)

- No hiring trend analytics.
- No salary analytics.
- No attempt to scrape full job descriptions in this repo.

## Repo Structure

```text
africa-ats-directory/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── schema/
│   └── company-entry.schema.json
├── companies/
│   ├── index.json                # Auto-generated. Do not edit manually.
│   ├── greenhouse.json
│   ├── lever.json
│   ├── ashby.json
│   ├── smartrecruiters.json
│   ├── workable.json
│   ├── bamboohr.json
│   ├── breezyhr.json
│   └── recruitee.json
├── scripts/
│   ├── validate.js               # Schema + deterministic board checks
│   ├── detect-ats.js             # ATS detection from careers URL
│   └── build-index.js            # Merge platform files into companies/index.json
└── .github/
    └── workflows/
        └── validate.yml          # Runs validation on every PR
```

## Supported ATS Platforms (v1)

Detection coverage and storage coverage must match 1:1.

| Platform | Public API | Canonical Pattern | Platform File |
|---|---|---|---|
| Greenhouse | Yes | `boards.greenhouse.io/{board_token}` | `companies/greenhouse.json` |
| Lever | Yes | `jobs.lever.co/{board_token}` | `companies/lever.json` |
| Ashby | Yes | `jobs.ashbyhq.com/{board_token}` | `companies/ashby.json` |
| SmartRecruiters | Partial public listing | `jobs.smartrecruiters.com/{org_slug}` | `companies/smartrecruiters.json` |
| Workable | Yes | `apply.workable.com/{account_slug}` | `companies/workable.json` |
| BambooHR | Partial | `{subdomain}.bamboohr.com` | `companies/bamboohr.json` |
| Breezy HR | Partial | `{subdomain}.breezy.hr` | `companies/breezyhr.json` |
| Recruitee | Partial | `{subdomain}.recruitee.com` | `companies/recruitee.json` |

## Data Model

### Common Entry Schema

Each company entry lives in its platform file and follows this base shape:

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
    "detection_signals": ["redirect:jobs.lever.co", "html-link-match"],
    "notes": "Direct redirect observed"
  },
  "source": {
    "submitted_by": "github:contributor-handle",
    "submitted_at": "2026-03-02"
  }
}
```

### Required Fields

- `id`, `company`, `ats`, `country`, `careers_url`, `board_url`, `verification`, `evidence`, `platform_metadata`

### ID Convention

- Format: `{company-slug}-{country-code-lower}`.
- Examples: `tala-ke`, `paystack-ng`.
- Uniqueness is enforced globally across all platform files.

### Country Convention

- ISO 3166-1 alpha-2 uppercase (`KE`, `NG`, `ZA`).

### Status Values

- `active`: validated in last 30 days.
- `inactive`: endpoint consistently unavailable.
- `unknown`: newly added, not yet validated.
- `watchlist`: outside active geographic phase or low-confidence mapping.

### Confidence Rules

- `1.0`: manually verified by maintainer.
- `0.9-0.99`: auto-detected with direct domain/path match and successful probe.
- `0.7-0.89`: inferred via iframe/indirect references.
- `<0.7`: must be tagged `watchlist` until human verification.

### Sector Convention

- `sector` must be one of: `fintech`, `healthtech`, `edtech`, `ecommerce`, `logistics`, `ngo`, `climate`, `agritech`, `enterprise-software`, `other`.
- `sector_raw` is optional free text to preserve contributor input.

## Platform Metadata Contract

`platform_metadata` is platform-specific and must match the `ats` value:

- `greenhouse`: `board_token`
- `lever`: `board_token`
- `ashby`: `board_token`
- `smartrecruiters`: `org_slug`
- `workable`: `account_slug`
- `bamboohr`: `subdomain`
- `breezyhr`: `subdomain`
- `recruitee`: `subdomain`

## Detection Rules (`scripts/detect-ats.js`)

For each careers URL:

- Follow up to 5 redirects.
- Parse final URL and HTML anchors/iframes.
- Match known domains:
  - `boards.greenhouse.io` or `grnh.se` -> `greenhouse`
  - `jobs.lever.co` -> `lever`
  - `jobs.ashbyhq.com` -> `ashby`
  - `jobs.smartrecruiters.com` or `careers.smartrecruiters.com` -> `smartrecruiters`
  - `apply.workable.com` or `jobs.workable.com` -> `workable`
  - `*.bamboohr.com` -> `bamboohr`
  - `*.breezy.hr` -> `breezyhr`
  - `*.recruitee.com` -> `recruitee`

Detection output must include:

- `ats`
- `board_url`
- `platform_metadata`
- `confidence`
- `detection_signals`

## Validation Rules (`scripts/validate.js`)

Validation has two stages:

1. Schema and consistency checks
   - JSON schema validation for every entry.
   - Enforce global unique `id`.
   - Ensure file/platform match (`lever` entries only in `lever.json`).
   - Ensure required `platform_metadata` keys exist for the declared `ats`.

2. Board activity checks (deterministic and CI-safe)
   - Request timeout: 8 seconds.
   - Retries: 2 with exponential backoff (1 second, 2 seconds).
   - User-Agent: fixed project UA string.
   - Pass conditions:
     - `2xx` for `board_url`, or
     - `3xx` redirect chain ending on recognized ATS host with non-error terminal response.
   - Soft-fail conditions (do not fail PR, but annotate):
     - `403`, `429`, anti-bot challenge pages, temporary DNS issues.
   - Hard-fail conditions:
     - malformed URL, persistent `404`, schema errors, wrong platform file, duplicate `id`.

CI behavior:

- PR fails only on hard-fail conditions.
- Soft-fail entries are marked `verification_status=needs_recheck`.

## Build Rules (`scripts/build-index.js`)

- Merge all platform files into `companies/index.json`.
- Sort output by `country`, then `company`, then `id`.
- Include `generated_at` at top-level metadata in `index.json`.
- `index.json` is generated only; direct edits are rejected by CI.

## Contribution Model

1. Fork repository.
2. Run `npm ci`.
3. Add or update entry in the correct platform file.
4. Run `npm run validate`.
5. Run `npm run build-index`.
6. Commit platform file changes plus regenerated `companies/index.json`.
7. Open PR with evidence notes.

## PR Acceptance Criteria

A PR is mergeable when:

- Schema validation passes.
- No duplicate `id`.
- `board_url` and platform metadata are coherent.
- Evidence is present and confidence is justified.
- CI has no hard-fail checks.

## Legal and Compliance

- Only collect metadata needed to locate public job boards.
- Do not bypass authentication, anti-bot controls, or paywalls.
- Respect target site Terms of Service and robots directives where applicable.
- Provide a takedown mechanism in `README.md` for companies requesting correction/removal.

## Seed Data Plan

- Start with the existing ~40-company list as `status=unknown`.
- Prioritize Kenya records first and move non-Kenya records to `watchlist`.
- Promote to `active` after successful validation and evidence capture.

## Growth Strategy

- Phase 1: establish Kenya coverage and contributor workflow quality.
- Phase 2: open East Africa countries after Phase 1 quality thresholds are met.
- Phase 3: open West and Southern Africa.
- Publish monthly validation reports (active/inactive/needs_recheck counts by ATS and country).

## Definition of Done for v1

v1 is complete when all are true:

- 150+ validated entries with at least 60% from Kenya.
- <5% hard-fail rate on weekly validation runs.
- Documented contributor workflow with reproducible CI locally.
- Platform coverage and detection coverage remain aligned.
