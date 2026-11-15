import fs from 'node:fs';
import path from 'node:path';
import { read, write, need, hash, imageIO, createHandoff, requireApproval } from './workflow.mjs';
import { normalizeLocale, validateVisibleCopy, requireCopyConfirmation } from './copy-language.mjs';
import { userMessage } from './interaction.mjs';
import { PANEL_EXECUTION_FIELDS } from './creative-direction.mjs';

import { isDomestic, noCopyPanels, domesticSetPolicy, whitePanels } from './market-profile.mjs';

const file = (run, name) => path.join(run, name);
const exists = (run, name) => fs.existsSync(file(run, name));
const key = (revision, suffix) => `composite-${revision}-${suffix}.json`;

export function copyRecord(p, index, locale, noCopy = [1]) {
  need(p.index === index && typeof p.title === 'string' && typeof p.subtitle === 'string' && Array.isArray(p.extra_copy) && p.extra_copy.every(s => typeof s === 'string' && s.trim()) && typeof p.copy_zh === 'string' && p.copy_zh.trim(), 'Invalid final copy record');
  validateVisibleCopy(p, locale);
  if (noCopy.includes(index)) need(!p.title && !p.subtitle && p.extra_copy.length === 0, 'White main image has no marketing copy');
  return { index, title: p.title, subtitle: p.subtitle, extra_copy: p.extra_copy, copy_zh: p.copy_zh };
}

export function copyRecords(panels, locale = 'en-US', noCopy = [1]) {
  need(Array.isArray(panels) && panels.length === 6, 'Provide all six final copy records');
  return panels.map((p, i) => copyRecord(p, i + 1, locale, noCopy));
}

export function currentComposite(run, requestedRevision = null) {
  requireApproval(run);
  let result = read(file(run, 'generation-result.json'));
  const blueprint = read(file(run, 'six-image-blueprint.json'));
  const inputs = read(file(run, 'inputs.json'));
  const noCopy = noCopyPanels(inputs, blueprint);
  let locale = inputs.locale;
  let panels = copyRecords(blueprint.panels, locale, noCopy);
  let design_guidance = '';
  let style_override = '';
  let panel_sources = blueprint.panels.map(p => ({ index: p.index, source_ids: p.source_ids, angle_evidence: p.angle_evidence,
    ...Object.fromEntries(PANEL_EXECUTION_FIELDS.map(key => [key, p[key]])) }));
  const history = [];
  const states = new Map([[0, { result, panels, locale, panel_sources, design_guidance, style_override, revision: 0, variant_id: read(file(run, 'interaction.json')).style.selected_id || null }]]);
  let activeRevision = 0;
  const revisions = fs.readdirSync(run).filter(n => /^composite-\d+-claim\.json$/.test(n)).map(n => Number(n.split('-')[1])).sort((a,b) => a-b);
  for (const revision of revisions) {
    const claim = read(file(run, key(revision, 'claim')));
    const base = states.get(claim.base_revision ?? activeRevision);
    need(base, 'Composite base revision is unavailable');
    ({ result, panels, locale, panel_sources, design_guidance, style_override } = base);
    need(claim.base_sha256 === result.sha256, 'Composite revision belongs to another sample');
    history.push(claim);
    if (exists(run, key(revision, 'result'))) {
      result = read(file(run, key(revision, 'result')));
      need(result.revision === revision, 'Composite revision mismatch');
      locale = claim.locale || locale;
      panels = copyRecords(claim.panels, locale, noCopy);
      panel_sources = claim.panel_sources.map((p, i) => ({ ...base.panel_sources[i], ...p }));
      if (claim.design_guidance) design_guidance = claim.design_guidance;
      style_override = claim.style_override || style_override;
      states.set(revision, { result, panels, locale, panel_sources, design_guidance, style_override, revision, variant_id: claim.variant_id || null });
      activeRevision = revision;
      history.push(result);
    } else {
      const failure = exists(run, key(revision, 'failure')) ? read(file(run, key(revision, 'failure'))) : null;
      need(failure?.definitive === true, 'Composite edit pending; resume original call, do not start HD');
      history.push(failure);
    }
  }
  const selection = exists(run, 'composite-selection.json') ? read(file(run, 'composite-selection.json')) : null;
  const latestRevision = revisions.at(-1) || 0;
  const selectedRevision = requestedRevision ?? (selection?.after_revision === latestRevision ? selection.revision : activeRevision);
  const state = states.get(selectedRevision);
  need(state, 'Selected composite revision is unavailable');
  ({ result, panels, locale, panel_sources, design_guidance, style_override } = state);
  need(imageIO({ action: 'inspect', files: [result.image_path] })[0].sha256 === result.sha256, 'Composite changed');
  return { ...state, latest_revision: latestRevision, history, candidates: [...states.values()].map(s => ({ revision: s.revision, variant_id: s.variant_id, image_path: s.result.image_path })), digest: hash(JSON.stringify({ state, history, selection })) };
}

