import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { read, need, hash, imageIO } from './workflow.mjs';
import { runPython } from './python-runtime.mjs';
import { productAttachments } from './hd-panel.mjs';

const pythonScript = fileURLToPath(new URL('./product-repair-patch.py', import.meta.url));
const sha = file => hash(fs.readFileSync(file));
const json = value => JSON.stringify(value, null, 2) + '\n';

function python(args) {
  const result = runPython([pythonScript, ...args]);
  need(result.status === 0, result.stderr || result.error?.message || 'Patch operation failed');
}

function installOnce(file, bytes) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx' });
    try { fs.linkSync(temp, file); return true; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      need(fs.readFileSync(file).equals(Buffer.from(bytes)), 'Conflicting patch result at ' + file);
      return false;
    }
  } finally { fs.rmSync(temp, { force: true }); }
}

export function checkCopyRegions(before, after, regions) {
  const lines = p => [p.title, p.subtitle, ...p.extra_copy].filter(Boolean);
  const added = lines(after).filter(line => !lines(before).includes(line));
  const visible = (regions || []).flatMap(region => region.visible_text || []);
  need(added.every(line => visible.includes(line)), 'Include each new marketing copy line verbatim in its region.');
}

export function patchPlan(run, {base, regions, capability, index, guidance, original, request, standaloneRefs}) {
  need(Array.isArray(regions) && regions.length, 'Locate the requested edit on the clean image and supply regions.');
  const external = standaloneRefs !== undefined;
  const composite = !index && !external;
  const folder = fs.mkdtempSync(path.join(run, 'local-edit-'));
  const market = external ? null : read(path.join(run, 'inputs.json'));
  const product = external ? null : read(path.join(run, 'product-understanding.json'));
  const selected = external ? [] : read(path.join(run, 'reference-selection.json')).selected;
  const tasks = [];
  for (const [n, region] of regions.entries()) {
    need(region && typeof region.change === 'string' && region.change.trim(), 'Describe the edit in this crop.');
    const panel = region.panel ?? index;
    if (composite) need(Number.isInteger(panel) && panel >= 1 && panel <= 6, 'Identify the composite panel for each region.');
    if (index) need(panel === index, 'Region belongs to another HD panel.');
    need(Array.isArray(region.polygon) && region.polygon.length >= 3 && region.polygon.every(p =>
      Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)), 'Supply ordered pixel coordinates on the oriented clean image.');
    if (region.context_box !== undefined) need(Array.isArray(region.context_box) && region.context_box.length === 4 &&
      region.context_box.every(Number.isInteger), 'Supply a context box as [left, top, right, bottom].');
    if (region.include_scene_context !== undefined) need(typeof region.include_scene_context === 'boolean', 'Scene context option must be boolean.');
    const ids = region.source_ids || [];
    need(Array.isArray(ids) && new Set(ids).size === ids.length, 'List the matching product source IDs for this region.');
    const refs = external ? ids.map(id => {
      need(Object.hasOwn(standaloneRefs, id), 'Unknown standalone product reference');
      return standaloneRefs[id];
    }) : productAttachments(run, market, product, ids, selected, original);
    need(1 + refs.length <= (capability.max_reference_images ?? Infinity), 'Too many references for this region.');
    const seam = region.seam || 'target';
    need(['target','crop'].includes(seam), 'Unknown patch blending method.');
    const job = path.join(folder, String(n + 1));
    const coords = region.polygon.map(p => p.join(',')).join(' ');
    const args = ['prepare', '--scene', base, '--job', job, '--polygon', coords, '--square', '--turn', String(region.turn ?? 0)];
    if (composite) args.push('--panel', String(panel));
    if (region.context_box) args.push('--context-box', ...region.context_box.map(String));
    if (region.include_scene_context) args.push('--scene-context');
    python(args);
    const sceneContext = path.join(job, 'scene-context.png');
    const hasSceneContext = fs.existsSync(sceneContext);
    const images = [path.join(job, 'crop.png'), ...(hasSceneContext ? [sceneContext] : []), ...refs];
    need(images.length <= (capability.max_reference_images ?? Infinity), 'Crop, scene context and product references exceed the host limit.');
    const crop = read(path.join(job, 'job.json'));
    const padded = crop.content_box[2] - crop.content_box[0] !== crop.model_size[0] ||
      crop.content_box[3] - crop.content_box[1] !== crop.model_size[1];
    const prompt = [
      '附件1是编辑底图。按附件1的取景、方向和尺度输出一张不透明正方形图。保留周边地标、遮挡、透视与光影，只修正指定结构。',
      padded ? '灰色边带是对齐用的空白，按原位置和宽度保留，不将它画进内容。' : '',
      hasSceneContext ? '附件2是只读全景，用于理解主体、动作、遮挡和接触关系。仍以附件1的取景为输出范围。' : '',
      refs.length ? `从附件${hasSceneContext ? 3 : 2}起是本品对应角度和细节。以实物证据还原比例、连接、标识和印刷。` : '',
      '仅执行本区域的修改：' + region.change,
      guidance ? '本图适用的设计语言：' + guidance : '',
      region.visible_text?.length ? '本区域确切文字（按条和原换行）：' + JSON.stringify(region.visible_text) : '',
      '保留未点名的可见文字、周围地标和裁片边缘位置。禁止凭空补写商品刻字。'
    ].filter(Boolean).join('\n');
    if (region.visible_text !== undefined) need(Array.isArray(region.visible_text) && region.visible_text.every(s => typeof s === 'string'), 'Invalid local copy.');
    const task = { region: n+1, panel, job, seam, source_ids: ids, tool: capability.tool, capability,
      task_role:'patch', canvas_ratio:'1:1', user_request:request, reference_hashes:images.map(sha),
      tool_arguments:{prompt, referenced_image_paths:images, transparent_background:false} };
    const taskFile = path.join(job, 'task.json');
    fs.writeFileSync(taskFile, json(task), {flag:'wx'});
    tasks.push(taskFile);
  }
  if (tasks.length > 1) {
    const spec = path.join(folder, 'selection.json');
    fs.writeFileSync(spec,json(tasks.map(file => { const {job,seam}=read(file); return {job,seam}; })),{flag:'wx'});
    python(['check-regions','--spec',spec]);
  }
  return {folder, base, base_sha256:sha(base), tasks};
}

