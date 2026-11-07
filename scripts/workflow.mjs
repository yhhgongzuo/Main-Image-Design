import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runPython } from './python-runtime.mjs';
import { validateCapability } from './host-adapter.mjs';
import { auditCreative, validateCreative } from './creative-direction.mjs';
import { panelDirection } from './creative-direction.mjs';
import { buildPrompt } from './creative-brief.mjs';
import { normalizeLocale, languageName, isChinese, validateVisibleCopy } from './copy-language.mjs';
import { evidenceTagsForRole } from './reference-roles.mjs';
import { initialInteraction, validateInteraction, userMessage } from './interaction.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ID = 'ahui-main-image-design';
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
export const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = (value, label) => need(typeof value === 'string' && value.trim(), `${label} must be nonempty text`);
const strings = (value, label, min = 1) => {
  need(Array.isArray(value) && value.length >= min, `${label} needs ${min}+ items`);
  value.forEach(v => text(v, label));
};
export function imageIO(request) {
  const p = runPython([path.join(root, 'scripts/image_io.py')], {
    input: JSON.stringify(request), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, shell: false,
  });
  need(p.status === 0, `Image IO needs Python 3 + Pillow: ${p.error?.message || p.stderr}`);
  return JSON.parse(p.stdout);
}
function inside(base, file) {
  const rel = path.relative(fs.realpathSync(base), fs.realpathSync(file));
  return rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}
function runFile(run, name) { return path.join(path.resolve(run), name); }
function manifest(run) {
  const m = read(runFile(run, 'inputs.json'));
  need(m.skill === ID && m.run_id === path.basename(path.resolve(run)), 'Wrong skill/run manifest');
  const interactionFile = runFile(run, 'interaction.json');
  if (fs.existsSync(interactionFile)) m.followup_text = read(interactionFile).information?.response?.message || '';
  return m;
}
function unchanged(run, m) {
  for (const item of [...m.products, ...(m.styles || (m.style ? [m.style] : []))]) {
    const file = runFile(run, item.path);
    need(inside(run, file), 'Source outside run');
    need(hash(fs.readFileSync(file)) === item.sha256, 'Source snapshot changed');
  }
}