export function selectComposite(run, request) {
  need(!exists(run, 'hd-crops.json'), 'HD production already started');
  need(userMessage(request?.user_request) && Number.isInteger(request.revision), 'Actual user choice and revision required');
  const chosen = currentComposite(run, request.revision);
  const selection = { revision: chosen.revision, after_revision: chosen.latest_revision, user_request: request.user_request };
  fs.writeFileSync(file(run, 'composite-selection.json'), JSON.stringify(selection, null, 2) + '\n');
  return { revision: chosen.revision, image_path: chosen.result.image_path, note: 'Run hd-preview for this selected candidate before HD approval.' };
}

export function claimCompositeRevision(run, request, capability) {
  need(!exists(run, 'hd-crops.json'), 'HD production already started; request a single-image edit instead');
  need(userMessage(request?.user_request), 'Actual user modification request required');
  if (request.design_guidance != null) need(typeof request.design_guidance === 'string' && request.design_guidance.trim(), 'Design guidance must describe only the requested edit');
  if (request.base_revision != null) need(Number.isInteger(request.base_revision) && request.base_revision >= 0, 'Invalid base revision');
  const current = currentComposite(run, request.base_revision ?? null), original = createHandoff(run, capability);
  const sameRequest = current.history.filter(item => item.user_request?.message_id === request.user_request.message_id);
  if (request.variant_ids != null) {
    need(request.style_change === true && Array.isArray(request.variant_ids) && request.variant_ids.length >= 1 && request.variant_ids.length <= 2 && new Set(request.variant_ids).size === request.variant_ids.length && request.variant_ids.every(id => ['A','B','C'].includes(id)) && request.variant_ids.includes(request.variant_id), 'Provide one or two explicitly requested style option IDs');
    need(request.base_revision != null, 'Style candidates must specify a shared base revision');
    need(sameRequest.every(item => item.variant_id !== request.variant_id && item.base_revision === request.base_revision && JSON.stringify(item.variant_ids) === JSON.stringify(request.variant_ids)), 'Style candidate already submitted or request scope changed');
  } else need(sameRequest.length === 0, 'User modification already submitted');
  need(request.user_request.message_id !== read(file(run, 'design-approval.json')).user_response.message_id, 'Need a new user modification after the sample');
  if (request.panels) need(typeof request.fact_review === 'string' && request.fact_review.trim(), 'Copy changes need product-fact review');
  const locale = normalizeLocale(request.locale || current.locale);
  if (locale !== current.locale) {
    need(request.panels, 'Language change requires all six rewritten copy records');
    requireCopyConfirmation(run, request);
  }
  const inputs = read(file(run, 'inputs.json')), blueprint = read(file(run, 'six-image-blueprint.json'));
  const panels = copyRecords(request.panels || current.panels, locale, noCopyPanels(inputs, blueprint));
  if (request.style_change === true) need(typeof request.design_guidance === 'string' && request.design_guidance.trim(), 'Style change requires complete replacement style guidance');
  const styleOverride = request.style_change === true ? request.design_guidance : current.style_override;
  const platformPolicy = isDomestic(inputs)
    ? styleOverride ? `国内电商：${inputs.platform}。白底商品格：${whitePanels(inputs, blueprint).join('、') || '无'}，仅完整商品及确认包含物，无营销文字、人物或装饰。其他无营销文案格：${noCopyPanels(inputs, blueprint).join('、') || '无'}。其余格保留各自卖点任务与全部文案，采用新风格：${styleOverride}` : domesticSetPolicy(inputs, blueprint, read(file(run, 'style-analysis.json')))
    : 'Panel 1 remains a white-background product-only main image without marketing copy.';
  const panel_sources = request.panel_sources
    ? request.panel_sources.map((p, i) => ({ ...current.panel_sources[i], ...p }))
    : current.panel_sources;
  const selected = read(file(run, 'reference-selection.json')).selected;
  need(Array.isArray(panel_sources) && panel_sources.length === 6, 'Provide six panel reference records');
  panel_sources.forEach((p, i) => {
    need(p.index === i + 1 && Array.isArray(p.source_ids) && p.source_ids.length && Array.isArray(p.angle_evidence?.source_ids) && p.angle_evidence.source_ids.length && typeof p.angle_evidence.limits === 'string' && p.angle_evidence.limits.trim(), 'Invalid panel reference record');
    need([...p.source_ids, ...p.angle_evidence.source_ids].every(id => selected.some(s => s.id === id)), 'Revised angle needs selected original product evidence; replan unsupported views');
    for (const key of PANEL_EXECUTION_FIELDS) need(typeof p[key] === 'string' && p[key].trim(), `Revised panel ${p.index} needs ${key}`);
  });
  const references = [current.result.image_path, ...original.tool_arguments.referenced_image_paths];
  if (capability.max_reference_images != null) need(references.length <= capability.max_reference_images, 'Composite plus products exceed observed host limit');
  const designGuidance = request.design_guidance || current.design_guidance;
  const styleSources = (request.style_images || []).map((source, i) => {
    need(request.style_change === true && typeof source === 'string' && path.isAbsolute(source), 'Late style references require a style change and absolute paths');
    const meta = imageIO({ action: 'inspect', files: [source] })[0];
    need(inputs.products.every(p => p.sha256 !== meta.sha256 && p.pixel_sha256 !== meta.pixel_sha256), 'Product images are not style references');
    const dir = file(run, 'style-analysis-only'); fs.mkdirSync(dir, { recursive: true });
    const destination = path.join(dir, `revision-${current.latest_revision + 1}-${i + 1}-${meta.sha256}${path.extname(source)}`);
    if (!fs.existsSync(destination)) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    return { path: destination, original_path: source, ...meta };
  });
  const preservation = request.style_change === true
    ? 'Replace the former style with the complete new style guidance below. You may redesign backgrounds, palette, typography and layout to achieve it. Keep product identity, panel purposes, platform roles and exact copy; do not inherit conflicting old style choices from attachment 1.'
    : `Preserve all unaffected panels and design choices.${styleOverride ? ` Current approved replacement style: ${styleOverride}` : ''}`;
  const prompt = `Edit the existing 2-column by 3-row composite in attachment 1 according to the user's request. Keep six square cells, equal boundaries, no outer margin, no added white gutters or separator strokes, no cross-cell elements. Preserve intentional borders and whitespace within individual designs. ${preservation} Other attachments are original product evidence; do not invent unsupported product features. ${platformPolicy}\nUser requested changes: ${request.user_request.message}${designGuidance ? `\nCurrent requested design adjustments (guidance only, not visible copy): ${designGuidance}` : ''}\nExact final visible copy (language: ${locale}) by panel: ${JSON.stringify(panels.map(({copy_zh,...p}) => p))}. Render verbatim; include every table row, unit and footnote; do not infer copy from blurry pixels.\nProduct attachment IDs in attachment order starting at 2: ${selected.map(s => s.id).join(', ')}. Panel reference guidance: ${JSON.stringify(panel_sources)}.\nProduct identity: ${JSON.stringify(read(file(run, 'product-understanding.json')).identity_lock)}.`;
  const claim = { revision: current.latest_revision + 1, canvas_ratio: '2:3', task_role: 'composite', base_revision: current.revision, base_sha256: current.result.sha256, user_request: request.user_request, design_guidance: designGuidance, style_override: styleOverride, style_sources: styleSources, style_change: request.style_change === true, variant_id: request.variant_id || null, variant_ids: request.variant_ids || null, panels, locale, panel_sources, fact_review: request.fact_review || null, tool: capability.tool, capability,
    tool_arguments: { prompt, referenced_image_paths: references, transparent_background: false } };
  write(file(run, key(claim.revision, 'claim')), claim);
  return claim;
}

