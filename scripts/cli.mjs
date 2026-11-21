#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { previewCopyChange } from './copy-language.mjs';
import { setStyleReferences, setCopyLanguage, previewStyleChoices, confirmStyleChoice, recordStyleDecision, presentDesign, approveDesign, inspectInputs, prepareProductReferences, compilePlan, claimGeneration, createHandoff, saveResult, saveNativeResponse, read, write, need, STYLE_FIELDS, reviewCreativePlan } from './workflow.mjs';

import { claimCompositeRevision, saveCompositeRevision, failCompositeRevision, selectComposite } from './composite-revisions.mjs';

import { CREATIVE_FIELDS, CREATIVE_CHECKS } from './creative-direction.mjs';
import { previewHD, approveHD, splitHD, claimHD, saveHD, saveHDResponse, failHD, finishHD, claimHDBatch, nextSequentialHD, renderLocalHD, reviewHD } from './hd-workflow.mjs';

import { isDomestic, VISUAL_SYSTEM_FIELDS } from './market-profile.mjs';
import { commandReceipt } from './result-output.mjs';
import { patchPlan, patchContext, startPatch, savePatch, assemblePatches } from './local-edit.mjs';
import { userMessage } from './interaction.mjs';
import { validateCapability } from './host-adapter.mjs';
import { windowStatus, reserveWindow, bindWindow, startWindow } from './hd-windows.mjs';

