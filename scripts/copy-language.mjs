import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { userMessage } from './interaction.mjs';

import { noCopyPanels } from './market-profile.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const exists = (run, name) => fs.existsSync(path.join(run, name));
const latestHD = (run, index) => Math.max(0, ...fs.readdirSync(run).filter(name => new RegExp(`^hd-${index}-\\d+-claim\\.json$`).test(name)).map(name => Number(name.split('-')[2])));
const hdFingerprint = (run, index, attempt) => Object.fromEntries(['claim', 'result', 'failure', ...(exists(run, `hd-${index}-${attempt}-review.json`) ? ['review'] : [])].map(suffix => {
  const name = `hd-${index}-${attempt}-${suffix}.json`;
  return [suffix, exists(run, name) ? hash(read(path.join(run, name))) : null];
}));

function sourceSnapshot(run, batch) {
  const names = fs.readdirSync(run).filter(name =>
    ['inputs.json', 'product-understanding.json', 'style-analysis.json', 'six-image-blueprint.json', 'generation-result.json', 'composite-selection.json', 'hd-approval.json', 'hd-crops.json'].includes(name) ||
    /^composite-\d+-(claim|result|failure)\.json$/.test(name) || (!batch && /^hd-\d+-\d+-(claim|result|failure|review)\.json$/.test(name))).sort();
  return names.map(name => [name, read(path.join(run, name))]);
}

export function normalizeLocale(value) {
  need(typeof value === 'string' && value.trim(), 'Provide a language tag such as en-US, zh-CN or ja-JP');
  try { return Intl.getCanonicalLocales(value.trim())[0]; }
  catch { throw new Error('Provide a valid language tag such as en-US, zh-CN or ja-JP'); }
}
export const isChinese = locale => normalizeLocale(locale).split('-')[0] === 'zh';
export const languageName = locale => new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of(normalizeLocale(locale));

export function validateVisibleCopy(panel, locale) {
  const language = normalizeLocale(locale);
  // A narrow check for the previous English default; semantic language review belongs to the host.
  if (language.split('-')[0] === 'en') need(!/[\u3400-\u9fff]/u.test(panel.title + panel.subtitle + panel.extra_copy.join('')), 'English visible copy cannot contain Chinese text');
}

function changeSnapshot(run, request) {
  need(userMessage(request?.user_request), 'Actual language change request required');
  const locale = normalizeLocale(request.locale);
  need(Boolean(request.panels) !== Boolean(request.copy), 'Provide all six panels or one targeted copy record');
  const inputs = read(path.join(run, 'inputs.json'));
  const noCopy = noCopyPanels(inputs, read(path.join(run, 'six-image-blueprint.json')));
  const panels = request.panels || [request.copy];
  need(Array.isArray(panels) && panels.length === (request.panels ? 6 : 1), 'Provide complete copy records');
  for (const [i, p] of panels.entries()) {
    need(Number.isInteger(p.index) && p.index >= 1 && p.index <= 6 && (!request.panels || p.index === i + 1), 'Invalid panel index');
    need(typeof p.title === 'string' && typeof p.subtitle === 'string' && Array.isArray(p.extra_copy) && p.extra_copy.every(s => typeof s === 'string') && typeof p.copy_zh === 'string', 'Provide title/subtitle/extra_copy/copy_zh');
    validateVisibleCopy(p, locale);
    if (noCopy.includes(p.index)) need(!p.title && !p.subtitle && !p.extra_copy.length, 'White main image has no marketing copy');
  }
  const batch = Boolean(request.panels && exists(run, 'hd-crops.json'));
  const source = sourceSnapshot(run, batch);
  const baselines = batch ? panels.map(panel => {
    const attempt = latestHD(run, panel.index);
    need(attempt > 0, 'Start and finish the initial HD tasks before translating the delivered set');
    const result = exists(run, `hd-${panel.index}-${attempt}-result.json`);
    const failure = exists(run, `hd-${panel.index}-${attempt}-failure.json`) ? read(path.join(run, `hd-${panel.index}-${attempt}-failure.json`)) : null;
    need(result || failure?.definitive === true, 'Wait for outstanding HD results before previewing the set translation');
    return { index: panel.index, attempt, fingerprint: hdFingerprint(run, panel.index, attempt) };
  }) : [];
  const scope = batch ? 'hd_batch' : 'current_request';
  const payload = { run_id: inputs.run_id, locale, panels, user_request: request.user_request, source, baselines, scope };
  return { ...payload, digest: hash(payload) };
}

