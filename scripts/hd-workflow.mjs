import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { read, write, need, hash, imageIO, createHandoff } from './workflow.mjs';
import { currentComposite, copyRecord } from './composite-revisions.mjs';
import { normalizeLocale, requireCopyConfirmation } from './copy-language.mjs';
import { userMessage } from './interaction.mjs';
import { patchPlan, composedPath, checkCopyRegions } from './local-edit.mjs';
import { panelPlan, productAttachments } from './hd-panel.mjs';

import { isDomestic, noCopyPanels, whitePanels } from './market-profile.mjs';

const file = (run, name) => path.join(run, name);
const load = (run, name) => read(file(run, name));
const exists = (run, name) => fs.existsSync(file(run, name));
const text = value => typeof value === 'string' && value.trim().length > 0;
const atom = (run, name, value) => {
  const dest = file(run, name), tmp = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(tmp, dest);
};
// Readers in another chat must see either the entire receipt or no receipt.
export function writeHDOnce(dest, value) {
  const tmp = dest + '.' + randomUUID() + '.tmp';
  try {
    write(tmp, value);
    fs.linkSync(tmp, dest);
  } finally { fs.rmSync(tmp, {force:true}); }
}
const key = (index, attempt, suffix) => `hd-${index}-${attempt}-${suffix}.json`;
const panelIndex = index => need(Number.isInteger(index) && index >= 1 && index <= 6, 'Panel index must be 1..6');
const attemptNumber = attempt => need(Number.isInteger(attempt) && attempt >= 1, 'Invalid submission number');
const latestAttempt = (run, index) => Math.max(0, ...fs.readdirSync(run).filter(n => new RegExp(`^hd-${index}-\\d+-claim\\.json$`).test(n)).map(n => Number(n.split('-')[2])));
const sourceNames = ['inputs.json','product-understanding.json','style-analysis.json','six-image-blueprint.json','interaction.json','composite-plan.json'];

const hdInvitation = [
  '**小样满意了？请回复数字 1 或 2，选择高清制作方式。**',
  '**1｜多窗口并行制作（推荐）**\n新开 6 个制作聊天，每个做一张高清图。多张同时制作，通常能大幅节省等待时间。',
  '**2｜当前窗口逐张制作**\n在这个聊天里按顺序制作，做完一张再做下一张。',
  '两种方式都是每张生成一次，共 6 次。实际额度以账户记录为准。',
].join('\n\n');
function dispatchFromReply(response) {
  const choice = response?.message?.trim();
  need(choice === '1' || choice === '2', '请回复 1（多窗口并行）或 2（当前窗口逐张）。');
  return choice === '1' ? 'windows' : 'sequential';
}
function hasHDClaims(run) {
  return exists(run, 'hd-batch-claim.json') || fs.readdirSync(run).some(n => /^hd-[1-6]-\d+-claim\.json$/.test(n));
}
export const SAMPLE_MESSAGE = '已按你的要求调整小样。**想再改局部，直接说编号和位置。**\n\n' + hdInvitation;
function sampleMessage(composite) {
  if (composite.history.length) return SAMPLE_MESSAGE;
  return '这是六宫格小样。请先看 **整体风格、排版和内容**。想调整风格可以发参考图，想改局部可以说编号和位置。\n\n' + hdInvitation;
}
export const DELIVERY_MESSAGE = '六张独立高清图已生成。**哪张需要调整，直接告诉我编号和想改的地方**，也可以发回指定版本。';

