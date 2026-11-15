import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPrompt } from '../scripts/creative-brief.mjs';

const product = { name: 'Sample product', identity_summary: 'Known silhouette', identity_lock: { must_preserve: ['Geometry'], geometry_constraints: ['Visible proportions'], forbidden_changes: ['No invented parts'] }, facts: [{ id: 'F1', statement: 'Visible handle' }] };
const lock = { creative_summary: 'Original Amazon direction', transferable: ['Soft light'], set_rules: ['Consistent typography'], do_not_copy: ['Reference branding'] };
const blueprint = { audience: 'US shoppers', platform_rules: { first_panel_white_background: true }, panels: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, purpose: 'Task ' + (i + 1), objective: 'Show verified detail', fact_ids: ['F1'], title: i ? 'Easy to hold' : '', subtitle: '', extra_copy: [], angle_evidence: { limits: 'Visible surfaces only' } })) };

test('Amazon language switches retain platform roles, exact copy and complete product identity', () => {
  const p={...product,identity_lock:{...product.identity_lock,logo_policy:'Keep the source wordmark shape',accessories:['Only the supplied item']}};
  for(const locale of ['en-US','zh-CN']) {
    const prompt=buildPrompt(p,lock,blueprint,'Amazon US',locale,{design_profile:'amazon_us'});
    for(const value of [locale,'Amazon US','1张白底首图加5张副图','首格RGB纯白背景','Easy to hold',JSON.stringify(p.identity_lock)]) assert.ok(prompt.includes(value));
    assert.doesNotMatch(prompt,/国内电商：|白底商品格：6/);
  }
});

test('Amazon HD template preserves exact copy, source identity, per-panel direction and edge boundaries', () => {
  const template=fs.readFileSync(new URL('../references/hd-prompt.txt',import.meta.url),'utf8');
  for(const token of ['{{IDENTITY}}','{{COPY}}','{{LANGUAGE}}','{{PHOTOGRAPHY}}','{{SCENE_PHYSICS}}','{{PRESENTATION}}','{{COMPOSITION}}','{{MAIN}}','{{USER_CHANGE}}']) assert.ok(template.includes(token));
  assert.match(template,/square 1:1 Amazon US listing image/);
  assert.match(template,/Preserve deliberate white borders/);
  assert.match(template,/Never invent unseen structures/);
  assert.match(template,/Render every supplied character/);
});
