#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { previewCopyChange } from './copy-language.mjs';
import { setStyleReferences, setCopyLanguage, presentDesign, approveDesign, inspectInputs, prepareProductReferences, compilePlan, styleLock, claimGeneration, createHandoff, saveResult, saveNativeResponse, read, write, need, STYLE_FIELDS, reviewCreativePlan } from './workflow.mjs';

import { claimCompositeRevision, saveCompositeRevision, failCompositeRevision } from './composite-revisions.mjs';

import { CREATIVE_FIELDS, CREATIVE_CHECKS } from './creative-direction.mjs';
import { previewHD, approveHD, splitHD, claimHD, saveHD, saveHDResponse, failHD, finishHD, claimHDBatch } from './hd-workflow.mjs';

const [command, ...argv] = process.argv.slice(2);
const allowed = {
  'set-style-references': ['run','request'], 'set-language': ['run','request'], 'copy-preview': ['run','request'],
  init: ['input','workspace'], outline: ['run'], style: ['run'], prepare: ['run'],
  audit: ['run'], ready: ['run','limits'], preview: ['run','limits'], approve: ['run','response'], compile: ['run','limits'], handoff: ['run','capability'], claim: ['run','capability'],
  save: ['run','image','response','host-evidence'], fail: ['run','reason'],
  'hd-preview': ['run'], 'hd-approve': ['run','response'], 'hd-split': ['run'],
  'composite-revise': ['run','request','capability'], 'composite-save': ['run','revision','image','response','host-evidence'], 'composite-fail': ['run','revision','failure'],
  'hd-batch': ['run','capability'], 'hd-claim': ['run','index','capability','request'], 'hd-save': ['run','index','attempt','image','response','host-evidence'],
  'hd-fail': ['run','index','attempt','failure'], 'hd-finish': ['run'],
};
try {
  need(allowed[command], 'Usage: node scripts/cli.mjs init|outline|style|prepare|audit|ready|preview|approve|compile|handoff|claim|save|fail|hd-preview|hd-batch|hd-save|hd-finish|composite-revise --input FILE / --run DIR (see references/runtime.md)');
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    need(argv[i].startsWith('--') && allowed[command].includes(key) && argv[i+1] && !args[key], `Invalid argument: ${argv[i]}`);
    args[key] = argv[i+1];
  }
  if (command !== 'init') need(args.run && path.isAbsolute(args.run), '--run needs absolute path');
  const file = name => path.join(args.run, name);
  let result;
  switch (command) {
    case 'set-style-references': result = setStyleReferences(args.run, read(args.request)); break;
    case 'set-language': result = setCopyLanguage(args.run, read(args.request)); break;
    case 'copy-preview': result = previewCopyChange(args.run, read(args.request)); break;
    case 'hd-preview': result = previewHD(args.run); break;
    case 'hd-approve': result = approveHD(args.run, read(args.response)); break;
    case 'hd-split': result = splitHD(args.run); break;
    case 'hd-batch': result = claimHDBatch(args.run, read(args.capability)); break;
    case 'hd-claim': result = claimHD(args.run, Number(args.index), read(args.capability), args.request ? read(args.request) : null); break;
    case 'composite-revise': result = claimCompositeRevision(args.run, read(args.request), read(args.capability)); break;
    case 'composite-save': {
      need(Boolean(args.image) !== Boolean(args.response), 'Specify exactly one of --image or --response');
      let image = args.image;
      if (args.response) {
        const response = read(args.response);
        const match = typeof response?.image_url === 'string' && response.image_url.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
        need(match, 'Use actual image data URL');
        need(Number.isInteger(Number(args.revision)) && Number(args.revision) >= 1, 'Invalid revision');
        image = file(`composite-${args.revision}-native.bin`);
        const bytes = Buffer.from(match[1], 'base64');
        if (fs.existsSync(image)) need(fs.readFileSync(image).equals(bytes), 'Different native result already recorded');
        else fs.writeFileSync(image, bytes, { flag: 'wx' });
      }
      result = saveCompositeRevision(args.run, Number(args.revision), image, args['host-evidence']); break;
    }
    case 'composite-fail': result = failCompositeRevision(args.run, Number(args.revision), read(args.failure)); break;
    case 'hd-save':
      need(Boolean(args.image) !== Boolean(args.response), 'Specify exactly one of --image or --response');
      result = args.response ? saveHDResponse(args.run, Number(args.index), Number(args.attempt), read(args.response), args['host-evidence']) : saveHD(args.run, Number(args.index), Number(args.attempt), args.image, args['host-evidence']); break;
    case 'hd-fail': result = failHD(args.run, Number(args.index), Number(args.attempt), read(args.failure)); break;
    case 'hd-finish': result = finishHD(args.run); break;
    case 'init': result = inspectInputs(read(args.input), args.workspace || process.cwd()); break;
    case 'outline': {
      const m = read(file('inputs.json'));
      const product = { status: 'pending', product_id: m.main_product_id || 'MAIN', name: '', category: '', identity_summary: '',
        sources: m.products.map(p => ({ id: p.id, product_id: 'MAIN', membership: 'uncertain', role: 'primary_identity', quality: 0, visual_summary: '', unique_contribution: '', observed_facts: [], visible_text: { status: 'not_visible', items: [] }, uncertainty_notes: [] })),
        facts: [], selling_points: [], unknowns: [], identity_lock: { silhouette: '', proportions: '', color: '', structure: '', material_appearance: '', logo_policy: '', components: [], accessories: [], must_preserve: [], forbidden_changes: [], geometry_constraints: [] } };
      const style = { status: 'pending', source_ids: (m.styles || []).map(s => s.id), origin: m.style ? 'reference' : 'recommendation', option_id: '', name: '', reference_intent: { mode: m.style ? '' : 'none', basis: '' }, creative_summary: '', ...Object.fromEntries(Object.entries(STYLE_FIELDS).map(([group, keys]) => [group, Object.fromEntries(keys.map(k => [k, '']))])), transferable: [], do_not_copy: [], set_rules: [], uncertainties: [] };
      const blueprint = { status: 'pending', copy_locale: m.locale, global_style_lock_id: '', audience: '', planning_rationale: '', knowledge_basis: { mode: 'local', application: '' }, platform_rules: { status: 'pending', basis: '', first_panel_white_background: true }, global_review: { style_coherent: false, product_truth_checked: false, distinct_content: false, notes: '' },
        creative_review: { digest: '', checks: Object.fromEntries(CREATIVE_CHECKS.map(k => [k, { status: 'pending', notes: '' }])), accepted_repetitions: [] },
        panels: Array.from({length:6}, (_, i) => ({ index: i+1, background: i === 0 ? '#FFFFFF' : '', product_only: i === 0, purpose: '', buyer_question: '', objective: '', creative_direction: '', ...Object.fromEntries(CREATIVE_FIELDS.map(k => [k, ''])), angle_evidence: { mode: '', source_ids: [], basis: '', limits: '' }, title: '', subtitle: '', extra_copy: [], copy_zh: '', source_ids: [], fact_ids: [] })) };
      write(file('product-understanding.json'), product); write(file('style-analysis.json'), style); write(file('six-image-blueprint.json'), blueprint);
      result = { status: 'needs_host_visual_analysis', note: 'These are empty working forms, not analysis results.' }; break;
    }
    case 'style': result = styleLock(read(file('style-analysis.json'))); break;
    case 'prepare': result = prepareProductReferences(args.run); break;
    case 'audit': result = reviewCreativePlan(args.run); break;
    case 'preview': result = presentDesign(args.run, args.limits ? read(args.limits) : {}); break;
    case 'ready': result = presentDesign(args.run, args.limits ? read(args.limits) : {}); break;
    case 'approve': result = approveDesign(args.run, read(args.response)); break;
    case 'compile': result = compilePlan(args.run, args.limits ? read(args.limits) : {}); break;
    case 'handoff': result = createHandoff(args.run, read(args.capability)); break;
    case 'claim': result = claimGeneration(args.run, read(args.capability)); break;
    case 'save':
      need(Boolean(args.image) !== Boolean(args.response), 'Specify exactly one of --image or --response');
      result = args.response ? saveNativeResponse(args.run, read(args.response), args['host-evidence']) : saveResult(args.run, args.image, args['host-evidence']); break;
    case 'fail':
      need(fs.existsSync(file('generation-claim.json')), 'No generation claim');
      need(args.reason, 'Actual error reason required');
      result = { status: 'failed_or_unknown', reason: args.reason, automatic_retry: false };
      write(file('generation-failure.json'), result); break;
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'blocked', message: error.message, generation_executed_by_this_cli: false }));
  process.exitCode = 1;
}
