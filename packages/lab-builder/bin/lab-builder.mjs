#!/usr/bin/env node
// @designesy/lab-builder — scaffold a Designesy Lab from a thesis.
//
// A Lab is a controlled design experiment where a principle becomes
// visible, testable, remixable, and reviewable. This CLI generates the
// full Lab anatomy so the experiment earns its way into the contract
// by naming its useful behavior (the promotion rule).
//
// Zero dependencies — Node built-ins only (house pattern).
//
// Usage:
//   npx @designesy/lab-builder init <lab-name> --thesis "..." [--tokens]
//   npx @designesy/lab-builder list
//   npx @designesy/lab-builder verify <lab-dir>
import { scaffoldLab, listLabs, verifyLab, LAB_ANATOMY } from '../src/index.js';

function printHelp() {
  console.log(`
@designesy/lab-builder — experiments that compile into contracts

Usage:
  lab-builder init <lab-name> --thesis "<thesis>" [options]
  lab-builder list                          # labs in the registry
  lab-builder verify <lab-dir>              # check lab anatomy completeness

Options:
  --tokens        also scaffold a DTCG-style tokens.json stub
  --slug <slug>   override the lab slug (default: kebab-case of name)
  --dir <dir>     output directory (default: ./labs)

A mature Lab anatomy (what this scaffolds):
${LAB_ANATOMY.map((a) => `  - ${a}`).join('\n')}

Examples:
  lab-builder init poise --thesis "Press states should feel alive, not just darker"
  lab-builder init cadence --thesis "Type rhythm is the layout" --tokens
`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const [command, ...rest] = argv;

  if (command === 'init') {
    const name = rest.find((a) => !a.startsWith('--'));
    const getOpt = (flag) => {
      const i = rest.indexOf(flag);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    const thesis = getOpt('--thesis');
    if (!name || !thesis) {
      console.error('Usage: lab-builder init <lab-name> --thesis "<thesis>"');
      process.exit(2);
    }
    const result = await scaffoldLab({
      name,
      thesis,
      slug: getOpt('--slug'),
      dir: getOpt('--dir') || './labs',
      withTokens: rest.includes('--tokens'),
    });
    console.log(`\n✓ Lab scaffolded: ${result.path}`);
    console.log(`  anatomy: ${result.files.length} files generated`);
    console.log('\nNext: open the generated files, build the live artifact,');
    console.log('then run `lab-builder verify <lab-dir>` to confirm the anatomy.');
    process.exit(0);
  }

  if (command === 'list') {
    const labs = await listLabs(rest[0] || './labs');
    if (labs.length === 0) {
      console.log('No labs found in the registry.');
    } else {
      console.log(`Lab registry (${labs.length}):`);
      for (const lab of labs) console.log(`  - ${lab.name} (${lab.slug})`);
    }
    process.exit(0);
  }

  if (command === 'verify') {
    const dir = rest[0];
    if (!dir) {
      console.error('Usage: lab-builder verify <lab-dir>');
      process.exit(2);
    }
    const report = await verifyLab(dir);
    const pass = report.filter((r) => r.status === 'ok').length;
    const missing = report.filter((r) => r.status === 'missing');
    console.log(`\nLab anatomy check — ${pass}/${report.length} present`);
    if (missing.length > 0) {
      console.log('Missing:');
      for (const m of missing) console.log(`  - ${m.artifact} (${m.path})`);
      process.exit(1);
    }
    console.log('Complete anatomy. The lab is ready for review.');
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
