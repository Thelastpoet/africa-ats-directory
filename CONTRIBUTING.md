# Contributing to Africa ATS Directory

This repository accepts evidence-backed ATS mappings that pass schema and validation checks.

## Prerequisites

- Node.js 18+
- pnpm 8+

## Add or Update an Entry

1. Detect ATS from careers URL (optional but recommended):

```bash
pnpm detect https://example.com/careers
```

2. Add the entry to the matching file in `companies/`:

- `greenhouse` -> `companies/greenhouse.json`
- `lever` -> `companies/lever.json`
- `ashby` -> `companies/ashby.json`
- `smartrecruiters` -> `companies/smartrecruiters.json`
- `workable` -> `companies/workable.json`
- `bamboohr` -> `companies/bamboohr.json`
- `breezyhr` -> `companies/breezyhr.json`
- `recruitee` -> `companies/recruitee.json`

3. Run checks locally:

```bash
pnpm validate
pnpm build-index
```

4. Commit your platform file change and updated `companies/index.json`.
5. Open a PR and include brief evidence notes.

## Schema Contract

Required top-level fields:

- `id`
- `company`
- `ats`
- `country`
- `careers_url`
- `board_url`
- `platform_metadata`
- `verification`
- `evidence`

Recommended additional fields:

- `city`
- `sector`
- `sector_raw`
- `status`
- `source`

Reference schema:

- `schema/company-entry.schema.json`

## Field Rules

- `id`: `{slug}-{country-code-lower}` (example: `tala-ke`).
- `country`: ISO alpha-2 uppercase (example: `KE`).
- `status`: `active`, `inactive`, `unknown`, or `watchlist`.
- `sector`: one of `fintech`, `healthtech`, `edtech`, `ecommerce`, `logistics`, `ngo`, `climate`, `agritech`, `enterprise-software`, `other`.

## Platform Metadata Rules

`platform_metadata` must contain exactly one ATS-specific key:

- `greenhouse`, `lever`, `ashby` -> `board_token`
- `smartrecruiters` -> `org_slug`
- `workable` -> `account_slug`
- `bamboohr`, `breezyhr`, `recruitee` -> `subdomain`

## Validation Behavior

`pnpm validate` runs two stages:

1. Schema and consistency checks
- Valid JSON schema per entry
- Unique IDs across all files
- `ats` value must match the platform file
- Correct `platform_metadata` key for the ATS

2. Board activity checks
- Timeout: 8 seconds
- Retries: 2 (backoff: 1 second, then 2 seconds)
- Entries marked `status: "inactive"` are skipped for live board probes
- Soft-fail (warning): `403`, `429`, temporary DNS/network issues, transient server errors
- Hard-fail (CI blocking): malformed URLs, schema errors, duplicate IDs, wrong platform file, persistent `404`, final URL mismatch with expected ATS board identity

## PR Acceptance Criteria

A PR is mergeable when:

- Validation has no hard-fails.
- `companies/index.json` is regenerated and committed.
- Entry evidence supports the ATS mapping and confidence.
- Non-Phase-1 countries are marked `status: "watchlist"`.

## Legal and Data Policy

- Only submit public job board metadata.
- Do not bypass authentication or anti-bot controls.
- Respect site terms and applicable robots directives.
- If a company requests correction or removal, open an issue or PR promptly.

## Optional: Enable Local Pre-commit Hook

To run fast checks before each commit:

```bash
pnpm run setup-hooks
```

This configures Git to use `.githooks/pre-commit`, which runs:

- `pnpm test`
- `SKIP_BOARD_PROBES=1 pnpm validate`
- `pnpm build-index` and index freshness check