const [command, ...argv] = process.argv.slice(2);
const patchKeys = ['run','revision','index','attempt'];
const allowed = {
  'patch-new':['run','request','capability'], 'patch-start':[...patchKeys,'region'],
  'patch-save':[...patchKeys,'region','image','response','host-evidence'], 'patch-compose':patchKeys, 'patch-finish':patchKeys,
  'set-style-references': ['run','request'], 'set-language': ['run','request'], 'copy-preview': ['run','request'],
  init: ['input','workspace'], outline: ['run'], 'style-preview': ['run'], 'style-confirm': ['run','response'], style: ['run'], prepare: ['run'],
  audit: ['run'], ready: ['run','limits'], preview: ['run','limits'], approve: ['run','response'], compile: ['run','limits'], handoff: ['run','capability'], claim: ['run','capability'],
  save: ['run','image','response','host-evidence'], fail: ['run','reason'],
  'hd-preview': ['run'], 'hd-approve': ['run','response'], 'hd-split': ['run'], 'hd-sequential-next': ['run'],
  'composite-revise': ['run','request','capability'], 'composite-save': ['run','revision','image','response','host-evidence'], 'composite-fail': ['run','revision','failure'],
  'composite-select': ['run','request'],
  'hd-batch': ['run','capability','plan','dispatch'], 'hd-render': ['run','index','attempt'], 'hd-review': ['run','index','attempt','review'], 'hd-claim': ['run','index','capability','request'], 'hd-save': ['run','index','attempt','image','response','host-evidence'],
  'hd-window-status': ['run'], 'hd-window-reserve': ['run','index','attempt'], 'hd-worker-start': ['run','index','attempt'],
  'hd-window-bind': ['run','index','attempt','host','thread','origin'], 'hd-fail': ['run','index','attempt','failure'], 'hd-finish': ['run','only'],
};
try {
  need(allowed[command], 'Usage: node scripts/cli.mjs init|outline|style-preview|style-confirm|style|prepare|audit|ready|preview|approve|compile|handoff|claim|save|fail|hd-preview|hd-batch|hd-save|hd-finish|composite-revise --input FILE / --run DIR (see references/runtime.md)');
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
    case 'patch-new': {
      const request = read(args.request), capability = validateCapability(read(args.capability));
      need(userMessage(request.user_request) && path.isAbsolute(request.base) && path.isAbsolute(request.output_dir), 'Supply the real user request, original base and output folder.');
      const refs = request.references || {};
      need(Object.values(refs).every(p => typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)), 'Supply existing absolute product reference paths.');
      fs.mkdirSync(args.run,{recursive:true});
      need(!fs.existsSync(file('standalone-claim.json')) && !fs.existsSync(file('inputs.json')), 'Use a new standalone edit directory, or resume the existing claim.');
      const local_edit = patchPlan(args.run, {base:request.base, regions:request.regions, capability, standaloneRefs:refs, request:request.user_request});
      const claim = {local_edit, output_dir:request.output_dir, user_request:request.user_request, capability, tool:capability.tool};
      fs.writeFileSync(file('standalone-claim.json'),JSON.stringify(claim,null,2),{flag:'wx'});
      result = {status:'awaiting_region_edits',regions:local_edit.tasks.length}; break;
    }
    case 'patch-start': result = startPatch(patchContext(args.run,args),Number(args.region)); break;
    case 'patch-save': result = savePatch(patchContext(args.run,args),Number(args.region),args); break;
    case 'patch-compose':
      result = {status:'composed',image_path:assemblePatches(patchContext(args.run,args))}; break;
    case 'patch-finish': {
      const claim = patchContext(args.run,args);
      const image = assemblePatches(claim);
      const evidence = 'Composed local tool returns from ' + claim.local_edit.folder;
      if (args.revision) result = saveCompositeRevision(args.run, Number(args.revision), image, evidence);
      else if (args.index) result = saveHD(args.run,Number(args.index),Number(args.attempt),image,evidence);
      else {
        fs.mkdirSync(claim.output_dir,{recursive:true});
        const dest = path.join(claim.output_dir, path.parse(claim.local_edit.base).name + '-' + path.basename(claim.local_edit.folder) + '.png');
        if (!fs.existsSync(dest)) fs.copyFileSync(image,dest,fs.constants.COPYFILE_EXCL);
        need(fs.readFileSync(dest).equals(fs.readFileSync(image)), 'Conflicting standalone output.');
        result = {status:'saved',image_path:dest};
      }
      break;
    }
    case 'set-style-references': result = setStyleReferences(args.run, read(args.request)); break;
    case 'set-language': result = setCopyLanguage(args.run, read(args.request)); break;
    case 'copy-preview': result = previewCopyChange(args.run, read(args.request)); break;
    case 'hd-preview': result = previewHD(args.run); break;
    case 'hd-approve': result = approveHD(args.run, read(args.response)); break;
    case 'hd-split': result = splitHD(args.run); break;
    case 'hd-sequential-next': result = nextSequentialHD(args.run); break;
    case 'hd-batch': {
      const capability = read(args.capability);
      result = claimHDBatch(args.run, capability, args.plan ? read(args.plan) : null, args.dispatch);
      break;
    }
    case 'hd-window-status': result = windowStatus(args.run); break;
    case 'hd-window-reserve': result = reserveWindow(args.run, Number(args.index), Number(args.attempt)); break;
    case 'hd-window-bind': result = bindWindow(args.run, Number(args.index), Number(args.attempt), args.host, args.thread, args.origin); break;
    case 'hd-worker-start': result = startWindow(args.run, Number(args.index), Number(args.attempt)); break;
    case 'hd-render': result = renderLocalHD(args.run, Number(args.index), Number(args.attempt)); break;
    case 'hd-review': result = reviewHD(args.run, Number(args.index), Number(args.attempt), read(args.review)); break;
    case 'hd-claim':
      need(args.request, 'Use hd-batch for initial HD or provide a targeted user request');
      result = claimHD(args.run, Number(args.index), read(args.capability), read(args.request)); break;
    case 'composite-revise': result = claimCompositeRevision(args.run, read(args.request), read(args.capability)); break;
    case 'composite-select': result = selectComposite(args.run, read(args.request)); break;
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
    case 'hd-finish': result = finishHD(args.run, args.only); break;
    case 'init': result = inspectInputs(read(args.input), args.workspace || process.cwd()); break;
    case 'outline': {
      const m = read(file('inputs.json'));
      const domestic = isDomestic(m);
      const whiteIndex = domestic ? 6 : 1;
      const product = { status: 'pending', product_id: m.main_product_id || 'MAIN', name: '', category: '', identity_summary: '',
        sources: m.products.map(p => ({ id: p.id, product_id: 'MAIN', membership: 'uncertain', role: 'primary_identity', quality: 0, visual_summary: '', unique_contribution: '', observed_facts: [], visible_text: { status: 'not_visible', items: [] }, uncertainty_notes: [] })),
        facts: [], selling_points: [], unknowns: [], identity_lock: { silhouette: '', proportions: '', color: '', structure: '', material_appearance: '', logo_policy: '', components: [], accessories: [], must_preserve: [], forbidden_changes: [], geometry_constraints: [] } };
      const style = { status: 'pending', source_ids: (m.styles || []).map(s => s.id), origin: m.style ? 'reference' : 'recommendation', option_id: '', name: '', reference_intent: { mode: m.style ? '' : 'none', basis: '' }, creative_summary: '', ...(domestic ? { visual_system: Object.fromEntries(VISUAL_SYSTEM_FIELDS.map(k => [k, ''])) } : {}), ...Object.fromEntries(Object.entries(STYLE_FIELDS).map(([group, keys]) => [group, Object.fromEntries(keys.map(k => [k, '']))])), transferable: [], do_not_copy: [], set_rules: [], uncertainties: [] };
      const blueprint = { status: 'pending', copy_locale: m.locale, global_style_lock_id: '', audience: '', planning_rationale: '', knowledge_basis: { mode: 'local', application: '' }, platform_rules: { status: 'pending', basis: '', first_panel_white_background: !domestic, ...(domestic ? { white_product_panels: [6], first_panel_marketing_copy: true } : {}) }, global_review: { style_coherent: false, product_truth_checked: false, distinct_content: false, notes: '' },
        creative_review: { digest: '', checks: Object.fromEntries(CREATIVE_CHECKS.map(k => [k, { status: 'pending', notes: '' }])), accepted_repetitions: [] },
        panels: Array.from({length:6}, (_, i) => ({ index: i+1, background: i + 1 === whiteIndex ? '#FFFFFF' : '', product_only: i + 1 === whiteIndex, purpose: '', buyer_question: '', objective: '', creative_direction: '', ...Object.fromEntries(CREATIVE_FIELDS.map(k => [k, ''])), angle_evidence: { mode: '', source_ids: [], basis: '', limits: '' }, title: '', subtitle: '', extra_copy: [], copy_zh: '', source_ids: [], fact_ids: [] })) };
      write(file('product-understanding.json'), product); write(file('style-analysis.json'), style); write(file('six-image-blueprint.json'), blueprint);
      result = { status: 'needs_host_visual_analysis', note: 'These are empty working forms, not analysis results.' }; break;
    }
    case 'style-preview': result = previewStyleChoices(args.run); break;
    case 'style-confirm': result = confirmStyleChoice(args.run, read(args.response)); break;
    case 'style': result = recordStyleDecision(args.run); break;
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
  console.log(JSON.stringify(commandReceipt(command, result, args.run), null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'blocked', message: error.message, generation_executed_by_this_cli: false }));
  process.exitCode = 1;
}
