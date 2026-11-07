import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const adaptable = relative => [
  'scripts/install.mjs', 'scripts/python-runtime.mjs', 'scripts/image_io.py',
  'scripts/host-adapter.mjs', 'scripts/map-call.mjs', 'agents/openai.yaml',
].includes(relative) || relative.startsWith('adapters/') || relative.startsWith('agents/');
const need = (ok, message) => { if (!ok) throw Error(message); };
export function safeFile(root, relative) {
  need(typeof relative === 'string' && relative && !path.isAbsolute(relative) &&
    !relative.includes('\\') && !relative.split('/').some(p => ['..','.',''].includes(p)), 'Invalid bundle path');
  const file = path.resolve(root,relative);
  need(file.startsWith(path.resolve(root) + path.sep), 'Bundle path escapes root');
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor,part);
    need(!fs.lstatSync(cursor).isSymbolicLink(), 'Bundle links are not supported');
  }
  need(fs.statSync(file).isFile(), `Missing file: ${relative}`);
  return file;
}
export function verifyBundle(root) {
  const current = JSON.parse(fs.readFileSync(path.join(root,'bundle-manifest.json'),'utf8'));
  const release = JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
  need(current.name === release.name && current.version === release.version, 'Bundle identity changed');
  const changed = [];
  for (const [relative, expected] of Object.entries(release.files)) {
    const actual = hashFile(safeFile(root,relative));
    need(current.files[relative] === actual, `文件未登记或已变更：${relative}；环境适配后请运行 adapt.mjs。`);
    if (actual !== expected) { need(adaptable(relative), `核心功能文件不得因平台适配而变更：${relative}`); changed.push(relative); }
  }
  for (const [relative,expected] of Object.entries(current.files)) {
    need(hashFile(safeFile(root,relative)) === expected, `Bundle checksum mismatch: ${relative}`);
    if (!Object.hasOwn(release.files,relative)) {
      need(adaptable(relative) || relative === 'local-adaptation.json', `Unexpected adaptation file: ${relative}`);
      if (relative !== 'local-adaptation.json') changed.push(relative);
    }
  }
  if (changed.length) {
    need(Object.hasOwn(current.files,'local-adaptation.json'), 'Adaptation record required');
    const record = JSON.parse(fs.readFileSync(path.join(root,'local-adaptation.json'),'utf8'));
    need(record.release_manifest_sha256 === hashFile(path.join(root,'release-manifest.json')), 'Release baseline changed');
    need(JSON.stringify([...record.changed_files].sort()) === JSON.stringify(changed.sort()), 'Adaptation inventory mismatch');
  }
  return { manifest: current, changed };
}
