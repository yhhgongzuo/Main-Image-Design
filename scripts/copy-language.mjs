import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { userMessage } from './interaction.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

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
  const panels = request.panels || [request.copy];
  need(Array.isArray(panels) && panels.length === (request.panels ? 6 : 1), 'Provide complete copy records');
  for (const [i, p] of panels.entries()) {
    need(Number.isInteger(p.index) && p.index >= 1 && p.index <= 6 && (!request.panels || p.index === i + 1), 'Invalid panel index');
    need(typeof p.title === 'string' && typeof p.subtitle === 'string' && Array.isArray(p.extra_copy) && p.extra_copy.every(s => typeof s === 'string') && typeof p.copy_zh === 'string', 'Provide title/subtitle/extra_copy/copy_zh');
    validateVisibleCopy(p, locale);
    if (p.index === 1) need(!p.title && !p.subtitle && !p.extra_copy.length, 'White main image has no marketing copy');
  }
  const inputs = read(path.join(run, 'inputs.json'));
  const sourceNames = fs.readdirSync(run).filter(n => ['inputs.json', 'six-image-blueprint.json', 'generation-result.json'].includes(n) || /^composite-\d+-(claim|result|failure)\.json$/.test(n) || /^hd-\d+-\d+-(claim|result|failure)\.json$/.test(n)).sort();
  const source = sourceNames.map(n => [n, read(path.join(run, n))]);
  const payload = { run_id: inputs.run_id, locale, panels, user_request: request.user_request, source };
  return { run_id: inputs.run_id, locale, panels, digest: hash(payload) };
}

export function previewCopyChange(run, request) {
  const state = changeSnapshot(run, request), chinese = isChinese(state.locale);
  const cell = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const preview = `图片语言：${languageName(state.locale)}\n\n| 图片 | 最终上图文案（全部） | ${chinese ? '' : '中文释义 | '}\n|---|---|${chinese ? '' : '---|'}\n` +
    state.panels.map(p => `| ${p.index} | ${cell([p.title, p.subtitle, ...p.extra_copy].filter(Boolean).join(' / ') || '无额外营销文案')} | ${chinese ? '' : `${cell(p.copy_zh)} |`}`).join('\n') +
    '\n\n以上是更新后的全部文案。请核对，确认后单独回复“确认生成”。';
  fs.writeFileSync(path.join(run, 'copy-change-preview.json'), JSON.stringify(state, null, 2) + '\n');
  return { ...state, preview };
}

export function requireCopyConfirmation(run, request) {
  const file = path.join(run, 'copy-change-preview.json');
  need(fs.existsSync(file), 'Display rewritten copy and obtain new confirmation first');
  const current = changeSnapshot(run, request), shown = read(file), response = request.copy_confirmation;
  need(shown.digest === current.digest && shown.run_id === current.run_id, 'Copy or source changed; display rewritten copy again');
  need(userMessage(response) && response.message.trim() === '确认生成' && response.message_id !== request.user_request.message_id && response.digest === current.digest, 'New confirmation of displayed copy required');
}
