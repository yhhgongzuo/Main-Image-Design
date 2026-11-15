import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const artifactCommands = new Set(['init', 'style-preview', 'style', 'preview', 'ready', 'compile', 'handoff', 'claim', 'hd-batch', 'hd-claim', 'composite-revise', 'copy-preview', 'map-call']);

// Full task data stays on disk; only a small receipt crosses the display channel.
export function commandReceipt(command, result, run) {
  if (!artifactCommands.has(command)) return result;
  const directory = run || result.run_dir;
  const folder = path.join(directory, 'tool-results');
  fs.mkdirSync(folder, { recursive: true });
  const data = JSON.stringify(result, null, 2) + '\n';
  const resultPath = path.join(folder, `${command}-${randomUUID()}.json`);
  fs.writeFileSync(resultPath, data, { flag: 'wx' });
  const receipt = { command, status: result.status || 'recorded', result_path: resultPath,
    result_bytes: Buffer.byteLength(data), result_sha256: createHash('sha256').update(data).digest('hex') };
  for (const key of ['run_dir', 'id', 'version', 'digest', 'revision', 'index', 'attempt', 'max_concurrency']) if (result[key] != null) receipt[key] = result[key];
  if (typeof result.preview === 'string') {
    const previewPath = resultPath.replace(/\.json$/, '.md');
    fs.writeFileSync(previewPath, result.preview, { flag: 'wx' });
    receipt.preview_path = previewPath;
    receipt.preview_characters = result.preview.length;
  }
  if (result.tool_arguments || result.arguments) receipt.task_path = resultPath;
  if (result.jobs) receipt.jobs = result.jobs.map(job => ({ index: job.index, attempt: job.attempt, job_id: job.id,
    task_path: job.index ? path.join(directory, `hd-${job.index}-${job.attempt}-claim.json`) : undefined,
    prompt_path: job.prompt_path ? path.join(directory, job.prompt_path) : undefined }));
  return receipt;
}
