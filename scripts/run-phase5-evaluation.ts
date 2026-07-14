import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  phase5CorpusVersion,
  phase5EvaluationCases,
} from '../packages/answer/src/evaluation-corpus';
import { runPhase5Evaluation } from '../packages/answer/src/evaluation';

const report = await runPhase5Evaluation(
  phase5CorpusVersion,
  phase5EvaluationCases,
);
const reportDirectory = resolve('reports');
const reportPath = resolve(reportDirectory, 'phase5-evaluation-report.json');
await mkdir(reportDirectory, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));
if (!report.criticalGates.passed) {
  console.error(`Phase 5 release gates failed: ${report.criticalGates.failures.join(', ')}`);
  process.exitCode = 1;
}