export function inspectInputs(input, workspace = process.cwd()) {
  need(Array.isArray(input.product_images) && input.product_images.length, '请上传至少一张产品图片。');
  need(input.style_images == null || Array.isArray(input.style_images), 'style_images must be an array');
  need(!(input.style_image && input.style_images?.length), 'Use style_images or legacy style_image, not both');
  const stylePaths = input.style_images?.length ? input.style_images : (input.style_image ? [input.style_image] : []);
  need(input.product_images.every(p => typeof p === 'string' && path.isAbsolute(p)) && stylePaths.every(p => typeof p === 'string' && path.isAbsolute(p)), 'Image paths must be absolute');
  need(!input.platform || ['amazon', 'amazon us', 'amazon.com', '亚马逊', '亚马逊美国站', '美国站'].includes(input.platform.trim().toLowerCase()), 'This version targets Amazon US');
  need(!input.marketplace || input.marketplace === 'amazon.com', 'Amazon.com only');
  const locale = normalizeLocale(input.locale || 'en-US');
  need(input.panel_count == null || input.panel_count === 6, 'Exactly six panels required');
  need(input.output_count == null || input.output_count === 6, 'Exactly six final outputs required');
  need(!input.workflow_mode || ['generate', 'plan'].includes(input.workflow_mode), 'workflow_mode must be generate or plan');
  const paths = [...input.product_images, ...stylePaths].map(p => fs.realpathSync(p));
  const info = imageIO({ action: 'inspect', files: paths });
  const styleInfo = info.slice(input.product_images.length);
  for (const item of info.slice(0, input.product_images.length)) {
    need(styleInfo.every(s => item.sha256 !== s.sha256 && item.pixel_sha256 !== s.pixel_sha256), 'Style image cannot also be a product image (path/content/pixels)');
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const base = path.resolve(workspace, 'work', ID);
  fs.mkdirSync(base, { recursive: true });
  const run = path.join(base, runId);
  fs.mkdirSync(run); // Exclusive run, no caller-controlled ID or shared output.
  fs.mkdirSync(path.join(run, 'products'));
  fs.mkdirSync(path.join(run, 'style-analysis-only'));
  fs.mkdirSync(path.join(run, 'prepared-products'));
  const save = (i, kind) => {
    const id = kind === 'product' ? `P${i + 1}` : `STYLE${i - input.product_images.length + 1}`;
    const dest = `${kind === 'product' ? 'products' : 'style-analysis-only'}/${id}${path.extname(paths[i])}`;
    fs.copyFileSync(paths[i], runFile(run, dest), fs.constants.COPYFILE_EXCL);
    return { id, kind, path: dest, original_path: paths[i], ...info[i] };
  };
  const docs = (input.information_files || []).map((file, i) => {
    need(path.isAbsolute(file), 'Information paths must be absolute');
    const ext = path.extname(file).toLowerCase();
    const target = `information-${i + 1}${ext}`;
    fs.copyFileSync(file, runFile(run, target), fs.constants.COPYFILE_EXCL);
    return { id: `D${i + 1}`, path: target, text: ['.txt', '.md', '.json'].includes(ext) ? fs.readFileSync(file, 'utf8') : ext === '.docx' ? imageIO({ action: 'read_docx', source: file }).text : null };
  });
  const styles = stylePaths.map((_, i) => save(input.product_images.length + i, 'style'));
  const m = { skill: ID, version: '3.3.1', run_id: runId, workspace: path.resolve(workspace),
    products: input.product_images.map((_, i) => save(i, 'product')), styles, style: styles[0] || null,
    user_text: input.user_text || '', information_files: docs, platform: 'Amazon US', marketplace: 'amazon.com', locale,
    workflow_mode: input.workflow_mode || 'plan', generation_request: input.generation_request || null,
    main_product_id: input.main_product_id || null };
  write(runFile(run, 'inputs.json'), m);
  write(runFile(run, 'interaction.json'), initialInteraction(m));
  return { run_dir: run, status: 'awaiting_codex_visual_analysis', products: m.products, styles: m.styles, style: m.style, information_files: docs };
}

export function setStyleReferences(run, request) {
  const m = manifest(run); unchanged(run, m);
  need(!fs.existsSync(runFile(run, 'generation-claim.json')), 'Generation already claimed; reference changes need a new design');
  need(userMessage(request?.user_request), 'Actual style upload request required');
  need(Array.isArray(request.style_images) && request.style_images.length && request.style_images.every(p => typeof p === 'string' && path.isAbsolute(p)), 'Provide absolute style_images paths');
  const paths = request.style_images.map(p => fs.realpathSync(p));
  const info = imageIO({ action: 'inspect', files: paths });
  need(info.every(s => m.products.every(p => p.sha256 !== s.sha256 && p.pixel_sha256 !== s.pixel_sha256)), 'Style image cannot also be a product image');
  const styles = info.map((meta, i) => {
    const id = `STYLE${i + 1}`, dest = `style-analysis-only/${id}-${meta.sha256}${path.extname(paths[i])}`;
    if (!fs.existsSync(runFile(run, dest))) fs.copyFileSync(paths[i], runFile(run, dest), fs.constants.COPYFILE_EXCL);
    return { id, kind: 'style', path: dest, original_path: paths[i], ...meta };
  });
  replaceJSON(runFile(run, 'inputs.json'), { ...m, styles, style: styles[0], style_request: request.user_request });
  const interaction = read(runFile(run, 'interaction.json'));
  interaction.style = { mode: 'reference', status: 'ready', options: [], selected_id: null, response: request.user_request };
  replaceJSON(runFile(run, 'interaction.json'), interaction);
  if (fs.existsSync(runFile(run, 'style-analysis.json'))) {
    const analysis = read(runFile(run, 'style-analysis.json'));
    replaceJSON(runFile(run, 'style-analysis.json'), { ...analysis, status: 'pending', origin: 'reference', option_id: '', source_ids: styles.map(s => s.id) });
  }
  invalidateChangedDesign(run);
  return { status: 'needs_style_analysis', styles, note: 'Inspect every reference, update style analysis and six-panel plan, then preview again.' };
}

export function setCopyLanguage(run, request) {
  const m = manifest(run); unchanged(run, m);
  need(!fs.existsSync(runFile(run, 'generation-claim.json')), 'Generation already claimed; use a confirmed copy-change request instead');
  need(userMessage(request?.user_request), 'Actual language change request required');
  const locale = normalizeLocale(request.locale);
  replaceJSON(runFile(run, 'inputs.json'), { ...m, locale, language_request: request.user_request });
  invalidateChangedDesign(run);
  return { status: 'needs_copy_rewrite', locale, note: 'Rewrite title/subtitle/extra_copy and copy_zh for all six panels, set blueprint.copy_locale, audit and preview; wait for a new confirmation.' };
}

export function validateProduct(p, m) {
  need(p.status === 'reviewed', 'Product analysis must be visually reviewed');
  for (const k of ['product_id', 'name', 'category', 'identity_summary']) text(p[k], `product.${k}`);
  if (m.main_product_id) need(p.product_id === m.main_product_id, 'Selected main product mismatch');
  strings(p.unknowns, 'unknowns', 0);
  need(Array.isArray(p.sources) && p.sources.length === m.products.length, 'Inspect every product reference');
  const seen = new Set();
  for (const s of p.sources) {
    need(m.products.some(i => i.id === s.id) && !seen.has(s.id), 'Unknown/duplicate product source ID'); seen.add(s.id);
    need(['main_product', 'other_product', 'uncertain'].includes(s.membership), 'Source membership is required');
    text(s.visual_summary, 'source visual_summary'); text(s.unique_contribution, 'source contribution');
    text(s.product_id, 'source product identity');
    need(evidenceTagsForRole(s.role).length, 'Invalid confirmed visual role');
    need(typeof s.quality === 'number' && s.quality >= 0 && s.quality <= 1, 'Quality must be 0..1');
    strings(s.observed_facts, 'observed facts', 0); strings(s.uncertainty_notes, 'uncertainties', 0);
    need(['clear', 'unclear', 'not_visible'].includes(s.visible_text?.status), 'Visible text status required');
    strings(s.visible_text.items, 'visible text', 0);
    if (s.membership === 'main_product') need(s.product_id === p.product_id, 'Mixed product identity');
  }
  need(p.sources.some(s => s.membership === 'main_product' && s.role === 'primary_identity'), 'Need visually confirmed main-product identity reference');
  for (const k of ['silhouette', 'proportions', 'color', 'structure', 'material_appearance', 'logo_policy']) text(p.identity_lock?.[k], `identity_lock.${k}`);
  strings(p.identity_lock.components, 'components'); strings(p.identity_lock.must_preserve, 'must_preserve');
  strings(p.identity_lock.forbidden_changes, 'forbidden_changes'); strings(p.identity_lock.accessories, 'accessories', 0);
  strings(p.identity_lock.geometry_constraints, 'geometry constraints');
  need(Array.isArray(p.facts), 'facts must be an array');
  const factIds = new Set();
  for (const f of p.facts) {
    text(f.id, 'fact ID'); need(!factIds.has(f.id), 'Duplicate fact'); factIds.add(f.id);
    text(f.statement, 'fact statement'); text(f.evidence, 'fact evidence');
    need(['user', 'image', 'generic'].includes(f.source), 'Invalid fact source');
    strings(f.source_ids, 'fact source_ids', f.source === 'generic' ? 0 : 1);
    for (const id of f.source_ids) {
      if (f.source === 'image') need(p.sources.some(s => s.id === id && s.membership === 'main_product'), 'Fact uses non-product evidence');
      if (f.source === 'user') need((id === 'CHAT' && (m.user_text || m.followup_text)) || m.information_files.some(d => d.id === id), 'Missing user fact evidence');
    }
    if (f.source === 'generic') need(f.source_ids.length === 0 && !/\d|防水|认证|功率|承重|容量|转速|纯棉|真皮|waterproof|certif|watt|rpm/i.test(f.statement), 'Unsupported factual claim in generic copy');
  }
  need(Array.isArray(p.selling_points), 'selling_points must be an array');
  for (const sp of p.selling_points) { text(sp.text, 'selling point'); strings(sp.fact_ids, 'selling point facts'); sp.fact_ids.forEach(id => need(factIds.has(id), 'Unsupported selling point')); }
}

export const STYLE_FIELDS = {
  positioning: ['dominant_style', 'visual_temperament'],
  color: ['background', 'primary', 'secondary', 'accent', 'temperature', 'contrast', 'brightness_saturation', 'area_ratios', 'product_relationship'],
  typography: ['family_character', 'weight_contrast', 'hierarchy', 'title_subtitle_relation', 'density', 'whitespace', 'alignment', 'product_relationship', 'brand_character'],
  photography: ['angle', 'occupancy', 'depth_of_field', 'lens_feel', 'placement', 'material_rendering', 'realism', 'spatial_relationship'],
  lighting: ['direction', 'hardness', 'highlights', 'shadows'],
  background: ['type', 'surfaces', 'depth_layers', 'focus_atmosphere', 'negative_space'],
  composition: ['symmetry', 'visual_center', 'text_product_relation', 'density', 'hierarchy', 'eye_path', 'impact', 'decoration'],
  commercial_aesthetics: ['quality_drivers', 'product_prominence', 'cleanliness', 'brand_feeling'],
};
export function validateStyle(s) {
  need(s.status === 'reviewed', 'Style decision must be reviewed'); text(s.name, 'style name'); text(s.creative_summary, 'style creative_summary');
  need(['reference', 'recommendation'].includes(s.origin), 'Style origin required');
  if (s.origin === 'recommendation') text(s.option_id, 'selected style option');
  else for (const [section, fields] of Object.entries(STYLE_FIELDS)) for (const key of fields) text(s[section]?.[key], `style.${section}.${key}`);
  const modes = s.origin === 'reference' ? ['full_style', 'selective', 'quality_only'] : ['none'];
  need(modes.includes(s.reference_intent?.mode), 'Reference intent must match style origin');
  text(s.reference_intent.basis, 'reference intent basis');
  strings(s.transferable, 'transferable elements'); strings(s.do_not_copy, 'do_not_copy'); strings(s.set_rules, 'set rules');
  strings(s.uncertainties, 'style uncertainties', 0);
  // Reports are textual design language only, never image attachments or embedded image data.
  need(!/(data:image|"(?:source_images|referenced_image_paths|image_url|path)"\s*:)/i.test(JSON.stringify(s)), 'Style analysis must contain text only');
}
export function styleLock(s) {
  validateStyle(s);
  return { id: `STYLE-${hash(JSON.stringify(s)).slice(0, 12)}`, name: s.name,
    reference_intent: s.reference_intent, creative_summary: s.creative_summary, positioning: s.positioning, color: s.color, typography: s.typography, photography: s.photography,
    lighting: s.lighting, background: s.background, composition: s.composition,
    commercial_aesthetics: s.commercial_aesthetics, transferable: s.transferable,
    do_not_copy: s.do_not_copy, set_rules: s.set_rules,
    precedence: 'product_facts > approved_copy_and_content > global_style > creative_layout' };
}

export function selectReferences(p, m, limits = {}, requiredIds = []) {
  // Local conservative upload budget, NOT a claim about undocumented native tool limits.
  const budget = { max_count: 4, max_per_image_bytes: 12 * 1024 * 1024, max_total_bytes: 20 * 1024 * 1024, ...limits };
  for (const value of Object.values(budget)) need(Number.isInteger(value) && value > 0, 'Invalid reference budget');
  const selected = [], excluded = [], pixels = new Set(), tags = new Set();
  let bytes = 0;
  const candidates = p.sources.map(s => ({ ...s, asset: m.products.find(i => i.id === s.id) }));
  candidates.sort((a, b) => Number(b.role === 'primary_identity') - Number(a.role === 'primary_identity') || b.quality - a.quality);
  while (candidates.length) {
    if (selected.length) candidates.sort((a, b) => {
      const score = s => evidenceTagsForRole(s.role).filter(t => !tags.has(t)).length * 10 + s.quality;
      return Number(requiredIds.includes(b.id)) - Number(requiredIds.includes(a.id)) || score(b) - score(a);
    });
    const s = candidates.shift();
    let reason;
    if (s.membership !== 'main_product' || s.product_id !== p.product_id) reason = 'not_main_product';
    else if (m.style && (s.asset.sha256 === m.style.sha256 || s.asset.pixel_sha256 === m.style.pixel_sha256)) reason = 'style_forbidden';
    else if (pixels.has(s.asset.pixel_sha256)) reason = 'duplicate_pixels';
    else if (selected.length >= budget.max_count) reason = 'count_budget';
    else if (s.asset.bytes > budget.max_per_image_bytes || bytes + s.asset.bytes > budget.max_total_bytes) reason = 'byte_budget';
    else if (selected.length && !requiredIds.includes(s.id) && !evidenceTagsForRole(s.role).some(t => !tags.has(t))) reason = 'no_unique_role_evidence';
    if (reason) { excluded.push({ id: s.id, reason }); continue; }
    selected.push({ id: s.id, role: s.role, path: s.asset.path, sha256: s.asset.sha256, pixel_sha256: s.asset.pixel_sha256, reason: s.unique_contribution });
    pixels.add(s.asset.pixel_sha256); evidenceTagsForRole(s.role).forEach(t => tags.add(t)); bytes += s.asset.bytes;
  }
  need(selected.some(s => s.role === 'primary_identity'), 'Primary identity image does not fit budget; prepare product derivative before compilation');
  return { selected, excluded, budget, budget_source: 'workflow_default_or_observed_host_limit', total_bytes: bytes };
}

export function validateKnowledgeBasis(basis) {
  need(basis?.mode === 'local', 'Local knowledge basis required; no competitor research');
  text(basis.application, 'product-specific knowledge application');
}

export function validateBlueprint(b, p, lock, m) {
  need(b.status === 'reviewed' && b.global_style_lock_id === lock.id, 'Blueprint must inherit current style lock');
  need(Array.isArray(b.panels) && b.panels.length === 6, 'Exactly six logical panels required');
  validateKnowledgeBasis(b.knowledge_basis);
  text(b.audience, 'audience'); text(b.planning_rationale, 'product-specific planning rationale');
  need(b.global_review?.style_coherent === true && b.global_review?.product_truth_checked === true && b.global_review?.distinct_content === true, 'Pre-generation global review required');
  text(b.global_review.notes, 'global review notes');
  const facts = new Set(p.facts.map(f => f.id));
  for (const [i, panel] of b.panels.entries()) {
    need(panel.index === i + 1, 'Panel order must be 1..6');
    for (const field of ['purpose', 'buyer_question', 'objective', 'creative_direction']) text(panel[field], `panel.${field}`);
    strings(panel.source_ids, 'panel source evidence');
    panel.source_ids.forEach(id => need(p.sources.some(s => s.id === id && s.membership === 'main_product'), 'Panel source is not main product'));
    strings(panel.fact_ids, 'panel facts', 0); panel.fact_ids.forEach(id => need(facts.has(id), 'Panel uses unsupported fact'));
    for (const key of ['title', 'subtitle']) need(typeof panel[key] === 'string', 'Use short mobile-readable copy');
    strings(panel.extra_copy, 'extra_copy', 0);
    text(panel.copy_zh, 'Chinese explanation of all visible copy (or no copy)');
    need(!(panel.title || panel.subtitle || panel.extra_copy.length) || panel.fact_ids.length, 'Visible copy needs fact support (including conservative generic facts)');
    need(!panel.style_override, 'Panel may not override global style');
  }
  validateCreative(b, p, lock, need);
  need(new Set(b.panels.map(p => p.buyer_question)).size === 6, 'Six distinct buyer questions required');
  need(b.platform_rules && typeof b.platform_rules.first_panel_white_background === 'boolean', 'Record platform main-image rule');
  if (m.platform) { text(b.platform_rules.basis, 'platform rule evidence'); need(b.platform_rules.status === 'confirmed', 'Confirm applicable platform rules before generation'); }
  need(m.marketplace === 'amazon.com', 'Amazon US profile required');
  normalizeLocale(m.locale);
  need((b.copy_locale || 'en-US') === m.locale, 'Copy language changed; rewrite all copy and set copy_locale before preview');
  need(b.platform_rules.first_panel_white_background, 'Amazon listing main image needs white background');
  for (const panel of b.panels) validateVisibleCopy(panel, m.locale);
  if (b.platform_rules.first_panel_white_background) {
    const first = b.panels[0];
    need(first.background === '#FFFFFF' && !first.title && !first.subtitle && first.extra_copy.length === 0 && first.product_only === true, 'White listing first panel: #FFFFFF, product only, no marketing copy');
  }
}

export function reviewCreativePlan(run) {
  const m = manifest(run); unchanged(run, m);
  const p = read(runFile(run, 'product-understanding.json'));
  validateProduct(p, m);
  const lock = styleLock(read(runFile(run, 'style-analysis.json')));
  const b = read(runFile(run, 'six-image-blueprint.json'));
  need(Array.isArray(b.panels) && b.panels.length === 6, 'Exactly six logical panels required');
  return auditCreative(b, p, lock);
}

function designSnapshot(run, limits = {}) {
  const m = manifest(run); unchanged(run, m);
  need(m.version === '3.3.1', 'V3.3 requires a new run with current design and approval');
  const p = read(runFile(run, 'product-understanding.json'));
  const s = read(runFile(run, 'style-analysis.json'));
  const b = read(runFile(run, 'six-image-blueprint.json'));
  const interaction = validateInteraction(m, read(runFile(run, 'interaction.json')), s);
  validateProduct(p, m); const lock = styleLock(s); validateBlueprint(b, p, lock, m);
  const prepared = fs.existsSync(runFile(run, 'prepared-references.json')) ? read(runFile(run, 'prepared-references.json')) : m.products;
  const selection = selectReferences(p, { ...m, products: prepared }, limits, b.panels.flatMap(x => [...x.angle_evidence.source_ids, ...x.source_ids]));
  for (const panel of b.panels) need(panel.angle_evidence.source_ids.every(id => selection.selected.some(x => x.id === id)), `Panel ${panel.index} angle evidence not selected; adjust references or replan before approval`);
  for (const panel of b.panels) need(panel.source_ids.every(id => selection.selected.some(x => x.id === id)), 'Panel product evidence not selected; keep only required matching references or adjust the budget before approval');
  const material = { m, p, s, b, interaction, prepared, selection };
  return { ...material, digest: hash(JSON.stringify(material)) };
}
const replaceJSON = (file, data) => {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, file);
};
const explicitApproval = message => typeof message === 'string' && message.trim() === '确认生成';

