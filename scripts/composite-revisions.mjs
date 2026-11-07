import fs from 'node:fs';
import path from 'node:path';
import { read, write, need, hash, imageIO, createHandoff, requireApproval } from './workflow.mjs';
import { normalizeLocale, validateVisibleCopy, requireCopyConfirmation } from './copy-language.mjs';
import { userMessage } from './interaction.mjs';

const file = (run, name) => path.join(run, name);
const exists = (run, name) => fs.existsSync(file(run, name));
const key = (revision, suffix) => `composite-${revision}-${suffix}.json`;

export function copyRecord(p, index, locale) {
  need(p.index === index && typeof p.title === 'string' && typeof p.subtitle === 'string' && Array.isArray(p.extra_copy) && p.extra_copy.every(s => typeof s === 'string' && s.trim()) && typeof p.copy_zh === 'string' && p.copy_zh.trim(), 'Invalid final copy record');
  validateVisibleCopy(p, locale);
  if (index === 1) need(!p.title && !p.subtitle && p.extra_copy.length === 0, 'White main image has no marketing copy');
  return { index, title: p.title, subtitle: p.subtitle, extra_copy: p.extra_copy, copy_zh: p.copy_zh };
}

export function copyRecords(panels, locale = 'en-US') {
  need(Array.isArray(panels) && panels.length === 6, 'Provide all six final copy records');
  return panels.map((p, i) => copyRecord(p, i + 1, locale));
}

export function currentComposite(run) {
  requireApproval(run);
  let result = read(file(run, 'generation-result.json'));
  const blueprint = read(file(run, 'six-image-blueprint.json'));
  let locale = read(file(run, 'inputs.json')).locale;
  let panels = copyRecords(blueprint.panels, locale);
  let panel_sources = blueprint.panels.map(p => ({ index: p.index, source_ids: p.source_ids, angle_evidence: p.angle_evidence }));
  const history = [];
  const revisions = fs.readdirSync(run).filter(n => /^composite-\d+-claim\.json$/.test(n)).map(n => Number(n.split('-')[1])).sort((a,b) => a-b);
  for (const revision of revisions) {
    const claim = read(file(run, key(revision, 'claim')));
    need(claim.base_sha256 === result.sha256, 'Composite revision belongs to another sample');
    history.push(claim);
    if (exists(run, key(revision, 'result'))) {
      result = read(file(run, key(revision, 'result')));
      need(result.revision === revision, 'Composite revision mismatch');
      locale = claim.locale || locale;
      panels = copyRecords(claim.panels, locale);
      panel_sources = claim.panel_sources;
      history.push(result);
    } else {
      const failure = exists(run, key(revision, 'failure')) ? read(file(run, key(revision, 'failure'))) : null;
      need(failure?.definitive === true, 'Composite edit pending; resume original call, do not start HD');
      history.push(failure);
    }
  }
  need(imageIO({ action: 'inspect', files: [result.image_path] })[0].sha256 === result.sha256, 'Composite changed');
  return { result, panels, locale, panel_sources, revision: revisions.at(-1) || 0, history, digest: hash(JSON.stringify({ result, panels, locale, panel_sources, history })) };
}

export function claimCompositeRevision(run, request, capability) {
  need(!exists(run, 'hd-crops.json'), 'HD production already started; request a single-image edit instead');
  need(userMessage(request?.user_request), 'Actual user modification request required');
  const current = currentComposite(run), original = createHandoff(run, capability);
  need(!current.history.some(item => item.user_request?.message_id === request.user_request.message_id), 'User modification already submitted');
  need(request.user_request.message_id !== read(file(run, 'design-approval.json')).user_response.message_id, 'Need a new user modification after the sample');
  if (request.panels) need(typeof request.fact_review === 'string' && request.fact_review.trim(), 'Copy changes need product-fact review');
  const locale = normalizeLocale(request.locale || current.locale);
  if (locale !== current.locale) {
    need(request.panels, 'Language change requires all six rewritten copy records');
    requireCopyConfirmation(run, request);
  }
  const panels = copyRecords(request.panels || current.panels, locale);
  const panel_sources = request.panel_sources || current.panel_sources;
  const selected = read(file(run, 'reference-selection.json')).selected;
  need(Array.isArray(panel_sources) && panel_sources.length === 6, 'Provide six panel reference records');
  panel_sources.forEach((p, i) => {
    need(p.index === i + 1 && Array.isArray(p.source_ids) && p.source_ids.length && Array.isArray(p.angle_evidence?.source_ids) && p.angle_evidence.source_ids.length && typeof p.angle_evidence.limits === 'string' && p.angle_evidence.limits.trim(), 'Invalid panel reference record');
    need([...p.source_ids, ...p.angle_evidence.source_ids].every(id => selected.some(s => s.id === id)), 'Revised angle needs selected original product evidence; replan unsupported views');
  });
  const references = [current.result.image_path, ...original.tool_arguments.referenced_image_paths];
  if (capability.max_reference_images != null) need(references.length <= capability.max_reference_images, 'Composite plus products exceed observed host limit');
  const prompt = `Edit the existing 2-column by 3-row composite in attachment 1 according to the user's request. Keep six square cells, equal boundaries, no outer margin, no cross-cell elements. Preserve all unaffected panels and design choices. Other attachments are original product evidence; do not invent unsupported product features. Panel 1 remains a white-background product-only main image without marketing copy.\nUser requested changes: ${request.user_request.message}\nExact final visible copy (language: ${locale}) by panel: ${JSON.stringify(panels.map(({copy_zh,...p}) => p))}. Render verbatim; include every table row, unit and footnote; do not infer copy from blurry pixels.\nProduct attachment IDs in attachment order starting at 2: ${selected.map(s => s.id).join(', ')}. Panel reference guidance: ${JSON.stringify(panel_sources)}.\nProduct identity: ${JSON.stringify(read(file(run, 'product-understanding.json')).identity_lock)}.`;
  const claim = { revision: current.revision + 1, base_sha256: current.result.sha256, user_request: request.user_request, panels, locale, panel_sources, fact_review: request.fact_review || null, tool: capability.tool, capability,
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
