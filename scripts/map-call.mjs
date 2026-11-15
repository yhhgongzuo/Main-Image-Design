import fs from 'node:fs';
import path from 'node:path';
import { mapToolCall } from './host-adapter.mjs';
import { commandReceipt } from './result-output.mjs';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
try {
  const [jobPath, capabilityPath, bindingsPath] = process.argv.slice(2);
  if (!jobPath || !capabilityPath) throw new Error('Usage: node scripts/map-call.mjs claimed-job.json capability.json [bindings.json]');
  const parent = path.dirname(path.resolve(jobPath));
  const run = path.basename(parent) === 'tool-results' ? path.dirname(parent) : parent;
  console.log(JSON.stringify(commandReceipt('map-call', mapToolCall(read(jobPath), read(capabilityPath), bindingsPath ? read(bindingsPath) : {}), run), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