const designSourceDigest = run => hash(JSON.stringify(['inputs.json', 'product-understanding.json', 'style-analysis.json', 'six-image-blueprint.json', 'interaction.json'].map(name => read(runFile(run, name)))));
function invalidateChangedDesign(run) {
  const file = runFile(run, 'design-approval.json');
  if (!fs.existsSync(file)) return;
  const old = read(file);
  if (old.source_digest !== designSourceDigest(run)) replaceJSON(file, { ...old,
    status: 'awaiting_approval', task_status: 'awaiting_design_approval', approved: false,
    can_generate: false, approved_version: null });
}

export function presentDesign(run, limits = {}) {
  invalidateChangedDesign(run);
  need(!fs.existsSync(runFile(run, 'generation-claim.json')), 'Generation already claimed; use a new run for a requested remake');
  const snap = designSnapshot(run, limits), file = runFile(run, 'design-approval.json');
  const old = fs.existsSync(file) ? read(file) : null;
  const same = old?.run_id === snap.m.run_id && old.digest === snap.digest;
  const state = same ? old : {
    skill: ID, run_id: snap.m.run_id, design_id: snap.m.run_id,
    version: (old?.version || 0) + 1, digest: snap.digest, source_digest: designSourceDigest(run),
    status: 'awaiting_approval', task_status: 'awaiting_design_approval',
    approved: false, can_generate: false, approved_version: null,
    modified_at: new Date().toISOString(), selection: snap.selection, panels: snap.b.panels,
  };
  const cell = value => String(value || '—').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const knowledgeSummary = `策划依据：本地亚马逊主图知识库。${snap.b.knowledge_basis.application}\n\n`;
  const chinese = isChinese(snap.m.locale);
  const preview = `产品：${snap.p.name}\n\n默认流程：亚马逊主图；图片语言：${languageName(snap.m.locale)}。交付：1张白底首图＋5张副图；先审阅2列×3行样稿，确认后交付六张独立正方形图片，原生2K优先、约1K可接受，不强制放大。\n\n风格：${snap.s.name}\n${snap.s.reference_intent.basis}\n采用：${snap.s.transferable.join("；")}\n不迁移：${snap.s.do_not_copy.join("；")}\n执行标准：${snap.s.set_rules.join("；")}\n\n${knowledgeSummary}| 图片 | 核心卖点 | 最终上图文案（${languageName(snap.m.locale)}，全部） | ${chinese ? '' : '中文释义 | '}场景、动作与构图 |\n|---|---|---|${chinese ? '' : '---|'}---|\n` +
    snap.b.panels.map(x => `| ${String(x.index).padStart(2, '0')} | ${[`${x.purpose}：${x.objective}`, [x.title, x.subtitle, ...x.extra_copy].filter(Boolean).join(' / ') || '无额外营销文案', ...(chinese ? [] : [x.copy_zh]), panelDirection(x)].map(cell).join(' | ')} |`).join('\n') +
    '\n\n图片文案默认英文。想换语言，直接说“改成中文版”或告诉我需要哪种语言；我会重新列出全部文案，请你确认后再生成。\n\n以上为当前完整方案。可提出修改；全部认可后请单独回复“确认生成”。修改后需重新确认。\n';
  fs.writeFileSync(runFile(run, 'design-preview.md'), preview);
  replaceJSON(file, state);
  return { ...state, preview };
}

