// designesy/contract-check — composite Action entrypoint.
// Calls the Designesy scoring engine (POST {api}/api/score), parses the numeric
// score and letter grade from the response, and fails the step when either drops
// below the configured threshold. Emits outputs + a GitHub Job Summary.
//
// No external deps — Node 20 built-ins only so the composite Action needs no
// bundler or node_modules. See ../action.yml for input/output definitions.

const GRADE_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1 };

function readInput(name, fallback) {
  // GitHub sets INPUT_<NAME with - and space -> _> env vars for each input.
  const key = `INPUT_${name.replace(/[\s-]/g, '_').toUpperCase()}`;
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function writeOutput(name, value) {
  const outPath = process.env.GITHUB_OUTPUT;
  if (outPath) {
    require('node:fs').appendFileSync(outPath, `${name}=${value}\n`);
  } else {
    console.log(`::set-output name=${name}::${value}`);
  }
}

function appendSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) require('node:fs').appendFileSync(summaryPath, markdown);
}

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exitCode = 1;
}

function normalizeGrade(g) {
  return String(g || '').trim().toUpperCase().charAt(0);
}

async function main() {
  const url = readInput('url', '');
  const minScore = parseFloat(readInput('min-score', '0'));
  const minGradeRaw = normalizeGrade(readInput('min-grade', ''));
  const api = readInput('api', 'https://www.designesy.org').replace(/\/$/, '');
  const failOnError = String(readInput('fail-on-error', 'true')) !== 'false';

  if (!url) {
    fail('Input "url" is required.');
    return;
  }
  if (minGradeRaw && !(minGradeRaw in GRADE_RANK)) {
    fail(`Input "min-grade" must be one of A, B, C, D, F (got "${minGradeRaw}").`);
    return;
  }

  console.log(`Scoring ${url} against the Designesy design contract (${api}/api/score)…`);

  let body;
  try {
    const res = await fetch(`${api}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url }),
    });
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    if (!res.ok || body.ok === false) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  } catch (e) {
    const msg = `Scoring engine error for ${url}: ${e.message}`;
    if (failOnError) { fail(msg); } else { console.warn(`::warning::${msg}`); }
    return;
  }

  const score = typeof body.score === 'number' ? body.score : NaN;
  const grade = normalizeGrade(body.grade);
  const pass = body.pass ?? 0;
  const failC = body.fail ?? 0;
  const warn = body.warn ?? 0;
  const skip = body.skip ?? 0;
  const total = body.total ?? 0;
  const a11yFloor = !!body.a11yFloorApplied;

  if (Number.isNaN(score) || !grade) {
    const msg = `Engine response missing score/grade for ${url}.`;
    if (failOnError) { fail(msg); } else { console.warn(`::warning::${msg}`); }
    return;
  }

  // Outputs
  writeOutput('score', String(score));
  writeOutput('grade', grade);
  writeOutput('pass-count', String(pass));
  writeOutput('fail-count', String(failC));
  writeOutput('result', JSON.stringify(body));

  // Console + Job Summary
  const verdict = [];
  let breach = false;

  if (minScore > 0 && score < minScore) {
    breach = true;
    verdict.push(`score ${score} is below the ${minScore} floor`);
  }
  if (minGradeRaw && GRADE_RANK[grade] < GRADE_RANK[minGradeRaw]) {
    breach = true;
    verdict.push(`grade ${grade} is worse than the ${minGradeRaw} minimum`);
  }

  const md = [
    `## Designesy Contract Check`,
    ``,
    `| URL | Score | Grade | Pass / Warn / Fail / Skip | a11y floor |`,
    `|---|---|---|---|---|`,
    `| ${url} | **${score}** | **${grade}** | ${pass} / ${warn} / ${failC} / ${skip} (of ${total}) | ${a11yFloor ? 'applied (capped at C)' : '—'} |`,
    ``,
    breach
      ? `❌ **Quality gate failed** — ${verdict.join('; ')}.`
      : `✅ **Quality gate passed** — ${url} meets the design-contract threshold.`,
    ``,
    `<sub>Engine: ${api} · 34-check deterministic design-contract verification · full result in the \`result\` step output.</sub>`,
  ].join('\n');
  appendSummary(md);

  console.log(`Score ${score} (${grade}) — pass ${pass}, warn ${warn}, fail ${failC}, skip ${skip}.`);
  if (breach) {
    fail(`Design contract check failed for ${url}: ${verdict.join('; ')}.`);
  } else {
    console.log('Design contract check passed.');
  }
}

main().catch((e) => fail(`Unhandled error: ${e.message}`));
