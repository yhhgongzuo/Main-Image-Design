#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptable, hashFile, safeFile, verifyBundle } from './bundle-integrity.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const need = (ok,message) => { if (!ok) throw Error(message); };
const text = value => typeof value === 'string' && value.trim();
try {
  const [flag, reportPath, ...extra] = process.argv.slice(2);
  need(flag === '--record' && reportPath && !extra.length, 'Usage: node scripts/adapt.mjs --record <actual-validation-report.json>');
  const report = JSON.parse(fs.readFileSync(reportPath,'utf8'));
  need(text(report.host) && text(report.reason) && text(report.environment), 'Record actual host, environment and reason');
  for (const key of ['workflow_tests','compatibility_tests','syntax_and_links','attachment_mapping']) {
    need(report.checks?.[key]?.passed === true && text(report.checks[key].evidence), `实际验证尚未完成：${key}`);
  }
  // A report records host verification; it cannot prove that its claims are true.
  const release = JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
  const files = {}, changed = [];
  for (const [relative,expected] of Object.entries(release.files)) {
    const digest = hashFile(safeFile(root,relative));
    if (digest !== expected) { need(adaptable(relative), `核心功能文件不得变更：${relative}`); changed.push(relative); }
    files[relative] = digest;
  }
  function collect(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      need(!entry.isSymbolicLink(), 'Adaptation links are not supported');
      const file = path.join(dir,entry.name);
      if (entry.isDirectory()) collect(file);
      else {
        const relative = path.relative(root,file).split(path.sep).join('/');
        safeFile(root,relative);
        if (!Object.hasOwn(files,relative)) { files[relative] = hashFile(file); changed.push(relative); }
      }
    }
  }
  collect(path.join(root,'adapters')); collect(path.join(root,'agents'));
  const record = {host:report.host, environment:report.environment,reason:report.reason,checks:report.checks,
    changed_files:changed.sort(),release_manifest_sha256:hashFile(path.join(root,'release-manifest.json')),
    verified_by:'host-agent',real_image_generation_tested:report.real_image_generation_tested === true};
  fs.writeFileSync(path.join(root,'local-adaptation.json'),JSON.stringify(record,null,2)+'\n');
  files['local-adaptation.json'] = hashFile(path.join(root,'local-adaptation.json'));
  fs.writeFileSync(path.join(root,'bundle-manifest.json'),JSON.stringify({...release,files,local_adaptation:true},null,2)+'\n');
  verifyBundle(root);
  console.log(JSON.stringify({status:'adaptation_recorded',changed_files:changed,core_files_unchanged:true,
    note:'仅记录实际宿主验证，哈希校验不等于图片效果一致或平台认证。'}));
} catch(error) { console.error(error.message); process.exitCode=1; }