export function approveDesign(run, response) {
  invalidateChangedDesign(run);
  need(userMessage(response) && explicitApproval(response.message), 'Explicit user approval required; modifications must be handled first');
  text(response.message_id, 'Actual user message reference');
  const file = runFile(run, 'design-approval.json'), old = read(file);
  need(old.skill === ID && old.run_id === manifest(run).run_id, 'Approval belongs to another run');
  const snap = designSnapshot(run, old.selection.budget);
  if (snap.digest !== old.digest) { presentDesign(run, old.selection.budget); throw new Error('Design changed; display revised plan and request approval again'); }
  need(response.version === old.version && response.digest === old.digest, 'Approval does not match displayed version');
  const state = { ...old, authorization_mode: 'manual', status: 'approved', task_status: 'design_approved', approved: true, can_generate: true,
    approved_version: old.version, approved_at: new Date().toISOString(), user_response: response };
  replaceJSON(file, state); return state;
}

export function requireApproval(run) {
  invalidateChangedDesign(run);
  const file = runFile(run, 'design-approval.json');
  need(fs.existsSync(file), 'Design approval required before generation');
  const state = read(file);
  need(state.skill === ID && state.run_id === manifest(run).run_id, 'Approval belongs to another run');
  const snap = designSnapshot(run, state.selection.budget);
  if (snap.digest !== state.digest) {
    if (!fs.existsSync(runFile(run, 'generation-claim.json'))) presentDesign(run, state.selection.budget);
    throw new Error('Design changed; approval invalidated');
  }
  need(state.status === 'approved' && state.approved && state.can_generate && state.approved_version === state.version &&
    state.authorization_mode === 'manual' && userMessage(state.user_response) && explicitApproval(state.user_response.message) &&
    state.user_response.version === state.version && state.user_response.digest === state.digest, 'Valid explicit user approval required');
  return state;
}

