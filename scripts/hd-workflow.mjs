import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { read, write, need, hash, imageIO, createHandoff } from './workflow.mjs';
import { currentComposite, copyRecord } from './composite-revisions.mjs';
import { normalizeLocale, requireCopyConfirmation } from './copy-language.mjs';
import { userMessage } from './interaction.mjs';
import { PANEL_EXECUTION_FIELDS } from './creative-direction.mjs';

import { isDomestic, noCopyPanels, domesticPanelPolicy, domesticStyleBrief } from './market-profile.mjs';

const file = (run, name) => path.join(run, name);
const load = (run, name) => read(file(run, name));
const exists = (run, name) => fs.existsSync(file(run, name));
const text = value => typeof value === 'string' && value.trim().length > 0;
const atom = (run, name, value) => {
  const dest = file(run, name), tmp = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(tmp, dest);
};
const key = (index, attempt, suffix) => `hd-${index}-${attempt}-${suffix}.json`;
const panelIndex = index => need(Number.isInteger(index) && index >= 1 && index <= 6, 'Panel index must be 1..6');
const attemptNumber = attempt => need(Number.isInteger(attempt) && attempt >= 1, 'Invalid submission number');
const latestAttempt = (run, index) => Math.max(0, ...fs.readdirSync(run).filter(n => new RegExp(`^hd-${index}-\\d+-claim\\.json$`).test(n)).map(n => Number(n.split('-')[2])));
const sourceNames = ['inputs.json','product-understanding.json','style-analysis.json','six-image-blueprint.json','interaction.json','composite-plan.json'];

