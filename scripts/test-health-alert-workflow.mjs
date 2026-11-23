#!/usr/bin/env node
/**
 * The health alert probe's regression test.
 *
 * `.github/workflows/health-alert.yml` is the only thing that turns a stopped
 * repair path into something a person sees, and it runs on cron: nothing turns
 * a pull request red when its branch logic breaks. actionlint proves it parses;
 * this executes it. The step's `run:` block is read out of the workflow rather
 * than copied, so the assertions below always describe the code that actually
 * runs at the scheduled time.
 *
 * `curl` and `gh` are faked and answer from the case; `jq` is real, because the
 * probe's JSON gate is one of the parts that fails quietly. What is asserted is
 * the decision each status produces — one issue that names the down checks, an
 * already-open issue left alone, a close on recovery, and silence for a 404 —
 * because those are the branches that decide whether anyone hears about it.
 *
 *   node scripts/test-health-alert-workflow.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowFile = path.join(root, '.github', 'workflows', 'health-alert.yml');

/** Pulls one step's `run: |` block out of the workflow by indentation. */
function readProbeStep(yaml) {
  const lines = yaml.split(/\r?\n/);
  const stepAt = lines.indexOf('      - name: Raise or clear the alert');
  if (stepAt === -1) {
    throw new Error('health-alert.yml no longer has a "Raise or clear the alert" step');
  }
  const runAt = lines.findIndex((line, at) => at > stepAt && line === '        run: |');
  if (runAt === -1) {
    throw new Error('the probe step no longer starts with "run: |"');
  }
  const keys = lines
    .slice(stepAt + 1, runAt)
    .map((line) => line.match(/^ {8}([\w-]+):\s*(.*)$/))
    .filter((found) => found !== null)
    .map((found) => ({ name: found[1], value: found[2] }));
  const script = [];
  for (let at = runAt + 1; at < lines.length; at += 1) {
    const line = lines[at];
    // Blank lines are paragraph breaks inside the script; anything dedented
    // again ends it, either way at the next step.
    if (line.trim() === '') {
      script.push('');
      continue;
    }
    if (!line.startsWith('          ')) break;
    script.push(line.slice(10));
  }
  while (script.at(-1) === '') script.pop();
  return { script, keys };
}

/** The workflow's own env block, so the URL and label are not restated here. */
function workflowEnv(yaml, key) {
  const found = yaml.match(new RegExp(`^ {2}${key}:\\s*(\\S.*)$`, 'm'));
  if (found === null) throw new Error(`health-alert.yml has no ${key} in its env block`);
  return found[1].trim();
}

/** A top-level two-space-indented `key: value` block, such as the permissions map. */
function blockMap(yamlText, name) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.indexOf(`${name}:`);
  const map = {};
  if (start === -1) return map;
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at];
    if (line.trim() === '') continue;
    if (!line.startsWith('  ')) break;
    const found = line.match(/^ {2}([\w-]+):\s*(.*)$/);
    if (found !== null) map[found[1]] = found[2].trim();
  }
  return map;
}

/** The cron entries under `on: schedule:`, comments skipped. */
function scheduledCrons(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.indexOf('  schedule:');
  const crons = [];
  if (start === -1) return crons;
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!line.startsWith('    ')) break;
    const found = trimmed.match(/^- cron:\s*'?([^']+?)'?$/);
    if (found !== null) crons.push(found[1].trim());
  }
  return crons;
}

const yaml = fs.readFileSync(workflowFile, 'utf8');
const { script, keys } = readProbeStep(yaml);
const alertUrl = workflowEnv(yaml, 'ALERT_URL');
const alertLabel = workflowEnv(yaml, 'ALERT_LABEL');