function source(run) {
  const current = currentComposite(run);
  return { ...current, digest: hash(JSON.stringify({ composite: current.digest, sources: sourceNames.map(name => load(run, name)) })) };
}
function approved(run) {
  const state = load(run, 'hd-approval.json');
  need(state.run_id === load(run, 'inputs.json').run_id && state.status === 'approved' && userMessage(state.response), 'HD approval required for this run');
  need(state.source_digest === source(run).digest, 'HD source changed; approval invalidated');
  need(state.digest === hash(JSON.stringify({ source: state.source_digest, panels: state.panels })), 'HD plan changed; approval invalidated');
  need(state.response.digest === state.digest && state.response.version === state.version, 'HD approval version mismatch');
  // Already claimed legacy work must remain resumable without submitting it again.
  if (state.choice_prompt === 1 || !hasHDClaims(run))
    need(state.choice_prompt === 1 && dispatchFromReply(state.response) === state.dispatch, 'Show the current HD choice prompt and wait for 1 or 2');
  return state;
}
export function previewHD(run) {
  need(!hasHDClaims(run), 'HD production already started');
  const src = source(run), panels = src.panels;
  const old = exists(run, 'hd-approval.json') ? load(run, 'hd-approval.json') : null;
  const digest = hash(JSON.stringify({ source: src.digest, panels }));
  const state = old?.digest === digest && old.choice_prompt === 1 ? old : { run_id: load(run, 'inputs.json').run_id, choice_prompt: 1, version: (old?.version || 0) + 1,
    digest, source_digest: src.digest, composite_sha256: src.result.sha256, status: 'awaiting_approval', panels };
  atom(run, 'hd-approval.json', state);
  // Keep approved copy internal. The host displays only image_path and preview.
  return { version: state.version, digest: state.digest, status: state.status, image_path: src.result.image_path, revision: src.revision, candidates: src.candidates, preview: sampleMessage(src) };
}
export function approveHD(run, response) {
  const state = load(run, 'hd-approval.json');
  need(!hasHDClaims(run), 'HD production already started');
  need(state.choice_prompt === 1, 'Display hd-preview with both choices before approval');
  need(userMessage(response) && response.intent === 'approve_hd' && response.overall_approved === true && response.pending_changes === false, 'Explicit approval of overall direction required');
  const dispatch = dispatchFromReply(response);
  if (exists(run, 'composite-selection.json'))
    need(response.message_id !== load(run, 'composite-selection.json').user_request?.message_id, 'Use a new reply after showing the selected sample and both HD choices');
  need(response.message_id !== load(run, 'design-approval.json').user_response.message_id, 'Need a new user response after the composite');
  const src = source(run);
  need(!src.history.some(item => item.user_request?.message_id === response.message_id), 'Need a new user response after the revised composite');
  need(response.version === state.version && response.digest === state.digest && state.source_digest === src.digest, 'HD approval does not match displayed version');
  need(state.digest === hash(JSON.stringify({ source: state.source_digest, panels: state.panels })), 'HD plan changed');
  const next = { ...state, status: 'approved', dispatch, response };
  atom(run, 'hd-approval.json', next); return next;
}
export function splitHD(run) {
  const state = approved(run), src = source(run);
  if (exists(run, 'hd-crops.json')) {
    const crops = load(run, 'hd-crops.json');
    need(crops.approval_digest === state.digest && crops.composite_sha256 === src.result.sha256, 'Existing crops belong to a different sample');
    return crops;
  }
  const dir = file(run, 'hd-crops'); fs.mkdirSync(dir, { recursive: true });
  const destinations = Array.from({ length: 6 }, (_, i) => path.join(dir, `${i + 1}.png`));
  for (const dest of destinations) if (fs.existsSync(dest)) fs.unlinkSync(dest);
  // Geometry only; no AI visual review or automatic composite repair.
  const info = imageIO({ action: 'split', source: src.result.image_path, destinations });
  const crops = { approval_digest: state.digest, composite_sha256: src.result.sha256,
    panels: info.map((meta, i) => ({ index: i + 1, path: destinations[i], ...meta })) };
  write(file(run, 'hd-crops.json'), crops); return crops;
}
function prepareHD(run, index, capability, request = null, spec = request?.hd_plan) {
  panelIndex(index);
  const market = load(run, 'inputs.json'), blueprint = load(run, 'six-image-blueprint.json');
  const domestic = isDomestic(market);
  const state = approved(run), crops = load(run, 'hd-crops.json');
  need(crops.approval_digest === state.digest, 'Crops belong to another approval');
  const previous = latestAttempt(run, index), attempt = previous + 1;
  let copy = state.panels[index - 1];
  const composite = currentComposite(run);
  let locale = composite.locale;
  let previousResult = null, appliedChanges = [];
  if (previous) {
    need(userMessage(request?.user_request), 'No automatic retry; a new user modification request is required');
    need(exists(run, key(index, previous, 'result')) || (exists(run, key(index, previous, 'failure')) && load(run, key(index, previous, 'failure')).definitive === true), 'Previous result unknown; wait for the original call');
    if (request.basis_attempt != null) {
      need(!request.revert_to_original && Number.isInteger(request.basis_attempt) &&
        request.basis_attempt >= 1 && request.basis_attempt <= previous &&
        exists(run, key(index, request.basis_attempt, 'result')), 'Choose an existing result or the original crop as the basis');
    }
    if (!request.revert_to_original) {
      const first = request.basis_attempt ?? previous;
      const last = request.basis_attempt ?? 1;
      for (let n = first; n >= last; n--) {
        if (!exists(run, key(index, n, 'result'))) continue;
        const successful = load(run, key(index, n, 'claim'));
        if (request.basis_attempt == null && !successful.local_edit && successful.delivery_mode !== 'first_result' &&
          successful.hd_plan && !matched(run, index, n)) continue;
        previousResult = load(run, key(index, n, 'result'));
        need(imageIO({ action: 'inspect', files: [previousResult.path] })[0].sha256 === previousResult.sha256, 'Previous design changed');
        copy = successful.copy;
        locale = successful.locale || locale;
        appliedChanges = successful.applied_changes || (successful.user_request ? [successful.user_request.message] : []);
        break;
      }
    }
    const requestedLocale = normalizeLocale(request.locale || locale);
    let replacement = request.copy;
    if (request.panels || requestedLocale !== locale) {
      need(request.copy || request.panels, 'Language change requires rewritten copy');
      const confirmed = requireCopyConfirmation(run, request, index);
      replacement = confirmed.panels.find(p => p.index === index);
    }
    locale = requestedLocale;
    need(request.user_request.message_id !== state.response.message_id && request.user_request.message_id !== load(run, 'design-approval.json').user_response.message_id, 'Need a new user modification after generation');
    for (let n = 1; n <= previous; n++) need(load(run, key(index, n, 'claim')).user_request?.message_id !== request.user_request.message_id, 'User modification already submitted');
    if (replacement) {
      need(text(request.fact_review), 'Copy changes need product-fact review');
      const revised = copyRecord(replacement, index, locale, noCopyPanels(market, blueprint));
      checkCopyRegions(copy,revised,request.regions);
      copy = revised;
    }
    appliedChanges = [...appliedChanges, request.user_request.message];
  } else need(request == null, 'Initial six tasks use the approved sample and copy');
  // Validate original provenance, then apply the live attachment limit to this panel's subset.
  const original = createHandoff(run, { ...capability, max_reference_images: undefined }), crop = crops.panels[index - 1];
  need(crop.index === index && path.resolve(crop.path) === path.resolve(run, 'hd-crops', `${index}.png`), 'Invalid crop path');
  need(imageIO({ action: 'inspect', files: [crop.path] })[0].sha256 === crop.sha256, 'Crop changed');
  const product = load(run, 'product-understanding.json'), p = composite.panel_sources[index - 1];
  const selection = load(run, 'reference-selection.json').selected;
  const designBasis = previousResult ? previousResult.path : crop.path;
  const basisHash = previousResult ? previousResult.sha256 : crop.sha256;
  const white = whitePanels(market, blueprint).includes(index);
  if (request) {
    need(!spec?.basis_sha256 || spec.basis_sha256 === basisHash, 'Requested repair basis changed.');
    const local_edit = patchPlan(run, {base:designBasis, regions:request.regions, capability, index, original, request:request.user_request});
    return {index, attempt, copy, locale, hd_plan:{mode:'local_patch'}, local_edit, applied_changes:appliedChanges,
      design_basis:designBasis, basis_sha256:basisHash, copy_batch_digest:request.panels ? request.copy_confirmation.digest : null,
      user_request:request.user_request, approval_digest:state.digest, capability, tool:capability.tool,
      delivery_mode:'composed_patch', status:'awaiting_region_edits'};
  }
  const plan = panelPlan(spec, request);
  need(!spec?.basis_sha256 || spec.basis_sha256 === basisHash, 'Panel plan must identify the current design basis');
  const defaultIds = [...new Set([...p.angle_evidence.source_ids, ...p.source_ids])];
  const maxProductRefs = (capability.max_reference_images ?? Infinity) - 1;
  const ids = white && !request ? [] : plan.source_ids ?? defaultIds.slice(0, maxProductRefs);
  need(ids.length <= maxProductRefs, 'Crop plus matching products exceed observed host limit');
  const attachments = productAttachments(run, market, product, ids, selection, original);
  const references = [designBasis, ...attachments];
  const referenceNotes = ids.map((id, i) => `Attachment ${i + 2}: ${id}; ${i ? 'supporting detail' : 'primary angle evidence'} for the same product. Use visible product geometry only.`).join('\n');
  const identity = product.identity_lock;
  const template = fs.readFileSync(new URL(domestic ? '../references/hd-prompt-domestic.txt' : '../references/hd-prompt.txt', import.meta.url), 'utf8');
  const variables = {
    PLATFORM: market.platform, PANEL: String(index), LANGUAGE: locale,
    LAYOUT: plan.layout || 'Preserve all elements of attachment 1 at their existing positions.',
    GEOMETRY: plan.geometry || 'Keep only the visible product surfaces supported by matching references.',
    IDENTITY: JSON.stringify(Object.fromEntries(['silhouette','proportions','color','structure','material_appearance'].map(k => [k, identity[k]]))),
    REFERENCES: referenceNotes,
    COPY: JSON.stringify({ title: copy.title, subtitle: copy.subtitle, extra_copy: copy.extra_copy }),
    MAIN: white ? 'Plain white product photograph; keep the complete approved item arrangement and its real markings.' : 'Preserve the visual treatment visible in this crop.',
    USER_CHANGE: request ? `Apply only the requested edit. User request: ${request.user_request.message}${plan.change ? `\nExecution details: ${plan.change}` : ''}` : 'Increase clarity and resolution within the existing design. Preserve all approved visual elements, geometry and placement.',
  };
  const prompt = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => { need(Object.hasOwn(variables, name), 'Unknown prompt variable'); return variables[name]; });
  const repairNote = p.repair_note?.trim();
  const promptWithRepair = repairNote ? `${prompt}\nPreserve this panel's approved repair as shown in attachment 1. It takes precedence over older pose or geometry directions: ${repairNote}\n` : prompt;
  return { index, attempt, panel_label: (blueprint.panels[index - 1]?.purpose || (white ? '白底商品图' : '商品图')).replace(/[\r\n]+/g, ' ').slice(0, 36), copy, locale, canvas_ratio: '1:1', task_role: 'hd', hd_plan: plan, source_ids: ids, basis_sha256: basisHash, reference_hashes: references.map(f => hash(fs.readFileSync(f))), design_basis: designBasis, applied_changes: appliedChanges,
    copy_batch_digest: request?.panels ? request.copy_confirmation.digest : null,
    user_request: request?.user_request || null, approval_digest: state.digest, status: 'awaiting_native_result', delivery_mode: 'first_result', tool: capability.tool, capability,
    tool_arguments: { prompt: promptWithRepair, referenced_image_paths: references, transparent_background: false } };
}
export function claimHD(run, index, capability, request = null) {
  const claim = prepareHD(run, index, capability, request);
  writeHDOnce(file(run, key(index, claim.attempt, 'claim')), claim); return claim;
}
// The native host evaluates this exact self-contained function from the batch handoff.
// Save errors retain the original result; they never cause generation retries.
export async function dispatchNativeBatch(jobs, generate, persist, concurrency = 1) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
  const settled = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const position = next++, job = jobs[position];
      try {
        const local = ['scale', 'white_source'].includes(job.hd_plan?.mode);
        const result = local ? null : await generate(job.tool_arguments, job);
        await persist(job, result);
        settled[position] = { status: 'fulfilled', value: { index: job.index, attempt: job.attempt } };
      } catch (reason) { settled[position] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return settled;
}
export function claimHDBatch(run, capability, plans = null, requestedDispatch) {
  const state = approved(run);
  const dispatch = dispatchFromReply(state.response);
  need(state.dispatch === dispatch && (requestedDispatch == null || requestedDispatch === dispatch), 'Batch mode must match the user’s numeric choice');
  if (capability.max_concurrency != null)
    need(Number.isInteger(capability.max_concurrency) && capability.max_concurrency > 0, 'Invalid window concurrency');
  need(!fs.readdirSync(run).some(n => /^hd-\d+-\d+-claim\.json$/.test(n)), 'Batch already started; resume existing tasks, never resubmit the batch');
  if (plans !== null) need(Array.isArray(plans) && plans.length === 6 && plans.every((p,i) => p?.index === i+1), 'Supply six ordered HD plans');
  const jobs = Array.from({ length: 6 }, (_, i) => prepareHD(run, i + 1, capability, null, plans?.[i]));
  // Validate all six, then acquire an exclusive batch lock before dispatch.
  const batch = { jobs, dispatch, max_concurrency: dispatch === 'sequential' ? 1 : capability.max_concurrency ?? jobs.length };
  writeHDOnce(file(run, 'hd-batch-claim.json'), batch);
  for (const job of jobs) writeHDOnce(file(run, key(job.index, 1, 'claim')), job);
  return batch;
}
export function windowTasks(run, index, attempt, dispatch = 'windows') {
  if (index !== undefined) panelIndex(index);
  const batch = load(run, 'hd-batch-claim.json');
  need(batch.dispatch === dispatch, 'Batch belongs to a different execution mode');
  const state = approved(run);
  if (state.choice_prompt === 1) need(state.dispatch === dispatch, 'HD mode differs from approval');
  const digest = state.digest;
  const initial = index === undefined ? batch.jobs : [batch.jobs[index - 1]];
  const jobs = initial.map(first => {
    let current = latestAttempt(run, first.index) || 1;
    if (current > 1 && load(run, key(first.index, current, 'claim')).local_edit) current = first.attempt;
    need(attempt === undefined || current === attempt, 'Stale HD attempt');
    const dest = file(run, key(first.index, current, 'claim'));
    const job = fs.existsSync(dest) ? read(dest) : first;
    need(job.index === first.index && job.attempt === current && job.approval_digest === digest, 'Stale HD claim');
    // Restore only the first claim from the immutable batch after an interrupted batch write.
    if (!fs.existsSync(dest)) writeHDOnce(dest, job);
    return job;
  });
  return { jobs, limit: batch.max_concurrency };
}
// A serial runner gets one fresh submission at a time. A started task is recovery-only.
export function nextSequentialHD(run) {
  const { jobs } = windowTasks(run, undefined, undefined, 'sequential');
  for (const { index, attempt, reference_hashes, tool_arguments } of jobs) {
    const marker = suffix => key(index, attempt, suffix);
    if (exists(run, marker('result'))) continue;
    if (exists(run, marker('failure')) && load(run, marker('failure')).definitive) continue;
    const task_path = file(run, marker('claim'));
    if (exists(run, marker('started')) || exists(run, marker('failure')))
      return { status: 'recover_original', index, attempt, task_path };
    need(tool_arguments.referenced_image_paths.every((p, i) => hash(fs.readFileSync(p)) === reference_hashes[i]), 'Claimed reference changed');
    try { writeHDOnce(file(run, marker('started')), { started_at: new Date().toISOString(), dispatch: 'sequential' }); }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      return { status: 'recover_original', index, attempt, task_path };
    }
    return { status: 'submit_once', index, attempt, task_path };
  }
  return { status: 'ready_to_finish' };
}
function recordOutput(run, index, attempt, imagePath, evidence) {
  panelIndex(index); attemptNumber(attempt);
  const claim = load(run, key(index, attempt, 'claim'));
  need(claim.approval_digest === approved(run).digest && attempt === latestAttempt(run, index), 'Stale HD claim');
  const mode = claim.hd_plan?.mode || 'edit', local = ['scale','white_source'].includes(mode);
  need(local ? imagePath === null : text(imagePath) && text(evidence), 'Use hd-render for local work and hd-save for actual tool output');
  if (claim.local_edit) need(imagePath && path.resolve(imagePath) === composedPath(claim.local_edit), 'Assemble the local edits with patch-finish.');
  const refs = claim.local_edit ? [claim.local_edit.base] : claim.tool_arguments.referenced_image_paths;
  const sources = imageIO({action: 'inspect', files: refs});
  if (claim.reference_hashes) need(sources.every((v,i) => v.sha256 === claim.reference_hashes[i]), 'Claimed reference changed');
  const incoming = local ? sources[mode === 'scale' ? 0 : 1] : imageIO({action: 'inspect', files: [imagePath]})[0];
  if (!local && claim.delivery_mode !== 'first_result')
    need(!sources.some(v => v.pixel_sha256 === incoming.pixel_sha256), 'Reference is not generated output');
  const name = key(index, attempt, 'result');
  if (exists(run, name)) {
    const old = load(run, name);
    need(old.original_sha256 === incoming.sha256 && hash(fs.readFileSync(old.path)) === old.sha256, 'Different or damaged result already saved');
    return old;
  }
  const direct = Boolean(claim.local_edit) || claim.delivery_mode === 'first_result';
  const extension = direct ? (incoming.format === 'JPEG' ? 'jpg' : incoming.format.toLowerCase()) : 'png';
  need(/^[a-z0-9]+$/.test(extension), 'Invalid image format');
  const dest = file(run, `hd-${index}-${attempt}.${extension}`), temp = dest + '.' + randomUUID() + '.tmp';
  try {
    if (direct) fs.copyFileSync(imagePath, temp, fs.constants.COPYFILE_EXCL);
    const saved = direct ? imageIO({ action: 'inspect', files: [temp] })[0]
      : mode === 'edit' ? imageIO({action:'save_png', source:imagePath, destination:temp}) :
      imageIO({action:'hd_render', mode, basis:refs[0], original:refs[1], candidate:imagePath, polygons:claim.hd_plan.polygons, box:claim.hd_plan.box, destination:temp});
    if (direct) need(saved.sha256 === incoming.sha256, 'Saved output differs from tool bytes');
    else if (mode === 'edit') need(saved.pixel_sha256 === incoming.pixel_sha256, 'Saved output differs from tool result');
    try { fs.linkSync(temp, dest); }
    catch (err) { if (err.code !== 'EEXIST' || hash(fs.readFileSync(dest)) !== saved.sha256) throw err; }
    const result = {index, attempt, path:dest, ...saved, original_sha256:incoming.sha256, method:mode,
      tool:local ? 'Pillow' : claim.tool, host:local ? 'local' : claim.capability?.host || 'codex',
      model:local ? null : claim.capability?.selection?.model || null, host_evidence:evidence, status:'generated'};
    try { writeHDOnce(file(run, name), result); }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const recorded = load(run, name);
      need(recorded.original_sha256 === incoming.sha256 && recorded.sha256 === saved.sha256, 'Different result already saved');
      return recorded;
    }
    return result;
  } finally { fs.rmSync(temp, {force:true}); }
}
export function saveHD(run, index, attempt, imagePath, evidence) {
  need(text(imagePath) && text(evidence), 'Provide actual tool output and evidence');
  return recordOutput(run,index,attempt,imagePath,evidence);
}
export function renderLocalHD(run, index, attempt) {
  return recordOutput(run,index,attempt,null,'Deterministic render from the claimed source files');
}
function matched(run, index, attempt) {
  if (!exists(run,key(index,attempt,'review'))) return false;
  const review = load(run,key(index,attempt,'review')), result = load(run,key(index,attempt,'result'));
  return review.verdict === 'match' && review.sha256 === result.sha256 && review.basis_sha256 === load(run,key(index,attempt,'claim')).basis_sha256;
}
export function reviewHD(run, index, attempt, review) {
  panelIndex(index); attemptNumber(attempt);
  need(attempt === latestAttempt(run,index), 'Review the latest attempt');
  const job = load(run,key(index,attempt,'claim')), result = load(run,key(index,attempt,'result'));
  need(job.delivery_mode !== 'first_result', 'Visual review is only for already claimed legacy tasks');
  need(job.hd_plan && review.sha256 === result.sha256 && review.basis_sha256 === job.basis_sha256 && hash(fs.readFileSync(result.path)) === result.sha256, 'Review must identify the saved result and its basis');
  need(['match','mismatch','unchecked'].includes(review.verdict) && ['layout','product','copy'].every(k => text(review[k])), 'Record layout, product and copy observations');
  atom(run,key(index,attempt,'review'),{...review,index,attempt});
  return {index,attempt,verdict:review.verdict};
}
export function saveHDResponse(run, index, attempt, response, evidence) {
  panelIndex(index); attemptNumber(attempt);
  const match = typeof response?.image_url === 'string' && response.image_url.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  need(match, 'Use actual local output or native image data URL');
  const dest = file(run, `hd-${index}-${attempt}-native.bin`), bytes = Buffer.from(match[1], 'base64');
  if (fs.existsSync(dest)) need(hash(fs.readFileSync(dest)) === hash(bytes), 'Different native result already recorded');
  else fs.writeFileSync(dest, bytes, { flag: 'wx' });
  return saveHD(run, index, attempt, dest, evidence);
}
export function failHD(run, index, attempt, failure) {
  panelIndex(index); attemptNumber(attempt); approved(run); load(run, key(index, attempt, 'claim'));
  need(!exists(run, key(index, attempt, 'result')), 'Output exists; save or deliver it');
  need(text(failure.reason) && text(failure.host_evidence) && typeof failure.definitive === 'boolean', 'Record actual tool failure and whether result is definitely unavailable');
  atom(run, key(index, attempt, 'failure'), failure); return failure;
}
export function finishHD(run, only) {
  approved(run);
  if (only !== undefined) need(typeof only === 'string' && /^[1-6](,[1-6])*$/.test(only), 'Use comma-separated panel numbers 1..6');
  const requested = only ? new Set(only.split(',').map(Number)) : null;
  const m = load(run, 'inputs.json'), entries = [];
  for (let index = 1; index <= 6; index++) {
    if (requested && !requested.has(index)) continue;
    const attempt = latestAttempt(run, index);
    if (exists(run, key(index, attempt, 'result'))) {
      const result = load(run, key(index, attempt, 'result'));
      need(imageIO({ action: 'inspect', files: [result.path] })[0].sha256 === result.sha256, 'Final output changed');
      const claim = load(run,key(index,attempt,'claim'));
      if (!claim.local_edit && claim.delivery_mode !== 'first_result' && claim.hd_plan && !matched(run,index,attempt)) {
        const review = exists(run,key(index,attempt,'review')) ? load(run,key(index,attempt,'review')) : null;
        entries.push({index, attempt, status:review?.verdict === 'mismatch' ? 'mismatch' : 'unchecked', review, candidate_path:result.path});
      } else entries.push({ index, attempt, status: 'generated', result });
    } else {
      const failure = exists(run, key(index, attempt, 'failure')) ? load(run, key(index, attempt, 'failure')) : null;
      entries.push({ index, attempt, status: failure?.definitive ? 'failed' : 'pending', reason: failure?.reason });
    }
  }
  const folder = path.join(m.workspace, 'outputs', 'ahui-main-image-design', m.run_id, 'final');
  fs.mkdirSync(folder, { recursive: true });
  const published = entries.map(entry => {
    if (!entry.result) return entry;
    const index = String(entry.index).padStart(2, '0');
    const revision = entry.result.method === 'local_patch' ? '-r' + entry.attempt : '';
    const dest = path.join(folder, index + revision + path.extname(entry.result.path));
    const staged = dest + '.' + randomUUID() + '.tmp';
    try {
      fs.copyFileSync(entry.result.path, staged, fs.constants.COPYFILE_EXCL);
      fs.renameSync(staged, dest);
    } finally { fs.rmSync(staged, { force: true }); }
    return { ...entry, image_path: dest, width: entry.result.width, height: entry.result.height };
  });
  const complete = entries.length === 6 && entries.every(e => e.status === 'generated');
  const dimensionWarnings = published.filter(entry => entry.result && entry.width !== entry.height)
    .map(entry => ({ index: entry.index, width: entry.width, height: entry.height, reason: '非1:1正方形' }));
  const dimensionMessage = dimensionWarnings.length ? '\n\n实际画幅：' +
    dimensionWarnings.map(entry => `第 ${entry.index} 张为 ${entry.width} × ${entry.height}`).join('、') + '。' : '';
  const saved = entries.filter(e => e.result), remaining = entries.filter(e => !e.result);
  const summary = remaining.length
    ? `已交付 ${saved.length} 张。待处理编号 ${remaining.map(e => e.index).join('、')}。`
    : requested ? `已交付第 ${saved.map(e => e.index).join('、')} 张。` : DELIVERY_MESSAGE;
  const report = { status: complete ? 'complete' : 'partial', panels: published, output_dir: folder,
    dimensions_match_target: dimensionWarnings.length === 0, dimension_warnings: dimensionWarnings,
    message: summary + dimensionMessage };
  atom(run, requested && !complete ? 'hd-delivery-selected.json' : 'hd-delivery.json', report); return report;
}
