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

function runTsScript(scriptPath, env = {}) {
  return spawnSync(process.execPath, ['-r', 'ts-node/register', scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('build-index creates deterministic metadata and sorted entries', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-build-index-'));
  const companiesDir = path.join(tempDir, 'companies');
  fs.mkdirSync(companiesDir, { recursive: true });

  for (const platform of platforms) {
    const content = platform === 'lever'
      ? [
          {
            id: 'beta-ke',
            company: 'Beta',
            ats: 'lever',
            country: 'KE',
            careers_url: 'https://beta.example/careers',
            board_url: 'https://jobs.lever.co/beta',
            platform_metadata: { board_token: 'beta' },
            verification: {
              method: 'manual',
              confidence: 1,
              first_seen_at: '2026-03-01',
              last_checked_at: '2026-03-01',
              last_status_code: 200,
            },
            evidence: {
              detected_from_url: 'https://beta.example/careers',
              resolved_board_url: 'https://jobs.lever.co/beta',
              detection_signals: ['manual-entry'],
            },
          },
          {
            id: 'alpha-ng',
            company: 'Alpha',
            ats: 'lever',
            country: 'NG',
            careers_url: 'https://alpha.example/careers',
            board_url: 'https://jobs.lever.co/alpha',
            platform_metadata: { board_token: 'alpha' },
            verification: {
              method: 'manual',
              confidence: 1,
              first_seen_at: '2026-03-02',
              last_checked_at: '2026-03-02',
              last_status_code: 200,
            },
            evidence: {
              detected_from_url: 'https://alpha.example/careers',
              resolved_board_url: 'https://jobs.lever.co/alpha',
              detection_signals: ['manual-entry'],
            },
          },
        ]
      : [];

    fs.writeFileSync(path.join(companiesDir, `${platform}.json`), `${JSON.stringify(content, null, 2)}\n`);
  }

  const result = runTsScript('scripts/build-index.ts', { COMPANIES_DIR: companiesDir });
  expect(result.status).toBe(0);

  const index = JSON.parse(fs.readFileSync(path.join(companiesDir, 'index.json'), 'utf8'));
  expect(index.generated_at).toBe('2026-03-02T00:00:00.000Z');
  expect(index.total_entries).toBe(2);
  expect(index.entries.map((e) => e.id)).toEqual(['beta-ke', 'alpha-ng']);
});
