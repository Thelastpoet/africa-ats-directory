import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const platforms = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workable',
  'bamboohr',
  'breezyhr',
  'recruitee',
];

function runValidate(env = {}) {
  return spawnSync(process.execPath, ['-r', 'ts-node/register', 'scripts/validate.ts'], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function createFixture(entry) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-validate-'));
  const companiesDir = path.join(tempDir, 'companies');
  fs.mkdirSync(companiesDir, { recursive: true });

  for (const platform of platforms) {
    const payload = platform === entry.ats ? [entry] : [];
    fs.writeFileSync(path.join(companiesDir, `${platform}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  }

  return { tempDir, companiesDir };
}

test('validate passes with a valid entry when probes are skipped', () => {
  const entry = {
    id: 'tala-ke',
    company: 'Tala',
    ats: 'lever',
    country: 'KE',
    status: 'active',
    careers_url: 'https://tala.co/careers',
    board_url: 'https://jobs.lever.co/tala',
    platform_metadata: { board_token: 'tala' },
    verification: {
      method: 'manual',
      confidence: 1,
      first_seen_at: '2026-03-02',
      last_checked_at: '2026-03-02',
      last_status_code: 200,
    },
    evidence: {
      detected_from_url: 'https://tala.co/careers',
      resolved_board_url: 'https://jobs.lever.co/tala',
      detection_signals: ['manual-entry'],
    },
  };

  const { companiesDir } = createFixture(entry);
  const result = runValidate({
    COMPANIES_DIR: companiesDir,
    SCHEMA_PATH: path.join(repoRoot, 'schema/company-entry.schema.json'),
    SKIP_BOARD_PROBES: '1',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/VALIDATION_SUMMARY hard_errors=0 soft_warnings=0 total_entries=1/);
});

test('validate fails uppercase smartrecruiters org_slug', () => {
  const entry = {
    id: 'visa-ke',
    company: 'Visa',
    ats: 'smartrecruiters',
    country: 'KE',
    status: 'active',
    careers_url: 'https://visa.example/careers',
    board_url: 'https://jobs.smartrecruiters.com/Visa',
    platform_metadata: { org_slug: 'Visa' },
    verification: {
      method: 'manual',
      confidence: 1,
      first_seen_at: '2026-03-02',
      last_checked_at: '2026-03-02',
      last_status_code: 200,
    },
    evidence: {
      detected_from_url: 'https://visa.example/careers',
      resolved_board_url: 'https://jobs.smartrecruiters.com/Visa',
      detection_signals: ['manual-entry'],
    },
  };

  const { companiesDir } = createFixture(entry);
  const result = runValidate({
    COMPANIES_DIR: companiesDir,
    SCHEMA_PATH: path.join(repoRoot, 'schema/company-entry.schema.json'),
    SKIP_BOARD_PROBES: '1',
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/must use lowercase smartrecruiters org_slug/);
});