for (const tool of ['bash', 'jq']) {
  const found = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  if (found.error !== undefined || found.status !== 0) {
    console.error(`This test needs ${tool} on PATH; the probe runs in bash and parses with jq.`);
    process.exit(1);
  }
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-alert-'));
const binDir = path.join(workDir, 'bin');
const ghLog = path.join(workDir, 'gh.log');
const curlLog = path.join(workDir, 'curl.log');
const scriptFile = path.join(workDir, 'probe.sh');

fs.mkdirSync(binDir);
fs.writeFileSync(scriptFile, `${script.join('\n')}\n`);

/** Git Bash speaks POSIX paths; CI already does. */
function toPosix(value) {
  if (process.platform !== 'win32') return value;
  const converted = spawnSync('bash', ['-c', 'cygpath -u "$1"', 'sh', value], { encoding: 'utf8' });
  const convertedPath = (converted.stdout ?? '').trim();
  return converted.status === 0 && convertedPath !== '' ? convertedPath : value;
}

/** Writes an executable stand-in for a command the probe shells out to. */
function stub(name, body) {
  fs.writeFileSync(path.join(binDir, name), body, { mode: 0o755 });
}

stub(
  'curl',
  `#!/usr/bin/env bash
# Records the request and answers with the status and body the case supplied.
printf '%s\\n' "$*" >> "$FAKE_CURL_LOG"
out=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$out" ] && printf '%s' "\${FAKE_CURL_BODY:-}" > "$out"
printf '%s' "\${FAKE_CURL_STATUS:-000}"
exit "\${FAKE_CURL_EXIT:-0}"
`,
);

stub(
  'gh',
  `#!/usr/bin/env bash
# Records every call on one line, so a multi-line issue body stays attached
# to the call that carried it.
printf '%s\\n' "$*" | tr '\\n' ' ' >> "$FAKE_GH_LOG"
echo >> "$FAKE_GH_LOG"
case "$1 $2" in
  'issue list') printf '%s' "\${FAKE_GH_OPEN_ISSUE:-}" ;;
esac
exit 0
`,
);

/** Runs the probe once, with one case's answers, and reports what it did. */
function probe({ status, body = '', exitCode = 0, open = '' }) {
  fs.writeFileSync(ghLog, '');
  fs.writeFileSync(curlLog, '');
  const result = spawnSync('bash', [toPosix(scriptFile)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${toPosix(binDir)}${path.delimiter}${process.env.PATH ?? ''}`,
      RUNNER_TEMP: toPosix(workDir),
      ALERT_URL: alertUrl,
      ALERT_LABEL: alertLabel,
      GH_TOKEN: 'token-the-fakes-never-check',
      FAKE_GH_LOG: toPosix(ghLog),
      FAKE_GH_OPEN_ISSUE: open,
      FAKE_CURL_LOG: toPosix(curlLog),
      FAKE_CURL_STATUS: status,
      FAKE_CURL_BODY: body,
      FAKE_CURL_EXIT: String(exitCode),
    },
  });
  return {
    code: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    gh: fs.readFileSync(ghLog, 'utf8'),
    curl: fs.readFileSync(curlLog, 'utf8'),
  };
}

/** The issue writes the probe made; `issue list` is read-only and ignored. */
function mutations(log) {
  return log
    .split('\n')
    .filter((line) => line.startsWith('issue create') || line.startsWith('issue close'));
}

const scriptText = script.join('\n');

const results = [];

/** Records one assertion; a throw is a failure with the reason, not a crash. */
function check(name, assert) {
  try {
    const { ok, detail } = assert();
    results.push({ name, ok, detail });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

const json = (value) => JSON.stringify(value);
const retentionDown = json({
  status: 'down',
  down: ['accountRetention'],
  checkedAt: '2026-11-21T15:02:11.000Z',
});
const multiDown = json({
  status: 'down',
  down: ['pushDispatch', 'accountRetention'],
  checkedAt: '2026-11-21T15:02:11.000Z',
});
const healthy = json({ status: 'ok', down: [], checkedAt: '2026-11-21T15:02:11.000Z' });

check('the step under test is the deployed probe script', () => ({
  ok:
    scriptText.includes('set -euo pipefail') &&
    scriptText.includes('gh issue create') &&
    scriptText.includes('$ALERT_URL'),
  detail: `${script.length} lines read from health-alert.yml`,
}));

// The branches below can all be right while the workflow never runs: no trigger
// means no probe, and no `issues: write` means every gh call is refused. Both
// failures are silent, so the shape of the workflow is asserted too.
check('still fires on its cron schedule', () => {
  const crons = scheduledCrons(yaml);
  const expected = '*/30 * * * *';
  return {
    ok: crons.length === 1 && crons[0] === expected,
    detail:
      crons.length === 0
        ? 'no schedule trigger: the probe would only ever run by hand'
        : `${crons.join(', ')}${crons[0] === expected ? '' : ` (expected ${expected})`}`,
  };
});

check('still allowed to open and close issues', () => {
  const permissions = blockMap(yaml, 'permissions');
  return {
    ok: permissions.issues === 'write',
    detail:
      permissions.issues === undefined
        ? 'no issues permission: gh issue create would be refused'
        : `issues: ${permissions.issues}`,
  };
});

/** The probe job's own keys, up to its `steps:`; null when the job is gone. */
function probeJobKeys(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.indexOf('  probe:');
  if (start === -1) return null;
  const keys = [];
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!line.startsWith('    ')) break;
    if (line === '    steps:') break;
    keys.push(line);
  }
  return keys;
}

// An `if:` on the step or on its job stops the probe before the first line of
// the script, leaving every branch assertion above green and nobody alerted.
check('the probe step cannot be skipped by a condition', () => {
  const onStep = keys.find((key) => key.name === 'if');
  const jobKeys = probeJobKeys(yaml);
  const onJob = jobKeys?.find((line) => /^ {4}if:/.test(line));
  return {
    ok: onStep === undefined && onJob === undefined,
    detail:
      onStep !== undefined
        ? `the step carries if: ${onStep.value}, so the probe can be skipped`
        : onJob !== undefined
          ? `the job carries ${onJob.trim()}, so the probe can be skipped`
          : 'no if: on the step or its job',
  };
});

check('names the URL and label the workflow configures', () => {
  const run = probe({ status: '200', body: healthy });
  return {
    ok: run.curl.includes(alertUrl) && run.gh.includes(alertLabel),
    detail: run.curl.trim() === '' ? 'curl was never called' : `asked for ${alertUrl}`,
  };
});

check('opens one issue naming the stopped check', () => {
  const run = probe({ status: '503', body: retentionDown });
  const calls = mutations(run.gh);
  const created = calls.filter((line) => line.startsWith('issue create'));
  const titled = created[0]?.includes('Repair path down: accountRetention') === true;
  const runbook = created[0]?.includes('docs/ops/alerting.md') === true;
  return {
    ok: run.code === 0 && created.length === 1 && titled && runbook,
    detail:
      created.length === 1
        ? `exit ${run.code}, title ${titled ? 'names it' : 'missing it'}, runbook ${runbook ? 'linked' : 'missing'}`
        : `exit ${run.code}, issue writes: ${calls.length === 0 ? 'none' : calls.join(' | ')}`,
  };
});

check('names every stopped check in the title', () => {
  const run = probe({ status: '503', body: multiDown });
  const created = mutations(run.gh).filter((line) => line.startsWith('issue create'));
  return {
    ok:
      created.length === 1 &&
      created[0].includes('Repair path down: pushDispatch, accountRetention'),
    detail:
      created.length === 1
        ? 'both names in the title'
        : `exit ${run.code}, ${created.length} created`,
  };
});

check('leaves an already-open issue alone', () => {
  const run = probe({ status: '503', body: retentionDown, open: '42' });
  const calls = mutations(run.gh);
  return {
    ok: run.code === 0 && calls.length === 0 && run.output.includes('still down: accountRetention'),
    detail: calls.length === 0 ? 'no new issue, no comment' : `issue writes: ${calls.join(' | ')}`,
  };
});

check('closes the issue on the first healthy probe', () => {
  const run = probe({ status: '200', body: healthy, open: '42' });
  const closed = mutations(run.gh).filter((line) => line.startsWith('issue close 42'));
  return {
    ok: run.code === 0 && closed.length === 1 && run.output.includes('probe healthy'),
    detail: closed.length === 1 ? 'issue 42 closed' : `exit ${run.code}, gh: ${run.gh.trim()}`,
  };
});

check('stays quiet when healthy with nothing open', () => {
  const run = probe({ status: '200', body: healthy });
  const calls = mutations(run.gh);
  return {
    ok: run.code === 0 && calls.length === 0,
    detail: calls.length === 0 ? 'no issue writes' : `issue writes: ${calls.join(' | ')}`,
  };
});

check('treats a 404 as not deployed yet', () => {
  const run = probe({ status: '404', body: json({ message: 'Not Found' }) });
  const calls = mutations(run.gh);
  return {
    ok: run.code === 0 && calls.length === 0 && run.output.includes('not deployed'),
    detail: calls.length === 0 ? 'silent' : `issue writes: ${calls.join(' | ')}`,
  };
});

check('alerts when the API never answers', () => {
  const run = probe({ status: '000', exitCode: 28 });
  const created = mutations(run.gh).filter((line) => line.startsWith('issue create'));
  return {
    ok: created.length === 1 && created[0].includes('(HTTP 000)'),
    detail:
      created.length === 1 ? 'issue names HTTP 000' : `exit ${run.code}, created ${created.length}`,
  };
});

check('alerts when a 503 is not the alert payload', () => {
  const run = probe({ status: '503', body: '<html><body>Service Unavailable</body></html>' });
  const created = mutations(run.gh).filter((line) => line.startsWith('issue create'));
  return {
    ok: created.length === 1 && created[0].includes('did not answer its alert probe (HTTP 503)'),
    detail:
      created.length === 1
        ? 'generic detail, still raised'
        : `exit ${run.code}, created ${created.length}`,
  };
});

check('alerts when a 503 names no stopped check', () => {
  const run = probe({ status: '503', body: json({ status: 'down', down: [] }) });
  const created = mutations(run.gh).filter((line) => line.startsWith('issue create'));
  return {
    ok: created.length === 1 && created[0].includes('did not answer its alert probe (HTTP 503)'),
    detail:
      created.length === 1
        ? 'empty down list still raised'
        : `exit ${run.code}, created ${created.length}`,
  };
});

fs.rmSync(workDir, { recursive: true, force: true });

const failed = results.filter((result) => !result.ok);

console.log('Health alert workflow');
for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'} ${result.name.padEnd(48)} ${result.detail}`);
}

if (failed.length > 0) {
  console.log(`\n${failed.length} of ${results.length} checks failed.`);
} else {
  console.log(`\nAll ${results.length} checks passed.`);
}

process.exit(failed.length === 0 ? 0 : 1);