export function previewCopyChange(run, request) {
  const state = changeSnapshot(run, request), chinese = isChinese(state.locale);
  const cell = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const preview = `图片语言：${languageName(state.locale)}\n\n| 图片 | 最终上图文案（全部） | ${chinese ? '' : '中文释义 | '}\n|---|---|${chinese ? '' : '---|'}\n` +
    state.panels.map(p => `| ${p.index} | ${cell([p.title, p.subtitle, ...p.extra_copy].filter(Boolean).join(' / ') || '无额外营销文案')} | ${chinese ? '' : `${cell(p.copy_zh)} |`}`).join('\n') +
    '\n\n以上是更新后的全部文案。请核对，确认后单独回复“确认生成”。';
  const data = JSON.stringify(state, null, 2) + '\n';
  fs.writeFileSync(path.join(run, 'copy-change-preview.json'), data);
  fs.writeFileSync(path.join(run, `copy-change-${state.digest}.json`), data);
  fs.writeFileSync(path.join(run, 'copy-change-preview.md'), preview);
  return { ...state, preview };
}

export function requireCopyConfirmation(run, request, targetIndex = null) {
  const response = request.copy_confirmation;
  const byDigest = typeof response?.digest === 'string' && /^[a-f0-9]{64}$/.test(response.digest) ? path.join(run, `copy-change-${response.digest}.json`) : '';
  const file = byDigest && fs.existsSync(byDigest) ? byDigest : path.join(run, 'copy-change-preview.json');
  need(fs.existsSync(file), 'Display rewritten copy and obtain new confirmation first');
  const shown = read(file);
  need(userMessage(request.user_request) && userMessage(response) && response.message.trim() === '确认生成' && response.message_id !== request.user_request.message_id && response.digest === shown.digest, 'New confirmation of displayed copy required');
  if (shown.scope !== 'hd_batch') {
    const current = changeSnapshot(run, request);
    need(shown.digest === current.digest && shown.run_id === current.run_id, 'Copy or source changed; display rewritten copy again');
    return shown;
  }
  need(Number.isInteger(targetIndex) && shown.panels.some(panel => panel.index === targetIndex), 'Use the confirmed set only for its listed HD panels');
  need(request.panels && !request.copy && normalizeLocale(request.locale) === shown.locale &&
    hash(request.panels) === hash(shown.panels) && hash(request.user_request) === hash(shown.user_request), 'Keep the complete confirmed set and original request when dispatching each panel');
  const payload = { ...shown }; delete payload.digest;
  need(hash(payload) === shown.digest && hash(sourceSnapshot(run, true)) === hash(shown.source), 'Approved design or copy batch changed; preview again');
  for (const baseline of shown.baselines) {
    need(hash(hdFingerprint(run, baseline.index, baseline.attempt)) === hash(baseline.fingerprint), 'A translation baseline changed; preview the current design again');
    const latest = latestHD(run, baseline.index);
    if (latest === baseline.attempt) continue;
    need(latest === baseline.attempt + 1, 'A later unrelated edit changed the approved set');
    const claim = read(path.join(run, `hd-${baseline.index}-${latest}-claim.json`));
    need(claim.copy_batch_digest === shown.digest, 'Another edit changed the approved set');
  }
  const baseline = shown.baselines.find(panel => panel.index === targetIndex);
  need(latestHD(run, targetIndex) === baseline.attempt, 'This confirmed translation panel was already submitted; resume its existing task');
  return shown;
}
