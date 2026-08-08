#!/usr/bin/env node
/**
 * designesy.org — automated production deploy + verify pipeline.
 *
 * Eliminates operator stress: one command handles everything.
 *
 *   node scripts/deploy-prod.mjs
 *
 * Pipeline:
 *   1. TypeScript check (tsc --noEmit) — fails fast on type errors
 *   2. Git push to origin/main (triggers Vercel auto-deploy)
 *   3. Poll Vercel API until deployment is Ready
 *   4. Verify production domains (www.designesy.org + designesy.org)
 *      — if not auto-assigned, run `vercel alias` as fallback
 *   5. Smoke test: curl homepage + /score + /pricing, verify 200 + cache headers
 *   6. Print deployment summary with URLs
 *
 * No flags needed. Just run it.
 *
 * Requires: VERCEL_TOKEN env var (or logged-in `vercel` CLI).
 *           Project must be linked (.vercel/project.json present).
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const PROJECT_FILE = `${REPO_ROOT}/.vercel/project.json`;
const PRODUCTION_DOMAINS = ['www.designesy.org', 'designesy.org'];
const SMOKE_TESTS = [
  { path: '/', expect: 200, label: 'Homepage' },
  { path: '/score', expect: 200, label: 'Score page' },
  { path: '/pricing', expect: 200, label: 'Pricing (ISR)' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }
function step(n, msg) { console.log(`\n[${n}/6] ${msg}`); }

function run(cmd, opts = {}) {
  return spawnSync('npx', cmd.split(' '), {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: opts.silent ? 'pipe' : 'inherit',
    ...opts,
  });
}

function getVercelToken() {
  // Try env var first, then CLI token
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const result = run('vercel token', { silent: true });
  if (result.stdout && result.stdout.trim()) return result.stdout.trim();
  return null;
}

async function fetchJSON(url, token) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│  designesy.org — production deploy pipeline        │');
  console.log('└─────────────────────────────────────────────────────┘');

  // Read project config
  let projectId, orgId;
  try {
    const config = JSON.parse(readFileSync(PROJECT_FILE, 'utf-8'));
    projectId = config.projectId;
    orgId = config.orgId;
    ok(`Project linked: ${config.projectName}`);
  } catch {
    fail('Project not linked. Run: npx vercel link --yes --project designesy-org');
  }

  // ── Step 1: TypeScript check ──────────────────────────────────────────────
  step(1, 'TypeScript check');
  const tscResult = run('tsc --noEmit', { silent: true, cwd: `${REPO_ROOT}/apps/site` });
  if (tscResult.status !== 0) {
    console.log(tscResult.stdout || tscResult.stderr);
    fail('TypeScript errors found — fix before deploying');
  }
  ok('TypeScript clean');

  // ── Step 2: Git push ──────────────────────────────────────────────────────
  step(2, 'Git push to origin/main');
  const pushResult = run('git push origin main', {});
  if (pushResult.status !== 0) {
    // Check if it's just "everything up to date"
    const output = (pushResult.stdout || '') + (pushResult.stderr || '');
    if (output.includes('Everything up-to-date')) {
      ok('Already up to date — no new commits to push');
    } else {
      fail('Git push failed');
    }
  } else {
    ok('Pushed to origin/main');
  }

  // ── Step 3: Wait for Vercel build ─────────────────────────────────────────
  step(3, 'Waiting for Vercel deployment');
  const token = getVercelToken();
  if (!token) {
    log('No VERCEL_TOKEN — skipping build polling. Check Vercel dashboard manually.');
    console.log('\n  Production URL: https://www.designesy.org');
    return;
  }

  // Get the latest deployment for this project
  const apiUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${orgId}&limit=1&target=production`;
  let deployment = null;
  let deploymentUrl = null;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max (5s intervals)

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const data = await fetchJSON(apiUrl, token);
      const deps = data.deployments || [];
      if (deps.length > 0) {
        deployment = deps[0];
        deploymentUrl = deployment.url;
        const status = deployment.readyState || deployment.status;

        if (status === 'READY') {
          ok(`Deployment Ready: ${deploymentUrl}`);
          break;
        } else if (status === 'ERROR' || status === 'CANCELED') {
          fail(`Deployment ${status.toLowerCase()}: ${deploymentUrl}`);
        } else {
          // QUEUED, BUILDING, INITIALIZING
          if (attempts === 1) log(`Deployment ${status.toLowerCase()}...`);
          if (attempts % 12 === 0) log(`Still ${status.toLowerCase()} (${attempts * 5}s)...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      } else {
        if (attempts === 1) log('Waiting for deployment to appear...');
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (e) {
      if (attempts === 1) log(`API error, retrying: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  if (!deployment || deployment.readyState !== 'READY') {
    fail('Deployment did not become Ready within 10 minutes. Check Vercel dashboard.');
  }

  // ── Step 4: Verify production domains ────────────────────────────────────
  step(4, 'Verifying production domains');
  const aliases = deployment.alias || deployment.aliases || [];
  const aliasUrls = aliases.map(a => (typeof a === 'string' ? a : a.alias || a.domain)).filter(Boolean);

  const missingDomains = PRODUCTION_DOMAINS.filter(d => !aliasUrls.includes(d));

  if (missingDomains.length === 0) {
    ok('Production domains auto-assigned');
  } else {
    log(`Domains not auto-assigned: ${missingDomains.join(', ')}`);
    log('Running vercel alias as fallback...');

    for (const domain of missingDomains) {
      const aliasResult = run(`vercel alias ${deploymentUrl} ${domain}`, {});
      if (aliasResult.status === 0) {
        ok(`Aliased ${domain} → ${deploymentUrl}`);
      } else {
        fail(`Failed to alias ${domain}`);
      }
    }
  }

  // ── Step 5: Smoke test ────────────────────────────────────────────────────
  step(5, 'Smoke testing production');
  await new Promise(r => setTimeout(r, 10000)); // 10s CDN propagation delay

  for (const test of SMOKE_TESTS) {
    try {
      const resp = await fetch(`https://www.designesy.org${test.path}`, {
        headers: { 'User-Agent': 'DesignesyDeployBot/1.0' },
        redirect: 'follow',
      });
      const cacheStatus = resp.headers.get('x-vercel-cache') || 'N/A';
      if (resp.status === test.expect) {
        ok(`${test.label}: ${resp.status} (${cacheStatus})`);
      } else {
        fail(`${test.label}: expected ${test.expect}, got ${resp.status}`);
      }
    } catch (e) {
      fail(`${test.label}: ${e.message}`);
    }
  }

  // ── Step 6: Summary ───────────────────────────────────────────────────────
  step(6, 'Deployment summary');
  console.log(`\n  ┌─────────────────────────────────────────────────────┐`);
  console.log(`  │  ✓ TypeScript: clean                                 │`);
  console.log(`  │  ✓ Git push: origin/main                             │`);
  console.log(`  │  ✓ Vercel build: Ready                               │`);
  console.log(`  │  ✓ Domains: www.designesy.org + designesy.org        │`);
  console.log(`  │  ✓ Smoke test: all routes 200 OK                     │`);
  console.log(`  └─────────────────────────────────────────────────────┘`);
  console.log(`\n  Production: https://www.designesy.org`);
  console.log(`  Deployment: ${deploymentUrl}`);
  console.log(`  Build ID:   ${deployment.id || 'N/A'}\n`);
}

main().catch(err => fail(`Unexpected error: ${err.message}`));