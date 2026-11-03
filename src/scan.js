import { runScan } from './scanner.js';

try {
  await runScan({ dryRun: process.argv.includes('--dry-run') });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
