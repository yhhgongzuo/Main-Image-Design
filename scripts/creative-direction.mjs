import crypto from 'node:crypto';

export const CREATIVE_CHECKS = ['angles', 'typography', 'composition', 'content', 'rhythm', 'style', 'scenes', 'benefit_expression', 'photography', 'scene_physics', 'reference_adaptation'];
export const CREATIVE_FIELDS = ['angle', 'distance', 'focus', 'presentation', 'composition', 'typography', 'title_position', 'decoration', 'text_product_relation', 'visual_focus', 'rhythm', 'difference', 'lighting_materials', 'scene_physics', 'visual_hierarchy'];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s，。；、,.!?！?]/g, '');

// Codex makes semantic design decisions. These checks only catch observable repetition
// and bind its semantic review to the actual plan, facts and style.
export function creativeDigest(b, p, lock) {
  const { creative_review, ...plan } = b;
  return digest({ plan, product: p, style: lock });
}

export function auditCreative(b, p, lock) {
  const findings = [];
  const group = (fields, minimum, code, blocking) => {
    const groups = new Map();
    for (const panel of b.panels) {
      if (code === 'repeated_text_layout' && !panel.title && !panel.subtitle) continue;
      const signature = fields.map(k => normalized(panel[k])).join('|');
      if (fields.some(k => !normalized(panel[k]))) continue;
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(panel.index);
    }
    for (const panels of groups.values()) if (panels.length >= minimum)
      findings.push({ code: `${code}:${panels.join('-')}`, panels, fields, blocking });
  };
  group(['title_position', 'decoration', 'text_product_relation'], 4, 'repeated_text_layout', false);
  group(['angle', 'distance', 'focus', 'composition', 'typography'], 2, 'duplicate_direction', true);
  group(['angle', 'distance', 'focus'], 3, 'repeated_view', false);
  group(['composition', 'visual_focus'], 4, 'repeated_composition', false);
  group(['rhythm'], 6, 'flat_rhythm', false);
  for (let i = 1; i < b.panels.length; i++) {
    const a = b.panels[i - 1], c = b.panels[i];
    if (a.distance === '局部' && c.distance === '局部' && normalized(a.focus) === normalized(c.focus))
      findings.push({ code: `adjacent_detail:${a.index}-${c.index}`, panels: [a.index, c.index], blocking: false });
  }
  for (let i = 1; i + 2 < b.panels.length; i++) {
    const sequence = b.panels.slice(i, i + 3);
    if (sequence.every(x => /局部|特写|close.?up|detail/i.test(x.distance)))
      findings.push({ code: `consecutive_details:${sequence.map(x => x.index).join('-')}`, panels: sequence.map(x => x.index), blocking: false });
  }
  return { digest: creativeDigest(b, p, lock), findings,
    status: findings.some(f => f.blocking) ? 'needs_revision' : 'needs_codex_review',
    note: '由 Codex 审查语义近似、证据和商业表达；只修改问题面板后重跑 audit，不自动套用版式。' };
}

export function validateCreative(b, p, lock, need) {
  for (const panel of b.panels) {
    for (const field of CREATIVE_FIELDS) need(typeof panel[field] === 'string' && panel[field].trim(), `panel.${field} required`);
    const e = panel.angle_evidence;
    need(e && ['observed', 'supported_inference', 'visible_only'].includes(e.mode), 'Angle evidence mode required');
    need(Array.isArray(e.source_ids) && e.source_ids.length > 0 && e.source_ids.every(id => panel.source_ids.includes(id)), 'Angle evidence must reference panel product sources');
    for (const field of ['basis', 'limits']) need(typeof e[field] === 'string' && e[field].trim(), `angle_evidence.${field} required`);
  }
  const audit = auditCreative(b, p, lock);
  need(!audit.findings.some(f => f.blocking), `Creative repetition requires replanning: ${audit.findings.filter(f => f.blocking).map(f => f.code).join(', ')}`);
  const review = b.creative_review;
  need(review?.digest === audit.digest, 'Creative review missing or stale; run audit and review current plan');
  for (const key of CREATIVE_CHECKS) need(review.checks?.[key]?.status === 'pass' && typeof review.checks[key].notes === 'string' && review.checks[key].notes.trim(), `Creative review ${key} must pass with evidence`);
  for (const f of audit.findings) need(review.accepted_repetitions?.some(x => x.code === f.code && typeof x.reason === 'string' && x.reason.trim()), `Resolve creative finding or explain evidence constraint: ${f.code}`);
}

// Keep approved semantic decisions; omit diagnostic fields and numeric layout controls.
export function panelDirection(panel) {
  return [...new Set([panel.creative_direction, `${panel.angle}，${panel.distance}展示${panel.focus}`, panel.presentation, panel.composition, `${panel.typography}（${panel.title_position}，${panel.decoration}，${panel.text_product_relation}）`, panel.rhythm, `光线与材质：${panel.lighting_materials}`, `场景物理关系：${panel.scene_physics}`, `视觉主次：${panel.visual_hierarchy}`])].join('；');
}