export const SAMPLE_MESSAGE = '已按你的要求调整，请看看这版效果。**风格仍不满意，可以再上传更接近预期的参考图**，我会重新分析并调整。局部想改，告诉我第几张、哪里想改就行。\n\n**整体满意，回复“继续做高清图”**，我会结合产品原图和已确认文案制作六张独立高清图，小字和边缘的清晰度会在下一步处理。';
function sampleMessage(composite) {
  if (composite.history.length) return SAMPLE_MESSAGE;
  return '这是六宫格初稿，先看 **整体风格、排版和内容**，还不是最终高清图。\n\n**风格不满意，直接上传一张你真正想要的风格参考图**，告诉我“按这张的感觉调整”。之前发过参考图，也可以换一张更接近你预期的，我会重新分析它的风格，调整这套初稿。\n\n**只想改局部，告诉我第几张、哪里想改**，用大白话说就行。\n\n**整体满意，回复“继续做高清图”**，我会结合产品原图和已确认文案，制作六张独立高清图。小字和边缘的清晰度会在下一步处理。';
}
export const DELIVERY_MESSAGE = '六张独立高清图已做好，下面可以逐张查看和下载。哪张需要修改，直接告诉我编号和想改的地方，或者把那张图发回来，用大白话说明就行，我会针对那张调整。';

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
  return state;
}
export function previewHD(run) {
  need(!exists(run, 'hd-crops.json'), 'HD production already started');
  const src = source(run), panels = src.panels;
  const old = exists(run, 'hd-approval.json') ? load(run, 'hd-approval.json') : null;
  const digest = hash(JSON.stringify({ source: src.digest, panels }));
  const state = old?.digest === digest ? old : { run_id: load(run, 'inputs.json').run_id, version: (old?.version || 0) + 1,
    digest, source_digest: src.digest, composite_sha256: src.result.sha256, status: 'awaiting_approval', panels };
  atom(run, 'hd-approval.json', state);
  // Keep approved copy internal. The host displays only image_path and preview.
  return { version: state.version, digest: state.digest, status: state.status, image_path: src.result.image_path, revision: src.revision, candidates: src.candidates, preview: sampleMessage(src) };
}
export function approveHD(run, response) {
  const state = load(run, 'hd-approval.json');
  need(!exists(run, 'hd-crops.json'), 'HD production already started');
  // Host checks the real message; continuing carries forward previously confirmed copy.
  need(userMessage(response) && response.intent === 'approve_hd' && response.overall_approved === true && response.pending_changes === false, 'Explicit approval of overall direction required');
  need(response.message_id !== load(run, 'design-approval.json').user_response.message_id, 'Need a new user response after the composite');
  const src = source(run);
  need(!src.history.some(item => item.user_request?.message_id === response.message_id), 'Need a new user response after the revised composite');
  need(response.version === state.version && response.digest === state.digest && state.source_digest === src.digest, 'HD approval does not match displayed version');
  need(state.digest === hash(JSON.stringify({ source: state.source_digest, panels: state.panels })), 'HD plan changed');
  const next = { ...state, status: 'approved', response };
  atom(run, 'hd-approval.json', next); return next;
}
export function splitHD(run) {
  const state = approved(run), src = source(run);
  if (exists(run, 'hd-crops.json')) return load(run, 'hd-crops.json');
  const dir = file(run, 'hd-crops'); fs.mkdirSync(dir, { recursive: true });
  const destinations = Array.from({ length: 6 }, (_, i) => path.join(dir, `${i + 1}.png`));
  for (const dest of destinations) if (fs.existsSync(dest)) fs.unlinkSync(dest);
  // Geometry only; no AI visual review or automatic composite repair.
  const info = imageIO({ action: 'split', source: src.result.image_path, destinations });
  const crops = { approval_digest: state.digest, composite_sha256: src.result.sha256,
    panels: info.map((meta, i) => ({ index: i + 1, path: destinations[i], ...meta })) };
  write(file(run, 'hd-crops.json'), crops); return crops;
}
function prepareHD(run, index, capability, request = null) {
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
    if (!request.revert_to_original) {
      for (let n = previous; n >= 1; n--) {
        if (!exists(run, key(index, n, 'result'))) continue;
        const successful = load(run, key(index, n, 'claim'));
        previousResult = load(run, key(index, n, 'result'));
        need(imageIO({ action: 'inspect', files: [previousResult.path] })[0].sha256 === previousResult.sha256, 'Previous successful design changed');
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
      copy = copyRecord(replacement, index, locale, noCopyPanels(market, blueprint));
    }
    appliedChanges = [...appliedChanges, request.user_request.message];
  } else need(request == null, 'Initial six tasks use the approved sample and copy');
  // Validate original provenance, then apply the live attachment limit to this panel's subset.
  const original = createHandoff(run, { ...capability, max_reference_images: undefined }), crop = crops.panels[index - 1];
  need(crop.index === index && path.resolve(crop.path) === path.resolve(run, 'hd-crops', `${index}.png`), 'Invalid crop path');
  need(imageIO({ action: 'inspect', files: [crop.path] })[0].sha256 === crop.sha256, 'Crop changed');
  const product = load(run, 'product-understanding.json'), p = composite.panel_sources[index - 1];
  const selection = load(run, 'reference-selection.json').selected;
  const ids = [...new Set([...p.angle_evidence.source_ids, ...p.source_ids])];
  need(ids.length > 0, 'Panel needs product evidence');
  const designBasis = previousResult ? previousResult.path : crop.path;
  const references = [designBasis, ...ids.map(id => {
    const position = selection.findIndex(s => s.id === id);
    need(position >= 0, `Panel product reference ${id} was not selected; replan before generation`);
    return original.tool_arguments.referenced_image_paths[position];
  })];
  if (capability.max_reference_images != null) need(references.length <= capability.max_reference_images, 'Crop plus matching products exceed observed host limit');
  const referenceNotes = ids.map((id, i) => {
    const s = product.sources.find(s => s.id === id);
    return `Attachment ${i + 2}: ${s.role}; ${s.visual_summary}; ${s.unique_contribution}`;
  }).join('\n');
  const template = fs.readFileSync(new URL(domestic ? '../references/hd-prompt-domestic.txt' : '../references/hd-prompt.txt', import.meta.url), 'utf8');
  for (const field of PANEL_EXECUTION_FIELDS) need(text(p[field]), `Panel ${index} execution guidance missing: ${field}`);
  const variables = {
    PLATFORM: market.platform, VISUAL_SYSTEM: domestic ? (composite.style_override || domesticStyleBrief(load(run, 'style-analysis.json'))) : '',
    APPROVED_CHANGE: [composite.style_override ? `Current approved replacement style: ${composite.style_override}. The latest approved crop and this style override incompatible earlier panel guidance; do not restore the former style.` : '', composite.design_guidance ? `Approved composite adjustments; apply only what is relevant to this panel: ${composite.design_guidance}` : ''].filter(Boolean).join('\n'),
    PANEL: String(index), LANGUAGE: locale, PRODUCT: product.name, IDENTITY: JSON.stringify(product.identity_lock),
    REFERENCES: referenceNotes, LIMITS: p.angle_evidence.limits,
    PHOTOGRAPHY: p.lighting_materials, SCENE_PHYSICS: p.scene_physics,
    PRESENTATION: p.presentation, COMPOSITION: p.composition,
    COPY: JSON.stringify({ title: copy.title, subtitle: copy.subtitle, extra_copy: copy.extra_copy }),
    MAIN: domestic ? domesticPanelPolicy(market, blueprint, index) : index === 1 ? 'MAIN IMAGE: pure white #FFFFFF; complete product and verified included items only; no marketing text, people or badges. Keep the approved framing.' : '',
    USER_CHANGE: previous ? `Attachment 1 is the current design basis${previousResult ? ' from the latest successful edit' : ' from the original approved sample'}. Preserve the edits already present there. Earlier applied requests in chronological order: ${JSON.stringify(appliedChanges.slice(0, -1))}. The current request overrides conflicting earlier requests: ${request.user_request.message}. Apply only this targeted change in addition to clarity corrections; preserve everything else. The exact copy above takes precedence over blurry pixels.` : '',
  };
  const prompt = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => { need(Object.hasOwn(variables, name), 'Unknown prompt variable'); return variables[name]; });
  return { index, attempt, copy, locale, canvas_ratio: '1:1', task_role: 'hd', design_basis: designBasis, applied_changes: appliedChanges,
    copy_batch_digest: request?.panels ? request.copy_confirmation.digest : null,
    user_request: request?.user_request || null, approval_digest: state.digest, status: 'awaiting_native_result', tool: capability.tool, capability,
    tool_arguments: { prompt, referenced_image_paths: references, transparent_background: false } };
}
export function claimHD(run, index, capability, request = null) {
  const claim = prepareHD(run, index, capability, request);
  write(file(run, key(index, claim.attempt, 'claim')), claim); return claim;
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
        const result = await generate(job.tool_arguments, job);
        await persist(job, result);
        settled[position] = { status: 'fulfilled', value: { index: job.index, attempt: job.attempt } };
      } catch (reason) { settled[position] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return settled;
}
export function claimHDBatch(run, capability) {
  need(!fs.readdirSync(run).some(n => /^hd-\d+-\d+-claim\.json$/.test(n)), 'Batch already started; resume existing tasks, never resubmit the batch');
  const jobs = Array.from({ length: 6 }, (_, i) => prepareHD(run, i + 1, capability));
  // Validate all six, then acquire an exclusive batch lock before dispatch.
  write(file(run, 'hd-batch-claim.json'), { jobs, max_concurrency: capability.max_concurrency ?? 1, dispatch_function: dispatchNativeBatch.toString() });
  for (const job of jobs) write(file(run, key(job.index, 1, 'claim')), job);
  return { jobs, max_concurrency: capability.max_concurrency ?? 1, dispatch_function: dispatchNativeBatch.toString() };
}
export function saveHD(run, index, attempt, imagePath, hostEvidence) {
  panelIndex(index); attemptNumber(attempt); need(text(hostEvidence), 'Actual native tool evidence required');
  const state = approved(run), claim = load(run, key(index, attempt, 'claim'));
  need(claim.approval_digest === state.digest, 'Claim belongs to another approval');
  need(attempt === latestAttempt(run, index), 'A newer user-requested edit exists');
  const info = imageIO({ action: 'inspect', files: [imagePath] })[0];
  const references = imageIO({ action: 'inspect', files: claim.tool_arguments.referenced_image_paths });
  need(!references.some(p => p.pixel_sha256 === info.pixel_sha256), 'Reference is not generated output');
  const resultName = key(index, attempt, 'result');
  if (exists(run, resultName)) {
    const old = load(run, resultName); need(old.original_sha256 === info.sha256, 'Different result already saved'); return old;
  }
  const dest = file(run, `hd-${index}-${attempt}.png`);
  if (!fs.existsSync(dest)) imageIO({ action: 'save_png', source: imagePath, destination: dest });
  const saved = imageIO({ action: 'inspect', files: [dest] })[0];
  need(saved.pixel_sha256 === info.pixel_sha256, 'Saved output differs from tool result');
  const result = { index, attempt, path: dest, ...saved, original_sha256: info.sha256, tool: claim.tool, host: claim.capability?.host || 'codex', model: claim.capability?.selection?.model || null, host_evidence: hostEvidence, status: 'generated' };
  write(file(run, resultName), result); return result;
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
export function finishHD(run) {
  approved(run);
  const m = load(run, 'inputs.json'), entries = [];
  for (let index = 1; index <= 6; index++) {
    const attempt = latestAttempt(run, index);
    if (exists(run, key(index, attempt, 'result'))) {
      const result = load(run, key(index, attempt, 'result'));
      need(imageIO({ action: 'inspect', files: [result.path] })[0].sha256 === result.sha256, 'Final output changed');
      entries.push({ index, attempt, status: 'generated', result });
    } else {
      const failure = exists(run, key(index, attempt, 'failure')) ? load(run, key(index, attempt, 'failure')) : null;
      need(failure?.definitive === true, `Panel ${index} incomplete or awaiting actual result`);
      entries.push({ index, attempt, status: 'failed', reason: failure.reason });
    }
  }
  const folder = path.join(m.workspace, 'outputs', 'ahui-main-image-design', m.run_id, 'final');
  fs.mkdirSync(folder, { recursive: true });
  const published = entries.map(entry => {
    const dest = path.join(folder, `${String(entry.index).padStart(2, '0')}.png`);
    if (!entry.result) {
      // Do not present an older file as the result of a failed user edit.
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      return entry;
    }
    fs.copyFileSync(entry.result.path, dest);
    return { ...entry, image_path: dest, width: entry.result.width, height: entry.result.height };
  });
  const complete = entries.every(e => e.status === 'generated');
  const dimensionWarnings = published.filter(entry => entry.result && (entry.width !== entry.height || Math.min(entry.width, entry.height) < 1000))
    .map(entry => ({ index: entry.index, width: entry.width, height: entry.height,
      reason: [entry.width !== entry.height ? '非1:1正方形' : '', Math.min(entry.width, entry.height) < 1000 ? '短边不足约1K' : ''].filter(Boolean).join('、') }));
  const dimensionMessage = dimensionWarnings.length ? `\n\n尺寸提示：${dimensionWarnings.map(entry => `第${entry.index}张实际${entry.width}×${entry.height}（${entry.reason}）`).join('；')}。已保留原始结果，需要调整可指定编号。` : '';
  const report = { status: complete ? 'complete' : 'partial', visual_review: 'user', panels: published,
    dimensions_match_target: dimensionWarnings.length === 0, dimension_warnings: dimensionWarnings,
    message: (complete ? DELIVERY_MESSAGE : `已完成${entries.filter(e => e.result).length}张，未生成：${entries.filter(e => !e.result).map(e => e.index).join('、')}。可先查看已完成的图片；需要补做或修改哪张，直接告诉我编号和要求。`) + dimensionMessage };
  atom(run, 'hd-delivery.json', report); return report;
}