export function prepareProductReferences(run) {
  const m = manifest(run); unchanged(run, m);
  need(!fs.existsSync(runFile(run, 'composite-plan.json')), 'Prepare before compiling');
  const prepared = m.products.map(item => {
    if (item.bytes <= 12 * 1024 * 1024 && item.width <= 4096 && item.height <= 4096 && ['PNG','JPEG','WEBP'].includes(item.format)) return item;
    const dest = `prepared-products/${item.id}.png`;
    const meta = imageIO({ action: 'prepare', source: runFile(run, item.path), destination: runFile(run, dest), max_side: 4096 });
    return { ...item, path: dest, ...meta, original_sha256: item.sha256 };
  });
  write(runFile(run, 'prepared-references.json'), prepared);
  return { prepared_count: prepared.filter(p => p.original_sha256).length };
}
export function compilePlan(run, limits = {}) {
  invalidateChangedDesign(run);
  const m = manifest(run); unchanged(run, m);
  need(!fs.existsSync(runFile(run, 'generation-claim.json')), 'Generation already claimed');
  const p = read(runFile(run, 'product-understanding.json'));
  const s = read(runFile(run, 'style-analysis.json'));
  const b = read(runFile(run, 'six-image-blueprint.json'));
  const interaction = validateInteraction(m, read(runFile(run, 'interaction.json')), s);
  validateProduct(p, m); const lock = styleLock(s); validateBlueprint(b, p, lock, m);
  const prepared = fs.existsSync(runFile(run, 'prepared-references.json')) ? read(runFile(run, 'prepared-references.json')) : m.products;
  need(prepared.length === m.products.length, 'Prepared reference membership mismatch');
  for (const asset of prepared) {
    const original = m.products.find(i => i.id === asset.id);
    need(original && (asset.original_sha256 || asset.sha256) === original.sha256, 'Prepared image has no product provenance');
    const folder = asset.original_sha256 ? 'prepared-products' : 'products';
    need(inside(runFile(run, folder), runFile(run, asset.path)), 'Prepared reference outside product folder');
    need(hash(fs.readFileSync(runFile(run, asset.path))) === asset.sha256, 'Prepared reference changed');
  }
  const selection = selectReferences(p, { ...m, products: prepared }, limits, b.panels.flatMap(x => [...x.angle_evidence.source_ids, ...x.source_ids]));
  for (const panel of b.panels) need(panel.source_ids.every(id => selection.selected.some(s => s.id === id)), `Panel ${panel.index} product evidence not selected; adjust planning/references before generation`);
  const approval = requireApproval(run);
  need(JSON.stringify(selection) === JSON.stringify(approval.selection), 'Reference selection changed; present design again');
  const prompt = buildPrompt(p, lock, b, m.platform || 'Amazon US', m.locale);
  for (const s of m.styles || []) need(!prompt.includes(s.original_path) && !prompt.includes(s.path), 'Style path leaked into prompt');
  const job = { id: 'COMPOSITE-01', provider: 'host-tool', prompt_path: 'composite-generation-prompt.md', prompt_sha256: hash(prompt), source_images: selection.selected,
    canvas: { columns: 2, rows: 3, panels: 6, panel_ratio: '1:1', canvas_ratio: '2:3', requested_size_hint: '1024x1536', exact_size_supported: false },
    max_calls: 1, retries: 0, output_count: 1, automatic_split: false, upscale: false };
  const evidence = Object.fromEntries(['inputs.json','product-understanding.json','style-analysis.json','six-image-blueprint.json','interaction.json'].map(f => [f, hash(fs.readFileSync(runFile(run, f)))]));
  const plan = { skill: ID, version: '3.3.1', run_id: m.run_id, logical_panel_count: 6, approval_version: approval.version, approval_digest: approval.digest, jobs: [job], evidence };
  for (const name of ['global-style-lock.json', 'reference-selection.json', 'composite-generation-prompt.md', 'composite-plan.json']) fs.rmSync(runFile(run, name), { force: true });
  write(runFile(run, 'global-style-lock.json'), lock);
  write(runFile(run, 'reference-selection.json'), selection);
  fs.writeFileSync(runFile(run, job.prompt_path), prompt, { flag: 'wx' });
  write(runFile(run, 'composite-plan.json'), plan);
  return plan;
}