export function patchContext(run, args) {
  let key;
  const pos = value => /^\d+$/.test(value || '') && Number(value) > 0;
  if (args.revision && !args.index && !args.attempt && pos(args.revision)) key = 'composite-' + args.revision;
  else if (!args.revision && /^[1-6]$/.test(args.index || '') && pos(args.attempt)) key = 'hd-' + args.index + '-' + args.attempt;
  else if (!args.revision && !args.index && !args.attempt) key = 'standalone';
  else throw Error('Identify a composite revision or an HD index and attempt.');
  const claim = read(path.join(run, key + '-claim.json'));
  need(claim.local_edit, 'This claim uses its original legacy workflow.');
  return claim;
}

export function patchTask(claim, number) {
  const plan = claim.local_edit;
  need(Number.isInteger(number) && number > 0 && number <= plan.tasks.length, 'Invalid edit region.');
  const task = read(plan.tasks[number-1]);
  need(task.tool_arguments.referenced_image_paths.every((p,i)=>sha(p) === task.reference_hashes[i]), 'Changed patch reference.');
  return task;
}

export function startPatch(claim, number) {
  const task = patchTask(claim, number);
  const task_path = claim.local_edit.tasks[number-1];
  if (fs.existsSync(path.join(task.job,'result.json'))) return {status:'saved',task_path};
  const fresh = installOnce(path.join(task.job,'started'), 'started\n');
  return {status:fresh?'submit_once':'recover_original',task_path};
}

export function savePatch(claim, number, args) {
  const task = patchTask(claim, number);
  need(fs.existsSync(path.join(task.job,'started')), 'Start this region before saving.');
  need(Boolean(args.image) !== Boolean(args.response) && args['host-evidence']?.trim(), 'Identify the actual patch output and call.');
  let bytes;
  if (args.response) {
    const match = read(args.response).image_url?.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
    need(match,'Expected original image data URL'); bytes = Buffer.from(match[1],'base64');
  } else bytes = fs.readFileSync(args.image);
  const candidate = path.join(task.job,'native-' + hash(bytes) + '.bin');
  installOnce(candidate,bytes);
  const [info,...inputs] = imageIO({action:'inspect', files:[candidate,...task.tool_arguments.referenced_image_paths]});
  need(info.width === info.height && inputs.every(p=>p.pixel_sha256 !== info.pixel_sha256), 'Patch must be a newly edited square crop.');
  const file = path.join(task.job,'result.json');
  if (fs.existsSync(file)) {
    const prior=read(file); need(prior.sha256===info.sha256,'A different region result is already saved.'); return prior;
  }
  const record = {edit:candidate,sha256:info.sha256,host_evidence:args['host-evidence']};
  installOnce(file,json(record)); return record;
}

export function composedPath(plan) { return path.join(plan.folder,'composed.png'); }

export function assemblePatches(claim) {
  const plan = claim.local_edit;
  need(sha(plan.base) === plan.base_sha256, 'Clean base image has changed.');
  const regions = plan.tasks.map((_, i) => {
    const task = patchTask(claim,i+1), saved=read(path.join(task.job,'result.json'));
    need(sha(saved.edit) === saved.sha256, 'Saved patch has changed.');
    return {job:task.job, seam:task.seam, edit:saved.edit};
  });
  const file=path.join(plan.folder,'assembly.json');
  installOnce(file,json({base:plan.base,regions}));
  const dest=composedPath(plan), temp=path.join(plan.folder,randomUUID()+'.png');
  try {
    python(['compose-set','--spec',file,'--out',temp]);
    installOnce(dest,fs.readFileSync(temp));
  } finally { fs.rmSync(temp,{force:true}); }
  return dest;
}
