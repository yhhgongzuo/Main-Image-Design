import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).filter(e => !['.runtime','__pycache__'].includes(e.name)).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const files = walk(root);
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(pkg.name, 'ahui-main-image-design'); assert.equal(pkg.version,'3.3.1');
assert.equal(pkg.repository,undefined); assert.equal(pkg.dependencies,undefined);
assert.deepEqual(Object.keys(pkg.scripts).sort(),['test','verify']);
const skill = fs.readFileSync(path.join(root,'SKILL.md'),'utf8');
assert.match(skill,/^---\r?\nname: ahui-main-image-design\r?\n/);
assert.match(fs.readFileSync(path.join(root,'agents/openai.yaml'),'utf8'),/display_name: "阿辉的主图设计"/);
for (const file of files) {
  if (file.endsWith('.md')) {
    const content = fs.readFileSync(file,'utf8');
    for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) if (!/^https?:/.test(target)) assert.ok(fs.existsSync(path.resolve(path.dirname(file),target)),`Missing link ${target}`);
  }
  if (file.endsWith('.mjs')) {
    const syntax = spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:15000});
    assert.equal(syntax.status,0,syntax.stderr);
    if (file.includes(`${path.sep}scripts${path.sep}`) && !file.endsWith('verify.mjs')) {
      const content = fs.readFileSync(file,'utf8');
      assert.doesNotMatch(content, /\bfetch\s*\(|https\.request|https\.get|OPENAI_API_KEY|THINKAI|update-from-github|resolve-image-provider/);
      for (const [, target] of content.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(target.startsWith('node:') || (target.startsWith('./') && fs.existsSync(path.resolve(path.dirname(file),target))),`External dependency: ${target}`);
    }
  }
}
console.log(JSON.stringify({status:'pass',files:files.length,syntax:true,links:true,standalone_imports:true,no_network_generation_or_updater:true}));
