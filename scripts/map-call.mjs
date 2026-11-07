import fs from 'node:fs';
import { mapToolCall } from './host-adapter.mjs';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
try {
  const [jobPath, capabilityPath, bindingsPath] = process.argv.slice(2);
  if (!jobPath || !capabilityPath) throw new Error('Usage: node scripts/map-call.mjs claimed-job.json capability.json [bindings.json]');
  console.log(JSON.stringify(mapToolCall(read(jobPath), read(capabilityPath), bindingsPath ? read(bindingsPath) : {}), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
