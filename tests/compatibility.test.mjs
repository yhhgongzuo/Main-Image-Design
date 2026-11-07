import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mapToolCall, validateCapability, chooseImageModel } from '../scripts/host-adapter.mjs';
import { dispatchNativeBatch } from '../scripts/hd-workflow.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'ahui-share-中文 空格-'));
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const product = path.join(temp,'产品 原图.png'); fs.writeFileSync(product,'mock bytes for binding tests');
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(product)).digest('hex');
const cap = {adapter:'host-tool-v1',host:'mock-agent',available:true,configured:true,tool:'mock_image_edit',reference_image_editing:true,explicit_image_binding:true,schema_evidence:'MOCK schema',image_input:'file_ids',supported_fields:['text','refs','model','quality','ratio'],fields:{prompt:'text',images:'refs',model:'model',quality:'quality'},selection:{model:'mock-best',quality:'high',evidence:'MOCK documented quality comparison'},extra_arguments:{ratio:'2:3'},max_concurrency:2};
const job = {tool_arguments:{prompt:'Exact approved copy',referenced_image_paths:[product],transparent_background:false}};

test('maps real upload IDs without losing prompt, model, or reference order',()=>{
  const bindings = {[product]:{value:'uploaded-123',sha256,upload_evidence:'MOCK upload response'}};
  assert.deepEqual(mapToolCall(job,cap,bindings),{tool:'mock_image_edit',arguments:{ratio:'2:3',text:'Exact approved copy',refs:['uploaded-123'],model:'mock-best',quality:'high'}});
  assert.throws(()=>mapToolCall(job,cap,{}),/binding/);
  assert.throws(()=>mapToolCall(job,cap,{[product]:{...bindings[product],sha256:'wrong'}}),/binding/);
});
test('unsupported parameters, implicit images and unconfigured services are rejected',()=>{
  for(const change of [{configured:false},{reference_image_editing:false},{explicit_image_binding:false},{fields:{prompt:'text',images:'made_up'}},{extra_arguments:{text:'override'}},{max_concurrency:0}])
    assert.throws(()=>validateCapability({...cap,...change}));
  assert.throws(()=>mapToolCall(job,{...cap,image_input:'urls'},{[product]:{value:'http://invalid',sha256,upload_evidence:'MOCK'}}),/HTTPS/);
});
test('native schema stays unchanged and configured path tools are supported',()=>{
  assert.deepEqual(mapToolCall(job,{available:true,tool:'image_gen__imagegen',explicit_image_paths:true}).arguments,job.tool_arguments);
  assert.deepEqual(mapToolCall(job,{...cap,image_input:'paths'}).arguments.refs,[product]);
});
test('model selection excludes unavailable/text-only tools and does not invent rankings',()=>{
  const base = {available:true,configured:true,reference_image_editing:true,explicit_image_binding:true,evidence:'MOCK comparison'};
  assert.equal(chooseImageModel([{...base,id:'fast',quality_rank:1},{...base,id:'quality',quality_rank:3},{...base,id:'text-only',reference_image_editing:false,quality_rank:10}]).id,'quality');
  assert.throws(()=>chooseImageModel([{...base,id:'unknown-a'},{...base,id:'unknown-b'}]),/质量比较/);
  assert.throws(()=>chooseImageModel([{...base,id:'offline',available:false}]),/没有/);
});
test('queue respects tool concurrency, preserves result order and never retries failures',async()=>{
  const jobs = Array.from({length:6},(_,i)=>({index:i+1,attempt:1,tool_arguments:{}}));
  let running=0, peak=0; const calls=[],saved=[];
  const settled=await dispatchNativeBatch(jobs,async(_,j)=>{
    calls.push(j.index); peak=Math.max(peak,++running);
    await new Promise(resolve=>setTimeout(resolve,5*(7-j.index)));
    running--; if(j.index===3) throw Error('MOCK failure'); return j.index;
  },async(j,value)=>saved.push([j.index,value]),2);
  assert.equal(peak,2); assert.equal(calls.length,6); assert.equal(new Set(calls).size,6);
  assert.equal(settled[2].status,'rejected'); assert.equal(settled[5].value.index,6);
  assert.equal(saved.length,5);
  await assert.rejects(dispatchNativeBatch(jobs,()=>{},()=>{},0),/concurrency/);
});

const install = (...args) => spawnSync(process.execPath,[path.join(root,'scripts/install.mjs'),...args],{encoding:'utf8',timeout:60000,windowsHide:true});
test('Chinese-path install, repeat install, conflicting upgrade backup and installed runtime',()=>{
  const target = path.join(temp,'安装 目录','skills','ahui-main-image-design');
  const result=install('--host','other','--target',target); assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).status,'installed');
  assert.equal(JSON.parse(result.stdout).image_generation_checked,false);
  assert.ok(fs.existsSync(path.join(target,'SKILL.md')));
  assert.equal(install('--host','other','--target',target).status,0);
  fs.appendFileSync(path.join(target,'使用说明.md'),'\nOld local edit');
  assert.equal(install('--host','other','--target',target).status,1);
  const updated=install('--host','other','--target',target,'--replace'); assert.equal(updated.status,0,updated.stderr);
  const backup=JSON.parse(updated.stdout).backup;
  assert.ok(fs.readFileSync(path.join(backup,'使用说明.md'),'utf8').includes('Old local edit'));
  assert.ok(!path.relative(path.dirname(target),backup).startsWith('ahui-main-image-design'));
  const check=spawnSync(process.execPath,[path.join(target,'scripts/install.mjs'),'--check','--host','other'],{encoding:'utf8',timeout:60000});
  assert.equal(check.status,0,check.stderr); assert.equal(JSON.parse(check.stdout).local_runtime_ready,true);
});
test('Doubao Work, WorkBuddy and unknown agents install by real destination, not a brand whitelist',()=>{
  for (const host of ['doubao','doubao-work','workbuddy','future-agent']) {
    assert.equal(install('--host',host).status,1); // No guessed directory.
    const target = path.join(temp,host,'平台分配的技能目录');
    const result = install('--host',host,'--target',target);
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).status,'installed');
    assert.equal(JSON.parse(result.stdout).image_generation_checked,false);
    assert.ok(fs.existsSync(path.join(target,'release-manifest.json')));
  }
});
test('a platform-assigned destination cannot overwrite another skill even with replace',()=>{
  const target = path.join(temp,'unrelated'); fs.mkdirSync(target);
  fs.writeFileSync(path.join(target,'SKILL.md'),'---\nname: other-skill\n---\n');
  assert.equal(install('--host','future-agent','--target',target,'--replace').status,1);
  assert.match(fs.readFileSync(path.join(target,'SKILL.md'),'utf8'),/other-skill/);
});