export function createHandoff(run, capability) {
  const m = manifest(run); unchanged(run, m);
  const approval = requireApproval(run);
  validateCapability(capability);
  const plan = read(runFile(run, 'composite-plan.json'));
  need(plan.skill === ID && plan.run_id === m.run_id && plan.jobs?.length === 1 && plan.logical_panel_count === 6, 'Exactly one composite job required');
  need(plan.approval_version === approval.version && plan.approval_digest === approval.digest, 'Compiled plan is not the approved version');
  for (const [file, digest] of Object.entries(plan.evidence)) need(hash(fs.readFileSync(runFile(run, file))) === digest, 'Analysis changed after compile');
  const job = plan.jobs[0];
  need(job.id === 'COMPOSITE-01' && job.provider === 'host-tool' && job.max_calls === 1 && job.retries === 0 && job.output_count === 1 && job.automatic_split === false && job.upscale === false, 'Invalid composite execution contract');
  need(job.canvas.columns === 2 && job.canvas.rows === 3 && job.canvas.panels === 6 && job.canvas.panel_ratio === '1:1' && job.canvas.canvas_ratio === '2:3', 'Invalid grid');
  const prompt = fs.readFileSync(runFile(run, 'composite-generation-prompt.md'), 'utf8');
  need(job.prompt_path === 'composite-generation-prompt.md' && hash(prompt) === job.prompt_sha256, 'Prompt changed');
  const selection = read(runFile(run, 'reference-selection.json'));
  need(JSON.stringify(job.source_images) === JSON.stringify(selection.selected), 'Attachment selection mismatch');
  const product = read(runFile(run, 'product-understanding.json'));
  need(job.source_images.length > 0, 'Product image reference is required');
  const paths = job.source_images.map(s => {
    need(product.sources.some(p => p.id === s.id && p.membership === 'main_product' && p.product_id === product.product_id), 'Non-product attachment');
    const file = runFile(run, s.path);
    need(inside(runFile(run, 'products'), file) || inside(runFile(run, 'prepared-products'), file), 'Only registered product-folder attachments allowed');
    const meta = imageIO({ action: 'inspect', files: [file] })[0];
    need(meta.sha256 === s.sha256 && meta.pixel_sha256 === s.pixel_sha256 && (m.styles || []).every(s => meta.sha256 !== s.sha256 && meta.pixel_sha256 !== s.pixel_sha256), 'Style/content contamination or changed source');
    return fs.realpathSync(file);
  });
  if (capability.max_reference_images != null) need(paths.length <= capability.max_reference_images, 'Observed host reference limit exceeded; replan before generation');
  return { skill: ID, run_id: m.run_id, job_id: 'COMPOSITE-01', tool: capability.tool, capability,
    tool_arguments: { prompt, referenced_image_paths: paths, transparent_background: false },
    plan_sha256: hash(fs.readFileSync(runFile(run, 'composite-plan.json'))), call_count: 1 };
}
export function claimGeneration(run, capability) {
  const handoff = createHandoff(run, capability);
  // Atomic exclusive write: two processes cannot both obtain an execution claim.
  write(runFile(run, 'generation-claim.json'), { ...handoff, claimed_at: new Date().toISOString(), status: 'claimed_awaiting_native_result' });
  return handoff;
}
export async function executeOnce(run, capability, nativeHost) {
  need(typeof nativeHost === 'function', 'Host-native tool callback required');
  const h = claimGeneration(run, capability);
  try { return await nativeHost(h.tool_arguments); }
  catch (error) { write(runFile(run, 'generation-failure.json'), { message: String(error.message || error), retries: 0 }); throw error; }
}

