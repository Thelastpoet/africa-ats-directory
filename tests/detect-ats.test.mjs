import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();

function runDetect(url) {
  return spawnSync(process.execPath, ['-r', 'ts-node/register', 'scripts/detect-ats.ts', url], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
    },
    encoding: 'utf8',
  });
}

test('detect-ats detects lever from page HTML signal', () => {
  const html = '<html><body><a href="https://jobs.lever.co/acme">Jobs</a></body></html>';
  const url = `data:text/html,${encodeURIComponent(html)}`;
  const result = runDetect(url);
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/Detected ATS: lever/);
  expect(result.stdout).toMatch(/"board_url": "https:\/\/jobs\.lever\.co\/acme"/);
});

test('detect-ats exits with code 1 for invalid input URL', () => {
  const result = runDetect('not-a-url');
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Invalid URL input/);
});
