import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyBundle, hashFile } from '../scripts/bundle-integrity.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'ahui-adapt-中文-'));
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
let count = 0;
function copy() {
  const destination = path.join(temp,`copy-${++count}`); fs.mkdirSync(destination);
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'bundle-manifest.json'),'utf8'));
  for (const relative of [...Object.keys(manifest.files),'release-manifest.json','bundle-manifest.json']) {
    fs.mkdirSync(path.dirname(path.join(destination,relative)),{recursive:true});
    fs.copyFileSync(path.join(root,relative),path.join(destination,relative));
  }
  return destination;
}
const report = {host:'MOCK doubao-work',environment:'MOCK desktop',reason:'MOCK nested schema adapter test',
  checks:Object.fromEntries(['workflow_tests','compatibility_tests','syntax_and_links','attachment_mapping'].map(k=>[k,{passed:true,evidence:'MOCK test fixture; not real host validation'}]))};
function adapt(dir, data=report) {
  const reportPath = path.join(temp,`report-${count}.json`); fs.writeFileSync(reportPath,JSON.stringify(data));
  return spawnSync(process.execPath,[path.join(dir,'scripts/adapt.mjs'),'--record',reportPath],{encoding:'utf8',timeout:30000,windowsHide:true});
}
test('host adaptation registers interface changes, preserves release baseline and can install',()=>{
  const dir = copy(), baseline = hashFile(path.join(dir,'release-manifest.json'));
  fs.appendFileSync(path.join(dir,'scripts/host-adapter.mjs'),'\n// MOCK local adapter modification\n');
  fs.mkdirSync(path.join(dir,'adapters'),{recursive:true}); fs.writeFileSync(path.join(dir,'adapters/mock-host.mjs'),'export const mock = true;\n');
  assert.throws(()=>verifyBundle(dir),/未登记|变更/);
  const result = adapt(dir); assert.equal(result.status,0,result.stderr);
  const changes = verifyBundle(dir).changed;
  assert.ok(changes.includes('adapters/mock-host.mjs') && changes.includes('scripts/host-adapter.mjs'));
  assert.equal(hashFile(path.join(dir,'release-manifest.json')),baseline);
  const target = path.join(temp,'adapted-installed');
  const installed = spawnSync(process.execPath,[path.join(dir,'scripts/install.mjs'),'--host','doubao-work','--target',target],{encoding:'utf8',timeout:60000,windowsHide:true});
  assert.equal(installed.status,0,installed.stderr);
  assert.deepEqual(verifyBundle(target).changed,changes);
});
test('changing core confirmation workflow cannot be registered as compatibility repair',()=>{
  const dir = copy(); fs.appendFileSync(path.join(dir,'scripts/workflow.mjs'),'\n// MOCK core change\n');
  const result = adapt(dir); assert.equal(result.status,1); assert.match(result.stderr,/核心功能文件不得变更/);
});
test('missing actual validation reports and unregistered later edits are rejected',()=>{
  const dir = copy();
  const invalid=adapt(dir,{...report,checks:{}}); assert.equal(invalid.status,1); assert.match(invalid.stderr,/实际验证/);
  fs.appendFileSync(path.join(dir,'scripts/python-runtime.mjs'),'\n// MOCK compatible runtime change\n');
  assert.equal(adapt(dir).status,0);
  fs.appendFileSync(path.join(dir,'scripts/python-runtime.mjs'),'\n// unregistered change\n');
  assert.throws(()=>verifyBundle(dir),/未登记|变更/);
});