export function saveCompositeRevision(run, revision, imagePath, evidence) {
  need(Number.isInteger(revision) && revision >= 1 && typeof evidence === 'string' && evidence.trim(), 'Actual revision and tool evidence required');
  const claim = read(file(run, key(revision, 'claim')));
  need(!fs.readdirSync(run).some(n => /^composite-\d+-claim\.json$/.test(n) && Number(n.split('-')[1]) > revision), 'A newer composite edit exists');
  const info = imageIO({ action: 'inspect', files: [imagePath] })[0];
  need(!imageIO({ action: 'inspect', files: claim.tool_arguments.referenced_image_paths }).some(p => p.pixel_sha256 === info.pixel_sha256), 'Reference is not generated output');
  if (exists(run, key(revision, 'result'))) {
    const old = read(file(run, key(revision, 'result')));
    need(old.original_sha256 === info.sha256, 'Different revision result already saved');
    return old;
  }
  const base = read(file(run, 'generation-result.json'));
  const destination = path.join(path.dirname(base.image_path), `composite-preview-r${revision}.png`);
  if (!fs.existsSync(destination)) imageIO({ action: 'save_png', source: imagePath, destination });
  const saved = imageIO({ action: 'inspect', files: [destination] })[0];
  need(saved.pixel_sha256 === info.pixel_sha256, 'Saved revision differs from tool result');
  const result = { revision, image_path: destination, ...saved, original_sha256: info.sha256, tool: claim.tool, host: claim.capability?.host || 'codex', model: claim.capability?.selection?.model || null, host_evidence: evidence, status: 'generated_awaiting_user_review' };
  write(file(run, key(revision, 'result')), result);
  return result;
}

export function failCompositeRevision(run, revision, failure) {
  read(file(run, key(revision, 'claim')));
  need(!exists(run, key(revision, 'result')), 'Output already exists');
  need(typeof failure.reason === 'string' && failure.reason.trim() && typeof failure.host_evidence === 'string' && failure.host_evidence.trim() && typeof failure.definitive === 'boolean', 'Actual failure evidence required');
  fs.writeFileSync(file(run, key(revision, 'failure')), JSON.stringify(failure, null, 2));
  return failure;
}