export function saveResult(run, imagePath, hostEvidence) {
  const m = manifest(run), claim = read(runFile(run, 'generation-claim.json'));
  text(hostEvidence, 'Actual native tool execution evidence');
  need(claim.skill === ID && claim.run_id === m.run_id, 'Wrong claim');
  need(claim.plan_sha256 === hash(fs.readFileSync(runFile(run, 'composite-plan.json'))), 'Plan changed after claim');
  const source = imageIO({ action: 'inspect', files: [imagePath] })[0];
  need(![...m.products, ...(m.styles || (m.style ? [m.style] : []))].some(i => i.sha256 === source.sha256 || i.pixel_sha256 === source.pixel_sha256), 'Reference image is not generated output');
  const directory = path.join(m.workspace, 'outputs', ID, m.run_id);
  fs.mkdirSync(directory, { recursive: true });
  const dest = path.join(directory, 'composite-preview.png');
  imageIO({ action: 'save_png', source: imagePath, destination: dest });
  const info = imageIO({ action: 'inspect', files: [dest] })[0];
  const result = { skill: ID, run_id: m.run_id, job_id: 'COMPOSITE-01', provider: 'host-tool', tool: claim.tool, host: claim.capability?.host || 'codex', model: claim.capability?.selection?.model || null, host_evidence: hostEvidence,
    image_path: dest, ...info, original_generated_sha256: source.sha256, status: 'generated_awaiting_user_review', independent_images_exported: 0 };
  write(runFile(run, 'generation-result.json'), result);
  return result;
}

export function saveNativeResponse(run, response, hostEvidence) {
  // Native tools may return a data URL instead of a local path. No network fallback.
  const match = typeof response?.image_url === 'string' && response.image_url.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  need(match, 'Native response has no supported image data URL; use the actual returned local file with --image');
  const file = runFile(run, 'native-returned-image.bin');
  const bytes = Buffer.from(match[1], 'base64');
  if (fs.existsSync(file)) need(hash(fs.readFileSync(file)) === hash(bytes), 'Different native response already recorded');
  else fs.writeFileSync(file, bytes, { flag: 'wx' });
  return saveResult(run, file, hostEvidence);
}

