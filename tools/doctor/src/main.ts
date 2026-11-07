import { runChecks } from './checks.js';
import { renderTable } from './report.js';

const rows = runChecks();
console.log(renderTable(rows, process.stdout.isTTY));
process.exitCode = rows.some((row) => row.result.status === 'fail') ? 1 : 0;
