import test from 'node:test';
import { runPython } from '../scripts/python-runtime.mjs';
import { mapToolCall } from '../scripts/host-adapter.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { previewCopyChange } from '../scripts/copy-language.mjs';
import { setStyleReferences, setCopyLanguage, presentDesign, approveDesign, inspectInputs, validateProduct, styleLock, validateStyle, compilePlan, createHandoff, claimGeneration, executeOnce, saveResult, saveNativeResponse, selectReferences, read, imageIO, STYLE_FIELDS, prepareProductReferences } from '../scripts/workflow.mjs';

import { currentComposite, claimCompositeRevision, saveCompositeRevision, failCompositeRevision } from '../scripts/composite-revisions.mjs';

import { auditCreative, CREATIVE_CHECKS } from '../scripts/creative-direction.mjs';
import { previewHD, approveHD, splitHD, claimHD, saveHD, saveHDResponse, failHD, finishHD, claimHDBatch, dispatchNativeBatch, SAMPLE_MESSAGE } from '../scripts/hd-workflow.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Synthetic colored raster fixtures test IO/contracts, not product-generation quality.
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'ahui-contract-test-'));
test.after(() => fs.rmSync(temp,{recursive:true,force:true}));
const make = runPython(['-c',
  'from PIL import Image; from pathlib import Path; import sys, zipfile; p=Path(sys.argv[1]); colors=["red","green","blue","yellow","purple"]; [(Image.new("RGB",(64,64),c).save(p/(str(i)+".png"))) for i,c in enumerate(colors)]; Image.new("RGB",(128,192),"gray").save(p/"output.png"); Image.new("RGB",(128,200),"gray").save(p/"wrong.png"); Image.new("RGB",(64,64),"purple").save(p/"style.bmp"); Image.new("RGB",(4200,100),"orange").save(p/"large.png"); z=zipfile.ZipFile(p/"info.docx","w"); z.writestr("word/document.xml",\'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>用户资料</w:t></w:r></w:p></w:body></w:document>\'); z.close()',temp],{encoding:'utf8',timeout:15000});
assert.equal(make.status,0,make.stderr);
const cap = {available:true,tool:'image_gen__imagegen',explicit_image_paths:true};
const json = (file, data) => fs.writeFileSync(file,JSON.stringify(data,null,2));
function fixture({products=[0,1,2], platform='', userText='用户指定的产品', docs=[], hasStyle=true, mode='plan'}={}) {
  const input = {product_images:products.map(i => path.join(temp,`${i}.png`)),style_image:hasStyle?path.join(temp,'4.png'):null,platform,user_text:userText,information_files:docs,workflow_mode:mode,generation_request:mode==='generate'?{role:'user',message:'请制作六图合集',message_id:'MOCK-initial'}:null};
  const {run_dir:run} = inspectInputs(input,temp), m=read(path.join(run,'inputs.json'));
  const p={status:'reviewed',product_id:'MAIN',name:'合约测试对象',category:'模拟数据',identity_summary:'只用于程序测试的颜色块',
    sources:m.products.map((s,i)=>({id:s.id,product_id:'MAIN',membership:'main_product',role:['primary_identity','side','detail'][i%3],quality:0.9,visual_summary:'测试占位证据',unique_contribution:`视角 ${i}`,observed_facts:['测试形态'],visible_text:{status:'not_visible',items:[]},uncertainty_notes:[]})),
    facts:[{id:'F1',statement:'简约外观设计',source:'generic',source_ids:[],evidence:'通用外观描述，不声明性能'}],selling_points:[{text:'简约外观',fact_ids:['F1']}],unknowns:['材质成分未知'],
    identity_lock:{silhouette:'方块',proportions:'保持比例',color:'保持源色',structure:'保持可见结构',material_appearance:'不推断成分',logo_policy:'没有标志不添加',components:['本体'],accessories:[],must_preserve:['可见轮廓'],forbidden_changes:['不得添加部件'],geometry_constraints:['保持宽高关系']}};
  const s={status:'reviewed',origin:hasStyle?'reference':'recommendation',option_id:hasStyle?'':'A',name:'测试风格',reference_intent:{mode:hasStyle?'selective':'none',basis:'模拟选择：只借鉴层级，按本品决定环境'},creative_summary:'浅色背景与协调配色，现代字体，细腻摄影与柔和光影，空间富有层次。',...Object.fromEntries(Object.entries(STYLE_FIELDS).map(([group,keys])=>[group,Object.fromEntries(keys.map(k=>[k,`可执行规则 ${group}/${k}`]))])),transferable:['浅背景与清晰层级'],do_not_copy:['参考商品和品牌'],set_rules:['统一字体与配色'],uncertainties:[]};
  const b={status:'reviewed',global_style_lock_id:styleLock(s).id,audience:'模拟受众',planning_rationale:'测试六个逻辑面板，不代表真实设计验收',knowledge_basis:{mode:'local',application:'Synthetic category planning from supplied facts'},platform_rules:{status:'confirmed',basis:'MOCK Amazon US test evidence',first_panel_white_background:true},global_review:{style_coherent:true,product_truth_checked:true,distinct_content:true,notes:'模拟审查'},panels:Array.from({length:6},(_,i)=>({index:i+1,purpose:`用途 ${i}`,buyer_question:`问题 ${i}`,objective:'外观展示',creative_direction:`创意 ${i}`, angle:`角度 ${i}`,position:`位置 ${i}`,product_occupancy:0.6,visual_center:'产品',background:`空间 ${i}`,lighting:'同一柔光语言',composition:`构图 ${i}`,title:'Simple Form',subtitle:'',extra_copy:[],copy_zh:'简洁外观',whitespace:'右侧留白',preserve_details:'保持轮廓',source_ids:['P1'],fact_ids:['F1'],style_application:{palette_application:'背景色关系',type_application:'同字体',photo_application:'同材质质感',background_application:'同空间语言'}}))};
  const directions = [
    ['正侧面','整体','完整轮廓','独立摆放','非对称留白','大标题无底板','右侧','无','图文并置','商品轮廓','强视觉少信息'],
    ['微俯视','整体','顶部可见边缘','斜向摆放','对角呼应','短句分层','左侧','细线','文字顺势','顶部边缘','中等视觉低密度'],
    ['正侧面','局部','已见表面','局部近看','肌理铺陈','小字克制','下部','无','文字轻置','表面细节','安静低密度'],
    ['正侧面','场景','外观与环境','真实环境陈列','前后空间','场景短句','留白区','无','场景为主','空间关系','自然中等强度'],
    ['轻微斜前','中景','可见转角','侧向陈列','疏密平衡','重点文字对比','侧边','点色','图文呼应','可见转角','重点突出中密度'],
    ['正侧面','近景','可见边线','外观近看','边线引导','简短说明','边线旁','无','注释随结构','边线质感','舒缓低密度'],
  ];
  b.panels.forEach((panel,i)=> {
    const fields=['angle','distance','focus','presentation','composition','typography','title_position','decoration','text_product_relation','visual_focus','rhythm'];
    fields.forEach((key,j)=>panel[key]=directions[i][j]);
    panel.difference=`模拟差异：${panel.focus}`;
    panel.lighting_materials='侧光区分表面与边缘，保持真实材质';
    panel.scene_physics='无人；接地阴影与支撑面一致';
    panel.visual_hierarchy='先看商品，再读说明，背景退后';
    panel.angle_evidence={mode:i===1||i===4?'supported_inference':'visible_only',source_ids:['P1'],basis:'仅以模拟可见面说明角度证据契约',limits:'不展示未知背面'};
  });
  Object.assign(b.panels[0],{background:'#FFFFFF',product_only:true,title:'',subtitle:''});
  const interaction=read(path.join(run,'interaction.json'));
  interaction.information={status:'sufficient',known:['Synthetic test data'],questions:[],response:null,notes:'Mock adequate information; not a real product assessment'};
  if(!hasStyle) interaction.style={mode:'recommendation',status:'selected',options:['A','B','C'].map(id=>({id,name:id==='A'?s.name:`Style ${id}`,description:`Direction ${id}`,fit:`Reason ${id}`})),selected_id:'A',response:{role:'user',message:'A',message_id:'MOCK-style'}};
  const persist=(refreshReview=true)=>{
    if(refreshReview) b.creative_review={digest:auditCreative(b,p,styleLock(s)).digest,checks:Object.fromEntries(CREATIVE_CHECKS.map(k=>[k,{status:'pass',notes:'MOCK semantic review; not visual validation'}])),accepted_repetitions:[]};
json(path.join(run,'interaction.json'),interaction);json(path.join(run,'product-understanding.json'),p);json(path.join(run,'style-analysis.json'),s);json(path.join(run,'six-image-blueprint.json'),b);}; persist();
  return {run,m,p,s,b,interaction,persist,input};
}
const approve = f => { const a=presentDesign(f.run); return approveDesign(f.run,{role:'user',message:'确认生成',message_id:'MOCK-user-turn',version:a.version,digest:a.digest}); };
const compile = f => {f.persist();approve(f);return compilePlan(f.run);};

test('V1.1: unapproved workflow cannot compile, hand off or execute host', async()=>{
  const f=fixture(); const a=presentDesign(f.run);
  assert.equal(a.task_status,'awaiting_design_approval');
  assert.equal(a.preview.split('\n').filter(x=>/^\| 0[1-6]/.test(x)).length,6);
  assert.throws(()=>compilePlan(f.run),/approval/);
  assert.throws(()=>createHandoff(f.run,cap),/approval/);
  let calls=0; await assert.rejects(executeOnce(f.run,cap,async()=>calls++),/approval/); assert.equal(calls,0);
  for(const message of ['看看','继续','还有吗','再优化一下','先这样','第三张改一改','确认生成，但第三张改一下'])
    assert.throws(()=>approveDesign(f.run,{role:'user',message,message_id:'mock',version:a.version,digest:a.digest}),/Explicit/);
  assert.throws(()=>approveDesign(f.run,{role:'assistant',message:'确认生成',message_id:'mock',version:a.version,digest:a.digest}),/Explicit/);
});
test('V1.1: targeted revision invalidates approval; new version alone reaches host', async()=>{
  const f=fixture();compile(f);const before=structuredClone(f.b.panels);
  f.b.panels[2].title='New Detail';f.persist();
  assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
  const pending=read(path.join(f.run,'design-approval.json'));assert.equal(pending.version,2);assert.equal(pending.can_generate,false);
  for(const i of [0,1,3,4,5]) assert.deepEqual(pending.panels[i],before[i]);
  assert.throws(()=>compilePlan(f.run),/approval/);
  approve(f);assert.throws(()=>createHandoff(f.run,cap),/approved version/);
  compilePlan(f.run);let calls=0;
  await executeOnce(f.run,cap,async args=>{calls++;assert.match(args.prompt,/New Detail/);});assert.equal(calls,1);
});
test('V1.1: stale responses and foreign run approvals cannot be reused',()=>{
  const f=fixture(),g=fixture();const old=presentDesign(f.run);approve(g);
  f.b.panels[1].subtitle='New Copy';f.persist();
  assert.throws(()=>approveDesign(f.run,{role:'user',message:'确认生成',message_id:'mock',version:old.version,digest:old.digest}),/Design changed/);
  assert.throws(()=>approveDesign(f.run,{role:'user',message:'确认生成',message_id:'mock',version:old.version,digest:old.digest}),/displayed version/);
  json(path.join(f.run,'design-approval.json'),read(path.join(g.run,'design-approval.json')));
  assert.throws(()=>compilePlan(f.run),/another run/);
});
test('V1.1: style, parameters and attachment selection changes require reapproval',()=>{
  for(const kind of ['style','fact','references']) {
    const f=fixture();compile(f);
    if(kind==='style'){f.s.creative_summary='暖色调、柔和摄影与轻快字体';f.b.global_style_lock_id=styleLock(f.s).id;}
    if(kind==='fact')f.p.facts[0].statement='清晰轮廓';
    if(kind==='references')f.p.sources[1].membership='other_product';
    f.persist();assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
    assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
  }
});
test('V1.1: brief preserves exact copy but excludes mechanical internal parameters',()=>{
  const f=fixture();f.b.panels[1].title='A User Provided Headline Preserved in Full '.repeat(3);compile(f);
  const prompt=createHandoff(f.run,cap).tool_arguments.prompt;
  assert.ok(prompt.includes(f.b.panels[1].title));assert.ok(prompt.includes(f.s.creative_summary));
  assert.doesNotMatch(prompt,/style_application|product_occupancy|area_ratios|可执行规则|右侧留白/);
  assert.equal((prompt.match(/【/g)||[]).length,5);
  assert.ok(prompt.length<2400,`Simple fixture brief: ${prompt.length}`);
});
test('V1.1: CLI resumes persisted preview and approval across processes',()=>{
  const f=fixture();const call=(...args)=>spawnSync(process.execPath,[path.join(root,'scripts/cli.mjs'),...args,'--run',f.run],{encoding:'utf8',timeout:15000});
  const shown=call('preview');assert.equal(shown.status,0,shown.stderr);const a=JSON.parse(shown.stdout);
  assert.equal(call('compile').status,1);
  const response=path.join(f.run,'response.json');json(response,{role:'user',message:'确认生成',message_id:'MOCK-turn',version:a.version,digest:a.digest});
  assert.equal(call('approve','--response',response).status,0);
  assert.equal(call('compile').status,0);
  assert.ok(createHandoff(f.run,cap).tool_arguments.prompt);
});

test('A: separate run IDs, originals retained byte-identically, output namespaces isolated',()=>{
  const a=fixture(),b=fixture(); assert.notEqual(a.run,b.run);
  assert.ok(a.run.includes(`${path.sep}work${path.sep}ahui-main-image-design${path.sep}`));
  assert.deepEqual(fs.readFileSync(path.join(a.run,a.m.products[0].path)),fs.readFileSync(a.input.product_images[0]));
});
test('B: product required but style optional; US defaults recorded',()=>{
  assert.throws(()=>inspectInputs({product_images:[],style_image:path.join(temp,'4.png')},temp),/产品/);
  const result=inspectInputs({product_images:[path.join(temp,'0.png')]},temp);
  assert.equal(result.style,null);const m=read(path.join(result.run_dir,'inputs.json'));assert.equal(m.marketplace,'amazon.com');assert.equal(m.locale,'en-US');assert.equal(m.workflow_mode,'plan');
});
test('B: style cannot masquerade as product by duplicate path or copied content',()=>{
  fs.copyFileSync(path.join(temp,'4.png'),path.join(temp,'renamed.png'));
  for (const image of ['4.png','renamed.png','style.bmp']) assert.throws(()=>inspectInputs({product_images:[path.join(temp,image)],style_image:path.join(temp,'4.png')},temp),/Style image/);
});
test('B: style text enters prompt; actual attachment list contains only products',()=>{
  const f=fixture();compile(f);const h=createHandoff(f.run,cap);
  assert.ok(h.tool_arguments.prompt.includes(f.s.creative_summary));
  assert.equal(h.tool_arguments.referenced_image_paths.length,3);
  assert.ok(h.tool_arguments.referenced_image_paths.every(p=>p.includes(`${path.sep}products${path.sep}`)));
  assert.equal(h.tool_arguments.num_last_images_to_include,undefined);
  assert.ok(!h.tool_arguments.prompt.includes(f.input.style_image));
});
test('B: changed source snapshot rejected before dispatch',()=>{
  const f=fixture();compile(f);fs.copyFileSync(path.join(temp,'4.png'),path.join(f.run,f.m.products[0].path));
  assert.throws(()=>createHandoff(f.run,cap),/snapshot changed/);
});
test('B: attachment injection rejected even in compiled job',()=>{
  const f=fixture();compile(f);const file=path.join(f.run,'composite-plan.json'),plan=read(file);plan.jobs[0].source_images.push(f.m.style);json(file,plan);
  assert.throws(()=>createHandoff(f.run,cap),/selection mismatch/);
});
test('B: style analysis cannot embed image attachments',()=>{
  const f=fixture();f.s.source_images=['some.png'];assert.throws(()=>validateStyle(f.s),/text only/);
});
test('C: six panels compile into one composite job with no anchors',()=>{
  const f=fixture(),plan=compile(f);assert.equal(plan.logical_panel_count,6);assert.equal(plan.jobs.length,1);
  assert.equal(plan.jobs[0].id,'COMPOSITE-01');assert.equal(plan.jobs[0].anchor,undefined);assert.equal(plan.jobs[0].max_calls,1);assert.equal(plan.jobs[0].retries,0);
});
test('C: host callback executed exactly once; subsequent execution blocked',async()=>{
  const f=fixture();compile(f);let calls=0;
  await executeOnce(f.run,cap,async args=>{calls++;assert.ok(args.prompt);return {mock:true};});
  await assert.rejects(executeOnce(f.run,cap,async()=>{calls++;}),/EEXIST/);assert.equal(calls,1);
});
test('C: failed host call does not retry or route to another provider',async()=>{
  const f=fixture();compile(f);let calls=0;
  await assert.rejects(executeOnce(f.run,cap,async()=>{calls++;throw new Error('simulated native failure');}),/simulated/);
  await assert.rejects(executeOnce(f.run,cap,async()=>{calls++;}),/EEXIST/);assert.equal(calls,1);
  assert.equal(read(path.join(f.run,'generation-failure.json')).retries,0);
});
test('C: concurrent claim processes yield only one successful handoff',async()=>{
  const f=fixture();compile(f);const file=path.join(f.run,'cap.json');json(file,cap);
  const {spawn}=await import('node:child_process');
  const call=()=>new Promise(resolve=>{const child=spawn(process.execPath,[path.join(root,'scripts/cli.mjs'),'claim','--run',f.run,'--capability',file],{stdio:'ignore'});child.on('close',resolve);});
  const codes=await Promise.all([call(),call()]);assert.deepEqual(codes.sort(),[0,1]);
});
test('C: five or seven panels and extra generation jobs rejected',()=>{
  for(const count of [5,7]){const f=fixture();f.b.panels=Array.from({length:count},(_,i)=>({...f.b.panels[i%6],index:i+1}));assert.throws(()=>compile(f),/six/);}
  const f=fixture();compile(f);const file=path.join(f.run,'composite-plan.json'),p=read(file);p.jobs.push({...p.jobs[0]});json(file,p);assert.throws(()=>createHandoff(f.run,cap),/one composite/);
});
test('D: prompt carries identity geometry facts and forbidden changes',()=>{
  const f=fixture();compile(f);const prompt=createHandoff(f.run,cap).tool_arguments.prompt;
  for(const value of [f.p.identity_summary,...f.p.identity_lock.must_preserve,...f.p.identity_lock.forbidden_changes,...f.p.identity_lock.geometry_constraints,f.p.facts[0].statement])assert.ok(prompt.includes(value));
});
test('D: missing optional product parameters continues with evidenced generic copy',()=>{
  const f=fixture({userText:''});assert.doesNotThrow(()=>compile(f));
});
test('D: fabricated generic performance and missing source facts rejected',()=>{
  const f=fixture();f.p.facts[0].statement='IPX8 防水';assert.throws(()=>compile(f),/Unsupported factual/);
  f.p.facts[0].statement='简约设计';f.b.panels[0].fact_ids=['missing'];assert.throws(()=>compile(f),/unsupported fact/);
});
test('D: user facts require actual user/file evidence; DOCX is extracted',()=>{
  const f=fixture({userText:'',docs:[path.join(temp,'info.docx')]});assert.ok(f.m.information_files[0].text.includes('用户资料'));
  f.p.facts.push({id:'F2',statement:'用户提供信息',source:'user',source_ids:['D1'],evidence:'用户资料'});assert.doesNotThrow(()=>validateProduct(f.p,f.m));
  f.p.facts[1].source_ids=['CHAT'];assert.throws(()=>validateProduct(f.p,f.m),/Missing user/);
});
test('D: other product excluded; mixed identity rejected',()=>{
  const f=fixture();f.p.sources[2].membership='other_product';f.p.sources[2].product_id='OTHER';const plan=compile(f);
  assert.ok(!plan.jobs[0].source_images.some(s=>s.id==='P3'));
  const g=fixture();g.p.sources[1].product_id='OTHER';assert.throws(()=>compile(g),/Mixed/);
});
test('D: duplicate product pixels and redundant roles not uploaded',()=>{
  const f=fixture({products:[0,0,1]});const selection=selectReferences(f.p,f.m);assert.equal(selection.selected.length,2);assert.ok(selection.excluded.some(s=>s.reason==='duplicate_pixels'));
});
test('D: count/byte caps honored and primary identity cannot be silently dropped',()=>{
  const f=fixture();assert.equal(selectReferences(f.p,f.m,{max_count:1}).selected.length,1);
  assert.throws(()=>selectReferences(f.p,f.m,{max_per_image_bytes:1}),/Primary/);
});
test('D: product preparation preserves original and aspect without upscale',()=>{
  const f=fixture({products:['large']});const before=fs.readFileSync(path.join(f.run,f.m.products[0].path));prepareProductReferences(f.run);
  const prepared=read(path.join(f.run,'prepared-references.json'));assert.equal(prepared[0].width,4096);assert.ok(Math.abs(prepared[0].width/prepared[0].height-42)<0.5);
  assert.deepEqual(before,fs.readFileSync(path.join(f.run,f.m.products[0].path)));compile(f);assert.ok(createHandoff(f.run,cap).tool_arguments.referenced_image_paths[0].includes('prepared-products'));
});
test('E: incomplete style, stale style lock and repeated compositions blocked',()=>{
  const f=fixture();f.s.color.contrast='';assert.throws(()=>compile(f),/style.color.contrast/);
  const g=fixture();g.s.color.contrast='changed';assert.throws(()=>compile(g),/inherit/);
  const h=fixture();for(const p of h.b.panels)p.buyer_question='same';assert.throws(()=>compile(h),/distinct/);
});
test('E: six panel design applications included and analysis frozen after compilation',()=>{
  const f=fixture();compile(f);const h=createHandoff(f.run,cap);for(const p of f.b.panels)assert.ok(h.tool_arguments.prompt.includes(p.creative_direction));
  f.p.name='changed';f.persist();assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
});
test('E: Amazon first panel enforces no copy, white product-only composition',()=>{
  const f=fixture({platform:'Amazon US'});f.b.platform_rules.first_panel_white_background=false;assert.throws(()=>compile(f),/Amazon/);
  f.b.platform_rules.first_panel_white_background=true;f.b.panels[0].title='Not Allowed';assert.throws(()=>compile(f),/White listing/);
  Object.assign(f.b.panels[0],{background:'#FFFFFF',product_only:true,title:'',subtitle:''});assert.doesNotThrow(()=>compile(f));
});
test('F: grid specification exact, no automatic split/upscale',()=>{
  const f=fixture(),job=compile(f).jobs[0];assert.deepEqual([job.canvas.columns,job.canvas.rows,job.canvas.panels],[2,3,6]);
  assert.equal(job.canvas.panel_ratio,'1:1');assert.equal(job.canvas.canvas_ratio,'2:3');assert.equal(job.automatic_split,false);assert.equal(job.upscale,false);assert.equal(job.output_count,1);
});
test('G: native unavailable/implicit attachments/external provider fail closed',()=>{
  const f=fixture();compile(f);
  for(const c of [{...cap,available:false},{...cap,explicit_image_paths:false},{...cap,tool:'external_api'},{...cap,max_reference_images:1}])assert.throws(()=>createHandoff(f.run,c));
  assert.ok(!fs.existsSync(path.join(f.run,'generation-claim.json')));
});
test('G: real file decoding and one PNG output; dimensions reported honestly',()=>{
  const f=fixture();compile(f);claimGeneration(f.run,cap);const result=saveResult(f.run,path.join(temp,'output.png'),'MOCK native callback for contract test');
  assert.deepEqual([result.width,result.height],[128,192]);assert.equal(result.format,'PNG');assert.equal(result.independent_images_exported,0);
  assert.deepEqual(fs.readdirSync(path.dirname(result.image_path)),['composite-preview.png']);
  assert.throws(()=>saveResult(f.run,path.join(temp,'output.png'),'mock'),/exists|overwrite/);
});
test('G: no source substitution, corrupt images or mismatched review accepted',()=>{
  const f=fixture();compile(f);claimGeneration(f.run,cap);assert.throws(()=>saveResult(f.run,path.join(temp,'0.png'),'MOCK'),/not generated/);
  fs.writeFileSync(path.join(temp,'bad.png'),'bad data');assert.throws(()=>imageIO({action:'inspect',files:[path.join(temp,'bad.png')]}));
});
test('CLI: unsupported provider flags rejected instead of ignored',()=>{
  const f=fixture();const p=spawnSync(process.execPath,[path.join(root,'scripts/cli.mjs'),'claim','--run',f.run,'--provider','third_party'],{encoding:'utf8',timeout:15000});assert.equal(p.status,1);assert.match(p.stderr,/Invalid argument/);
});
test('G: native data URL decoded and saved; remote URLs not silently downloaded',()=>{
  const f=fixture();compile(f);claimGeneration(f.run,cap);
  assert.throws(()=>saveNativeResponse(f.run,{image_url:'https://example.com/result.png'},'MOCK'),/data URL/);
  const image_url='data:image/png;base64,'+fs.readFileSync(path.join(temp,'output.png')).toString('base64');
  const result=saveNativeResponse(f.run,{image_url},'MOCK native data URL');assert.equal(result.format,'PNG');assert.equal(result.width,128);
});
test('CLI: init and outline in a Chinese path create pending forms that cannot generate',()=>{
  const ws=path.join(temp,'中文工作区');fs.mkdirSync(ws);const input=path.join(ws,'输入.json');json(input,{product_images:[path.join(temp,'0.png')],style_image:path.join(temp,'4.png')});
  const call=(...args)=>spawnSync(process.execPath,[path.join(root,'scripts/cli.mjs'),...args],{encoding:'utf8',timeout:15000});
  const initialized=call('init','--input',input,'--workspace',ws);assert.equal(initialized.status,0,initialized.stderr);const run=JSON.parse(initialized.stdout).run_dir;
  assert.equal(call('outline','--run',run).status,0);assert.equal(read(path.join(run,'product-understanding.json')).status,'pending');
  assert.equal(call('compile','--run',run).status,1);assert.ok(!fs.existsSync(path.join(run,'generation-claim.json')));
});

test('V2: consistent title layouts require a reason but are not hard-blocked',()=>{
  const f=fixture();
  for(const p of f.b.panels) Object.assign(p,{title_position:'顶部',decoration:'红色斜条',text_product_relation:'上文下商品'});
  f.persist(); const audit=auditCreative(f.b,f.p,styleLock(f.s));
  assert.equal(audit.status,'needs_codex_review');
  assert.ok(audit.findings.some(x=>x.code.startsWith('repeated_text_layout')&&!x.blocking));
  assert.throws(()=>presentDesign(f.run),/Resolve creative finding/);
  f.b.creative_review.accepted_repetitions=audit.findings.map(x=>({code:x.code,reason:'Shared reading structure; each panel has distinct content and imagery'}));
  f.persist(false);approve(f);compilePlan(f.run);
  assert.match(createHandoff(f.run,cap).tool_arguments.prompt,/红色斜条/);
});

test('V1.2: all approved creative decisions survive concise compilation without raw review JSON',t=>{
  const f=fixture();compile(f);const prompt=createHandoff(f.run,cap).tool_arguments.prompt;
  for(const p of f.b.panels) for(const key of ['objective','title','creative_direction','angle','distance','focus','presentation','composition','typography','rhythm','decoration','text_product_relation']) assert.ok(prompt.includes(p[key]),key);
  t.diagnostic(`Brief size: ${prompt.length} characters; ${(prompt.match(/\p{Script=Han}/gu)||[]).length} Chinese characters`);
  assert.ok(prompt.length < 2400);
  assert.doesNotMatch(prompt,/creative_review|accepted_repetitions|angle_evidence|MOCK semantic|product_occupancy/);
  assert.equal(prompt.split(f.s.creative_summary).length-1,1);
  assert.equal((prompt.match(/【/g)||[]).length,5);
});

test('V1.2: angle, composition, typography and rhythm revisions invalidate approval and reach new prompt',()=>{
  for(const key of ['angle','composition','typography','rhythm','decoration']) {
    const f=fixture();compile(f);const before=structuredClone(f.b.panels);
    f.b.panels[4][key]='用户指定新'+key;f.persist();
    assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
    assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
    for(const i of [0,1,2,3,5]) assert.deepEqual(f.b.panels[i],before[i]);
    approve(f);compilePlan(f.run);assert.ok(createHandoff(f.run,cap).tool_arguments.prompt.includes('用户指定新'+key));
  }
});

test('V1.2: stale or failed creative review blocks entry and clears previous generation approval',()=>{
  const f=fixture();compile(f);f.b.panels[1].composition='新的斜向关系';f.persist(false);
  assert.throws(()=>createHandoff(f.run,cap),/review missing or stale/);
  assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
  f.persist();f.b.creative_review.checks.typography.status='fail';f.persist(false);
  assert.throws(()=>presentDesign(f.run),/typography must pass/);
  f.persist();assert.equal(presentDesign(f.run).task_status,'awaiting_design_approval');
});

test('V1.2: real-angle evidence is selected and cannot be silently dropped by upload budgets',()=>{
  const f=fixture({products:[0,1,2,3]});
  f.p.sources[1].role='top';f.p.sources[2].role='detail';f.p.sources[3].role='detail';
  f.b.panels[1].source_ids=['P1','P2'];f.b.panels[1].angle_evidence={mode:'observed',source_ids:['P2'],basis:'模拟俯视图支持可见顶部',limits:'不推断内部'};
  f.b.panels[2].source_ids=['P1','P4'];f.b.panels[2].angle_evidence={mode:'observed',source_ids:['P4'],basis:'模拟另一细节图',limits:'仅可见细节'};
  f.persist();const shown=presentDesign(f.run,{max_count:3});
  assert.deepEqual(new Set(shown.selection.selected.map(x=>x.id)),new Set(['P1','P2','P4']));
  assert.throws(()=>presentDesign(f.run,{max_count:2}),/angle evidence not selected/);
  const a=presentDesign(f.run,{max_count:3});approveDesign(f.run,{role:'user',message:'确认生成',message_id:'MOCK',version:a.version,digest:a.digest});
  const plan=compilePlan(f.run,{max_count:3});assert.equal(plan.jobs.length,1);
  const h=createHandoff(f.run,cap);assert.equal(h.tool_arguments.referenced_image_paths.length,3);
  assert.ok(!h.tool_arguments.referenced_image_paths.includes(f.input.style_image));
});

test('V1.2: one-image planning varies scene/distance/layout without unsupported source or unseen-structure requests',()=>{
  const f=fixture({products:[0]});compile(f);const h=createHandoff(f.run,cap);
  assert.equal(h.tool_arguments.referenced_image_paths.length,1);
  assert.ok(new Set(f.b.panels.map(p=>p.distance)).size>1);
  assert.ok(new Set(f.b.panels.map(p=>p.typography)).size>1);
  assert.match(h.tool_arguments.prompt,/不展示未知背面/);
  const g=fixture({products:[0]});g.b.panels[0].angle_evidence.source_ids=['P2'];g.persist();
  assert.throws(()=>presentDesign(g.run),/Angle evidence/);
});

test('V1.2: evidence-limited repeated angles require reason; layouts remain varied',()=>{
  const f=fixture({products:[0]});
  for(const p of f.b.panels) Object.assign(p,{angle:'正侧面',distance:'整体',focus:'可见轮廓'});
  f.persist();assert.throws(()=>presentDesign(f.run),/Resolve creative finding/);
  const audit=auditCreative(f.b,f.p,styleLock(f.s));
  f.b.creative_review.accepted_repetitions=audit.findings.map(x=>({code:x.code,reason:'模拟单面证据限制；通过场景、构图、排版与信息强弱区分，不展示未知结构'}));
  f.persist(false);assert.doesNotThrow(()=>presentDesign(f.run));
});

test('V1.2: identical directions and adjacent repeated closeups are identified',()=>{
  const f=fixture();for(const key of ['angle','distance','focus','composition','typography'])f.b.panels[1][key]=f.b.panels[0][key];
  assert.ok(auditCreative(f.b,f.p,styleLock(f.s)).findings.some(x=>x.code.startsWith('duplicate_direction')));
  f.b.panels[2].distance='局部';f.b.panels[3].distance='局部';f.b.panels[3].focus=f.b.panels[2].focus;
  assert.ok(auditCreative(f.b,f.p,styleLock(f.s)).findings.some(x=>x.code==='adjacent_detail:3-4'));
});

test('V1.2: CLI audit is read-only and supplies the same current review digest',()=>{
  const f=fixture();const before=fs.readFileSync(path.join(f.run,'six-image-blueprint.json'));
  const result=spawnSync(process.execPath,[path.join(root,'scripts/cli.mjs'),'audit','--run',f.run],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).digest,f.b.creative_review.digest);
  assert.deepEqual(fs.readFileSync(path.join(f.run,'six-image-blueprint.json')),before);
  assert.ok(!fs.existsSync(path.join(f.run,'generation-claim.json')));
});

test('V1.2: intentionally text-free product photography is not flagged as a repeated title template',()=>{
  const f=fixture();
  for(const p of f.b.panels) Object.assign(p,{title:'',subtitle:'',title_position:'无',decoration:'无',text_product_relation:'无文案'});
  f.persist();assert.ok(!auditCreative(f.b,f.p,styleLock(f.s)).findings.some(x=>x.code.startsWith('repeated_text_layout')));
  assert.doesNotThrow(()=>presentDesign(f.run));
});


test('V2.1: pending information, silence and missing style selection still block preview',()=>{
  const f=fixture();f.interaction.information={status:'awaiting_reply',known:[],questions:['What is included?'],response:null,notes:'Missing information'};f.persist();
  assert.throws(()=>presentDesign(f.run),/information interaction is pending/);
  f.interaction.information.status='declined';f.persist();assert.throws(()=>presentDesign(f.run),/Actual information reply/);
  const g=fixture({hasStyle:false});g.interaction.style.status='awaiting_selection';g.persist();
  assert.throws(()=>presentDesign(g.run),/Select a text-only style/);
  g.interaction.style.status='selected';g.interaction.style.selected_id='B';g.persist();assert.throws(()=>presentDesign(g.run),/match selected/);
  g.interaction.style.selected_id='A';g.interaction.style.response=null;g.persist();assert.throws(()=>presentDesign(g.run),/Actual style selection/);
  g.interaction.style.response={role:'user',message:'You recommend',message_id:'MOCK-delegate'};g.interaction.style.delegated=true;g.interaction.style.reason='Best matches this product';g.persist();
  assert.equal(presentDesign(g.run).can_generate,false);
  const h=fixture();h.interaction.style.options=[{id:'A'}];h.persist();assert.throws(()=>presentDesign(h.run),/Use supplied reference directly/);
});

test('V2.1: partial and no-information replies continue to preview; CHAT facts retain evidence',()=>{
  for(const status of ['answered','declined']){
    const f=fixture({userText:''});
    f.interaction.information={status,known:['Visible form'],questions:['What is included?'],response:{role:'user',message:status==='answered'?'Only the product is included':'No more information; use the photo',message_id:'MOCK-followup'},notes:'Other specifications remain unknown'};
    if(status==='answered')f.p.facts.push({id:'F2',statement:'Only the product is included',source:'user',source_ids:['CHAT'],evidence:'Only the product is included'});
    f.persist();assert.equal(presentDesign(f.run).can_generate,false);assert.throws(()=>compilePlan(f.run),/approval/);
    approve(f);assert.doesNotThrow(()=>compilePlan(f.run));
  }
});

test('V2.1: only the standalone exact phrase approves, even when intent claims approval',async()=>{
  for(const mode of ['plan','generate']){
    const f=fixture({mode}),a=presentDesign(f.run);
    for(const message of ['可以','开始吧','就照这个方案做吧','确认开始生成','OK，开始出图','不要确认生成','“确认生成”','确认生成，但第三张改一下','收到确认生成再做','确认生成！','确认 生成'])
      assert.throws(()=>approveDesign(f.run,{role:'user',message,message_id:'MOCK',intent:'approve_current_design',version:a.version,digest:a.digest}),/Explicit/);
    let calls=0;await assert.rejects(executeOnce(f.run,cap,async()=>calls++));assert.equal(calls,0);
    approveDesign(f.run,{role:'user',message:'  确认生成  ',message_id:'MOCK-new-reply',version:a.version,digest:a.digest});
    compilePlan(f.run);await executeOnce(f.run,cap,async()=>calls++);assert.equal(calls,1);
  }
});

test('V2.1: legacy ready CLI only previews; automatic records cannot reach any generation entry',async()=>{
  const f=fixture({mode:'generate',hasStyle:false});
  const call=(command)=>spawnSync(process.execPath,[path.join(root,'scripts/cli.mjs'),command,'--run',f.run],{encoding:'utf8',timeout:15000});
  const ready=call('ready');assert.equal(ready.status,0,ready.stderr);const state=JSON.parse(ready.stdout);
  assert.equal(state.task_status,'awaiting_design_approval');assert.equal(state.can_generate,false);assert.equal(call('compile').status,1);
  json(path.join(f.run,'design-approval.json'),{...state,authorization_mode:'automatic',status:'approved',approved:true,can_generate:true,approved_version:state.version});
  assert.throws(()=>compilePlan(f.run),/approval/);assert.throws(()=>createHandoff(f.run,cap),/approval/);assert.throws(()=>claimGeneration(f.run,cap),/approval/);
  let calls=0;await assert.rejects(executeOnce(f.run,cap,async()=>calls++),/approval/);assert.equal(calls,0);
  approve(f);compilePlan(f.run);assert.doesNotThrow(()=>createHandoff(f.run,cap));
});

test('V2.1: entire English copy is previewed and compiled; translation is preview-only',()=>{
  const f=fixture();f.b.panels[1].extra_copy=['Visible Edge','Look Closer'];f.b.panels[1].copy_zh='唯一中文释义不进入生图';f.persist();
  const a=presentDesign(f.run);assert.match(a.preview,/Visible Edge/);assert.match(a.preview,/Look Closer/);assert.match(a.preview,/唯一中文释义不进入生图/);
  assert.match(a.preview,/最终上图文案/);assert.match(a.preview,/无额外营销文案/);
  approve(f);compilePlan(f.run);const prompt=createHandoff(f.run,cap).tool_arguments.prompt;
  assert.match(prompt,/Visible Edge/);assert.match(prompt,/Look Closer/);assert.doesNotMatch(prompt,/唯一中文释义不进入生图/);
  f.b.panels[1].extra_copy[0]='Updated Edge';f.persist();assert.throws(()=>claimGeneration(f.run,cap),/Design changed/);
  assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
});

test('V2.1: fixed platform, default English, count and white main image reject conflicting input',()=>{
  for(const change of [{platform:'Taobao'},{marketplace:'amazon.de'},{panel_count:7},{output_count:1}])
    assert.throws(()=>inspectInputs({product_images:[path.join(temp,'0.png')],...change},temp));
  const f=fixture({platform:'亚马逊'});f.b.panels[1].extra_copy=['中文标签'];f.persist();assert.throws(()=>presentDesign(f.run),/English/);
  f.b.panels[1].extra_copy=[];f.b.panels[0].extra_copy=['Promotion'];f.persist();assert.throws(()=>presentDesign(f.run),/White listing/);
  f.b.panels[0].extra_copy=[];f.b.panels[0].background='#EEEEEE';f.persist();assert.throws(()=>presentDesign(f.run),/White listing/);
  f.b.panels[0].background='#FFFFFF';f.persist();assert.equal(presentDesign(f.run).can_generate,false);
});

test('V3: local planning needs no URLs; changed knowledge application invalidates approval',()=>{
  const f=fixture();const preview=presentDesign(f.run).preview;
  assert.match(preview,/本地亚马逊主图知识库/);assert.doesNotMatch(preview,/竞品研究|https:/);
  approve(f);compilePlan(f.run);
  f.b.knowledge_basis.application='Changed local planning';f.persist();assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
  f.b.knowledge_basis.mode='web';f.persist();assert.throws(()=>presentDesign(f.run),/Local knowledge/);
});

test('V2.1: scene and benefit review cannot be skipped; three distinct closeups are still flagged',()=>{
  const f=fixture();f.b.creative_review.checks.scenes.status='fail';f.persist(false);assert.throws(()=>presentDesign(f.run),/scenes must pass/);
  f.persist();f.b.creative_review.checks.benefit_expression.status='fail';f.persist(false);assert.throws(()=>presentDesign(f.run),/benefit_expression must pass/);
  for(const i of [2,3,4])f.b.panels[i].distance='局部';f.persist();
  assert.ok(auditCreative(f.b,f.p,styleLock(f.s)).findings.some(x=>x.code==='consecutive_details:3-4-5'));
  assert.throws(()=>presentDesign(f.run),/Resolve creative finding/);
});

test('V2.1: interaction changes invalidate prior confirmation',()=>{
  const f=fixture();compile(f);f.interaction.information.notes='Changed assessment';f.persist();assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
  assert.throws(()=>compilePlan(f.run),/approval/);approve(f);compilePlan(f.run);assert.doesNotThrow(()=>createHandoff(f.run,cap));
});

test('V2.2: reference scope is explicit and cannot masquerade as a no-reference direction',()=>{
  const f=fixture();
  for(const mode of ['full_style','selective','quality_only']) {
    const s=structuredClone(f.s);s.reference_intent.mode=mode;
    assert.equal(styleLock(s).reference_intent.mode,mode);
  }
  for(const reference_intent of [undefined,{mode:'none',basis:'Wrong source'},{mode:'quality_only',basis:''}])
    assert.throws(()=>validateStyle({...f.s,reference_intent}),/intent/);
  const g=fixture({hasStyle:false});assert.doesNotThrow(()=>validateStyle(g.s));
  g.s.reference_intent.mode='full_style';assert.throws(()=>validateStyle(g.s),/intent/);
});

test('V2.2: quality-only reference transfers selected methods, not raw palette observations or attachments',()=>{
  const f=fixture();
  f.s.reference_intent={mode:'quality_only',basis:'Only borrow photographic finish; adapt to the supplied product'};
  f.s.color.background='OBSERVED_ORANGE_TECH_BACKGROUND_NOT_SELECTED';
  f.s.creative_summary='Restrained outdoor product photography';
  f.s.transferable=['Use a clear reading order'];
  f.s.set_rules=['Retain distinct matte and transparent responses'];
  f.s.do_not_copy=['Do not inherit the reference industry effects'];
  f.b.global_style_lock_id=styleLock(f.s).id;f.persist();
  const preview=presentDesign(f.run).preview;
  for(const value of [f.s.reference_intent.basis,...f.s.transferable,...f.s.set_rules,...f.s.do_not_copy])assert.ok(preview.includes(value));
  approve(f);compilePlan(f.run);const h=createHandoff(f.run,cap);
  for(const value of [...f.s.transferable,...f.s.set_rules,...f.s.do_not_copy])assert.ok(h.tool_arguments.prompt.includes(value));
  assert.doesNotMatch(h.tool_arguments.prompt,/OBSERVED_ORANGE_TECH_BACKGROUND_NOT_SELECTED/);
  assert.ok(h.tool_arguments.referenced_image_paths.every(p=>!p.includes('style-analysis-only')));
});

test('V2.2: per-panel photography, physics and hierarchy must reach preview and native handoff',()=>{
  const f=fixture();
  const values={lighting_materials:'Side light preserves woven texture',scene_physics:'Fingers wrap the handle; the strap carries the hanging weight',visual_hierarchy:'Handle contact first, short explanation second, environment recedes'};
  Object.assign(f.b.panels[1],values);f.persist();
  const preview=presentDesign(f.run).preview;approve(f);compilePlan(f.run);
  const prompt=createHandoff(f.run,cap).tool_arguments.prompt;
  for(const value of Object.values(values)){assert.ok(preview.includes(value));assert.ok(prompt.includes(value));}
  for(const key of Object.keys(values)) {
    const g=fixture();g.b.panels[1][key]='';g.persist();
    assert.throws(()=>presentDesign(g.run),new RegExp(key));
    assert.ok(!fs.existsSync(path.join(g.run,'generation-claim.json')));
  }
});

test('V2.2: changes to photography and selected reference rules revoke existing approval',()=>{
  for(const key of ['lighting_materials','scene_physics','visual_hierarchy','reference_intent','set_rules']) {
    const f=fixture();compile(f);
    if(key==='reference_intent')f.s.reference_intent.basis='Changed adaptation decision';
    else if(key==='set_rules')f.s.set_rules=['Changed material light direction'];
    else f.b.panels[1][key]='Changed execution decision';
    f.b.global_style_lock_id=styleLock(f.s).id;f.persist();
    assert.throws(()=>createHandoff(f.run,cap),/Design changed/);
    assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
    assert.throws(()=>claimGeneration(f.run,cap),/approval/);
  }
});

test('V2.2: older run contracts cannot bypass the updated planning requirements',()=>{
  const f=fixture();compile(f);
  json(path.join(f.run,'inputs.json'),{...f.m,version:'2.1.0'});
  for(const entry of [()=>presentDesign(f.run),()=>compilePlan(f.run),()=>createHandoff(f.run,cap),()=>claimGeneration(f.run,cap)])
    assert.throws(entry,/V3.3 requires a new run/);
  assert.ok(!fs.existsSync(path.join(f.run,'generation-claim.json')));
});

// V3.1 uses synthetic rasters and deferred callbacks, never a generation provider.
const hdFixtures = runPython( ['-c',
  'from PIL import Image; from pathlib import Path; import sys; p=Path(sys.argv[1]); [(Image.new("RGB",(n,n),"cyan").save(p/("hd"+str(n)+".png"))) for n in [512,1024,1254,2048]]; Image.new("RGB",(1024,1100),"cyan").save(p/"hdwrong.png"); im=Image.new("RGB",(128,192)); colors=["red","green","blue","yellow","purple","orange"]; [im.paste(c,((i%2)*64,(i//2)*64,(i%2+1)*64,(i//2+1)*64)) for i,c in enumerate(colors)]; im.save(p/"grid.png")', temp], {encoding:'utf8',timeout:15000});
assert.equal(hdFixtures.status,0,hdFixtures.stderr);
const hdJson = (f,name) => read(path.join(f.run,name));
function sample(change = () => {}) {
  const f=fixture();change(f);compile(f);claimGeneration(f.run,cap);
  saveResult(f.run,path.join(temp,'grid.png'),'MOCK-composite-result');return f;
}
const hdResponse = state => ({role:'user',message:'继续做高清图',message_id:'MOCK-after-composite',intent:'approve_hd',overall_approved:true,pending_changes:false,version:state.version,digest:state.digest});
const hdStart = f => {const state=previewHD(f.run);approveHD(f.run,hdResponse(state));return splitHD(f.run);};
const userEdit = (id='MOCK-edit') => ({user_request:{role:'user',message:'请修改第二张的文字细节，其他保持',message_id:id}});
const savePanel = (f,index,attempt=1,side=1254) => saveHD(f.run,index,attempt,path.join(temp,`hd${side}.png`),`MOCK-result-${index}-${attempt}`);

test('V3.3: initial multiple references are isolated, validated and all analyzed',()=>{
  const input={product_images:[path.join(temp,'0.png')],style_images:[path.join(temp,'3.png'),path.join(temp,'4.png')],locale:'ja-JP'};
  const result=inspectInputs(input,temp), m=read(path.join(result.run_dir,'inputs.json'));
  assert.equal(m.locale,'ja-JP');assert.equal(m.styles.length,2);
  for(const s of m.styles) assert.deepEqual(fs.readFileSync(path.join(result.run_dir,s.path)),fs.readFileSync(s.original_path));
  assert.throws(()=>inspectInputs({...input,style_images:[input.style_images[0],input.product_images[0]]},temp),/Style image/);
  const f=fixture({hasStyle:false});approve(f);
  const productBefore=fs.readFileSync(path.join(f.run,'product-understanding.json'),'utf8');
  setStyleReferences(f.run,{style_images:input.style_images,user_request:{role:'user',message:'这两个风格图作为参考',message_id:'MOCK-upload'}});
  assert.equal(fs.readFileSync(path.join(f.run,'product-understanding.json'),'utf8'),productBefore);
  assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
  assert.equal(read(path.join(f.run,'style-analysis.json')).status,'pending');
  f.interaction.style=read(path.join(f.run,'interaction.json')).style;
  Object.assign(f.s,{origin:'reference',reference_intent:{mode:'full_style',basis:'Both synthetic references inspected'},source_ids:['STYLE1']});
  f.b.global_style_lock_id=styleLock(f.s).id;f.persist();
  assert.throws(()=>presentDesign(f.run),/every supplied/);
  f.s.source_ids=['STYLE1','STYLE2'];f.b.global_style_lock_id=styleLock(f.s).id;compile(f);
  const h=createHandoff(f.run,cap);assert.ok(h.tool_arguments.referenced_image_paths.every(p=>!p.includes('style-analysis-only')));
  const second=read(path.join(f.run,'inputs.json')).styles[1];
  fs.copyFileSync(path.join(temp,'0.png'),path.join(f.run,second.path));
  assert.throws(()=>createHandoff(f.run,cap),/snapshot changed/);
});

test('V3.3: language switch revokes approval, requires rewritten copy and reaches HD',()=>{
  const f=fixture();const old=approve(f);
  setCopyLanguage(f.run,{locale:'zh-CN',user_request:{role:'user',message:'改成中文版',message_id:'MOCK-language'}});
  assert.equal(read(path.join(f.run,'design-approval.json')).can_generate,false);
  assert.throws(()=>presentDesign(f.run),/rewrite all copy/);
  assert.throws(()=>claimGeneration(f.run,cap),/rewrite all copy/);
  f.b.copy_locale='zh-CN';f.b.panels.slice(1).forEach((p,i)=>{p.title=`简洁外观${i}`;p.extra_copy=['边缘细节','表面纹理'];});f.persist();
  const shown=presentDesign(f.run);assert.match(shown.preview,/简洁外观0/);assert.doesNotMatch(shown.preview,/\| 中文释义 \|/);
  assert.equal(shown.preview.split('\n').filter(s=>/^\| 0[1-6]/.test(s)).length,6);
  assert.throws(()=>approveDesign(f.run,{role:'user',message:'确认生成',message_id:'MOCK-stale',version:old.version,digest:old.digest}),/displayed version/);
  approve(f);compilePlan(f.run);const h=claimGeneration(f.run,cap);
  assert.match(h.tool_arguments.prompt,/zh-CN/);assert.match(h.tool_arguments.prompt,/边缘细节/);
  saveResult(f.run,path.join(temp,'grid.png'),'MOCK-zh');hdStart(f);
  const jobs=claimHDBatch(f.run,cap).jobs;
  assert.ok(jobs.every(j=>j.locale==='zh-CN' && j.tool_arguments.prompt.includes('language: zh-CN')));
  assert.match(jobs[1].tool_arguments.prompt,/边缘细节/);
  assert.throws(()=>setCopyLanguage(f.run,{locale:'ja-JP',user_request:{role:'user',message:'日语',message_id:'MOCK-late'}}),/already claimed/);
});

test('V3.3: Japanese copy including kanji is accepted with explicit language',()=>{
  const f=fixture();setCopyLanguage(f.run,{locale:'ja-JP',user_request:{role:'user',message:'日语版',message_id:'MOCK-ja'}});
  f.b.copy_locale='ja-JP';f.b.panels[1].title='シンプルな外観';f.b.panels[1].extra_copy=['表面の質感'];f.persist();
  const shown=presentDesign(f.run);assert.match(shown.preview,/中文释义/);compile(f);
  assert.match(createHandoff(f.run,cap).tool_arguments.prompt,/シンプルな外観/);
});

test('V3.3: post-sample language changes require complete preview and new confirmation',()=>{
  const f=sample(), panels=structuredClone(f.b.panels).map(({index,title,subtitle,extra_copy,copy_zh})=>({index,title,subtitle,extra_copy,copy_zh}));
  panels.slice(1).forEach(p=>{p.title='简洁外观';p.extra_copy=['纹理细节'];});
  const request={...userEdit('MOCK-change-language'),locale:'zh-CN',panels,fact_review:'Same verified appearance facts'};
  assert.throws(()=>claimCompositeRevision(f.run,request,cap),/rewritten copy/);
  const shown=previewCopyChange(f.run,request);assert.equal(shown.panels.length,6);assert.match(shown.preview,/纹理细节/);
  request.copy_confirmation={role:'user',message:'确认生成',message_id:request.user_request.message_id,digest:shown.digest};
  assert.throws(()=>claimCompositeRevision(f.run,request,cap),/New confirmation/);
  request.copy_confirmation.message_id='MOCK-confirm-new-copy';
  request.panels[1].title='新的外观';assert.throws(()=>claimCompositeRevision(f.run,request,cap),/Copy or source changed/);
  request.panels[1].title='简洁外观';
  const claim=claimCompositeRevision(f.run,request,cap);assert.match(claim.tool_arguments.prompt,/language: zh-CN/);
  saveCompositeRevision(f.run,claim.revision,path.join(temp,'output.png'),'MOCK-revised-language');
  assert.equal(currentComposite(f.run).locale,'zh-CN');hdStart(f);
  const jobs=claimHDBatch(f.run,cap).jobs;assert.ok(jobs.every(j=>j.locale==='zh-CN'));
});

test('V3.3: targeted HD language changes require confirmation and preserve other panels',()=>{
  const f=sample(f=>{
    setCopyLanguage(f.run,{locale:'zh-CN',user_request:{role:'user',message:'中文',message_id:'MOCK-initial-zh'}});
    f.b.copy_locale='zh-CN';f.b.panels.slice(1).forEach(p=>{p.title='简洁外观';});
  });hdStart(f);claimHDBatch(f.run,cap);savePanel(f,2);
  const request={...userEdit('MOCK-hd-language'),locale:'ja-JP',copy:{...hdJson(f,'hd-approval.json').panels[1],title:'シンプルな外観'},fact_review:'Same appearance fact'};
  assert.throws(()=>claimHD(f.run,2,cap,request),/rewritten copy/);
  const shown=previewCopyChange(f.run,request);
  request.copy_confirmation={role:'user',message:'确认生成',message_id:'MOCK-confirm-hd-language',digest:shown.digest};
  const claim=claimHD(f.run,2,cap,request);assert.equal(claim.locale,'ja-JP');assert.match(claim.tool_arguments.prompt,/language: ja-JP/);
  assert.equal(hdJson(f,'hd-3-1-claim.json').locale,'zh-CN');
  savePanel(f,2,2);
  const english={...userEdit('MOCK-hd-English'),locale:'en-US',copy:{...request.copy,title:'Simple Form'},fact_review:'Same appearance fact'};
  const englishShown=previewCopyChange(f.run,english);
  english.copy_confirmation={role:'user',message:'确认生成',message_id:'MOCK-confirm-English',digest:englishShown.digest};
  assert.equal(claimHD(f.run,2,cap,english).locale,'en-US');
  assert.equal(hdJson(f,'hd-3-1-claim.json').copy.title,'简洁外观');
});

test('V3.1: sample preview contains only image and fixed message, no repeated copy or QA dependency',()=>{
  const f=sample(), preview=previewHD(f.run);
  assert.equal(preview.preview,SAMPLE_MESSAGE);assert.equal(preview.panels,undefined);
  assert.ok(fs.existsSync(preview.image_path));assert.ok(!preview.preview.includes('Simple Form'));
  assert.ok(!fs.existsSync(path.join(f.run,'composite-qa.json')));
  assert.throws(()=>splitHD(f.run),/HD approval/);
  for(const patch of [{role:'assistant'},{intent:'revise'},{pending_changes:true},{message_id:'MOCK-user-turn'},{version:99}])
    assert.throws(()=>approveHD(f.run,{...hdResponse(preview),...patch}));
  approveHD(f.run,hdResponse(preview));const crops=splitHD(f.run);
  assert.equal(crops.panels.length,6);
  for(let i=0;i<5;i++) assert.equal(crops.panels[i].pixel_sha256,imageIO({action:'inspect',files:[path.join(temp,`${i}.png`)]})[0].pixel_sha256);
  assert.deepEqual(splitHD(f.run),crops);
});

test('V3.1: non-grid sample can be shown, but geometry cannot be silently stretched',()=>{
  const f=fixture();compile(f);claimGeneration(f.run,cap);saveResult(f.run,path.join(temp,'wrong.png'),'MOCK');
  const state=previewHD(f.run);approveHD(f.run,hdResponse(state));assert.throws(()=>splitHD(f.run),/exact 2x3/);
  assert.equal(fs.readdirSync(f.run).filter(n=>n.endsWith('-claim.json')).length,1);
});

test('V3.1: each HD prompt has its own full copy and matching angle evidence, never style',()=>{
  const f=sample(f=>{
    f.b.panels[1].angle_evidence.source_ids=['P2'];f.b.panels[1].source_ids=['P2','P1'];
    f.b.panels[1].title='Exact Second Headline';f.b.panels[1].extra_copy=['Size | Chest (cm / in) | Length (cm / in)','S | 106 / 41.7 | 65 / 25.6','Allow 1–3 cm (0.4–1.2 in) for manual measurement.'];
    f.b.panels[2].title='Only Third Headline';f.b.panels[2].angle_evidence.source_ids=['P3'];f.b.panels[2].source_ids=['P3'];
  });
  const crops=hdStart(f), batch=claimHDBatch(f.run,cap);
  assert.equal(batch.jobs.length,6);
  for(const job of batch.jobs){assert.equal(job.tool_arguments.referenced_image_paths[0],crops.panels[job.index-1].path);assert.equal(job.tool_arguments.num_last_images_to_include,undefined);}
  const second=batch.jobs[1].tool_arguments;
  assert.deepEqual(second.referenced_image_paths.slice(1).map(p=>path.basename(p)),['P2.png','P1.png']);
  for(const str of [f.b.panels[1].title,...f.b.panels[1].extra_copy])assert.ok(second.prompt.includes(str));
  assert.ok(!second.prompt.includes('Only Third Headline'));
  assert.deepEqual(batch.jobs[2].tool_arguments.referenced_image_paths.slice(1).map(p=>path.basename(p)),['P3.png']);
  assert.ok(batch.jobs.every(j=>!j.tool_arguments.referenced_image_paths.some(p=>p.includes('style-analysis-only'))));
  assert.ok(batch.jobs.every(j=>!j.tool_arguments.prompt.includes('{{COPY}}')));
  assert.throws(()=>claimHDBatch(f.run,cap),/already started/);
});

test('V3.1: dispatcher starts all six before any resolution; out-of-order results retain identity',async()=>{
  const f=sample();hdStart(f);const batch=claimHDBatch(f.run,cap);
  const dispatch=eval('('+batch.dispatch_function+')');
  const starts=[], completions=[], pending=new Map();
  const all=dispatch(batch.jobs,(_args,job)=>{starts.push(job.index);return new Promise((resolve,reject)=>pending.set(job.index,{resolve,reject}));},async(job,result)=>{
    assert.equal(result.index,job.index);completions.push(job.index);
    savePanel(f,job.index,job.attempt);
  });
  assert.deepEqual(starts,[1,2,3,4,5,6]);assert.deepEqual(completions,[]);
  for(const index of [6,2,5,1,4,3]){pending.get(index).resolve({index});await new Promise(resolve=>setImmediate(resolve));}
  const settled=await all;assert.ok(settled.every(s=>s.status==='fulfilled'));
  assert.deepEqual(completions,[6,2,5,1,4,3]);
  const result=finishHD(f.run);assert.equal(result.status,'complete');assert.equal(result.visual_review,'user');
  assert.deepEqual(result.panels.map(p=>path.basename(p.image_path)),['01.png','02.png','03.png','04.png','05.png','06.png']);
  assert.ok(!fs.readdirSync(f.run).some(n=>/^(?:composite-qa|visual-review|hd-\d+-\d+-qa)\.json$/.test(n)));
});

test('V3.1: one rejected generation preserves other results and never schedules a retry',async()=>{
  const f=sample();hdStart(f);const batch=claimHDBatch(f.run,cap),calls=[];
  const settled=await dispatchNativeBatch(batch.jobs,async(_args,j)=>{
    calls.push(j.index);if(j.index===3)throw new Error('MOCK definitive native failure');return {index:j.index};
  },async j=>savePanel(f,j.index));
  assert.equal(settled[2].status,'rejected');assert.equal(calls.length,6);
  assert.throws(()=>finishHD(f.run),/Panel 3 incomplete/);
  failHD(f.run,3,1,{reason:'MOCK failed',host_evidence:'MOCK-native-error',definitive:true});
  assert.throws(()=>claimHD(f.run,3,cap),/No automatic retry/);
  const delivery=finishHD(f.run);assert.equal(delivery.status,'partial');assert.equal(delivery.panels.filter(p=>p.image_path).length,5);
  assert.ok(!delivery.message.includes('六张独立高清图已做好'));
});

test('V3.1: native result remains recoverable when persistence fails',async()=>{
  const f=sample();hdStart(f);const batch=claimHDBatch(f.run,cap),retained=new Map();let calls=0;
  const settled=await dispatchNativeBatch(batch.jobs,async(_args,j)=>{calls++;return {index:j.index};},async(j,r)=>{
    retained.set(j.index,r);if(j.index===2)throw new Error('MOCK save error');savePanel(f,j.index);
  });
  assert.equal(settled[1].status,'rejected');assert.equal(calls,6);assert.equal(retained.get(2).index,2);
  assert.throws(()=>claimHD(f.run,2,cap),/No automatic retry/);
  savePanel(f,2);assert.equal(finishHD(f.run).status,'complete');
});

test('V3.1: unknown results block resubmission even with a user request',()=>{
  const f=sample();hdStart(f);claimHDBatch(f.run,cap);
  failHD(f.run,2,1,{reason:'MOCK still running',host_evidence:'MOCK',definitive:false});
  assert.throws(()=>claimHD(f.run,2,cap,userEdit()),/unknown/);
  assert.throws(()=>finishHD(f.run),/incomplete/);
});

test('V3.1: user-requested edit changes only one task and cannot reuse the same user message',()=>{
  const f=sample();hdStart(f);claimHDBatch(f.run,cap);for(let i=1;i<=6;i++)savePanel(f,i);
  finishHD(f.run);assert.throws(()=>claimHD(f.run,2,cap),/No automatic retry/);
  const request=userEdit();request.copy={...f.b.panels[1],title:'User Revised Text',extra_copy:['Exact revised detail']};request.fact_review='MOCK user-supported copy';
  const claim=claimHD(f.run,2,cap,request);assert.equal(claim.attempt,2);assert.ok(claim.tool_arguments.prompt.includes('User Revised Text'));
  savePanel(f,2,2,2048);assert.throws(()=>claimHD(f.run,2,cap,request),/already submitted/);
  const delivery=finishHD(f.run);assert.equal(delivery.panels[1].width,2048);assert.equal(delivery.panels[0].width,1254);
  assert.equal(fs.readdirSync(f.run).filter(n=>/^hd-\d+-\d+-claim\.json$/.test(n)).length,7);
  const again=claimHD(f.run,2,cap,userEdit('MOCK-new-request'));assert.equal(again.attempt,3);assert.ok(again.tool_arguments.prompt.includes('User Revised Text'));
});

test('V3.1: file and source checks remain without visual inspection or automatic resolution retries',()=>{
  const f=sample();const crops=hdStart(f);claimHDBatch(f.run,cap);
  assert.throws(()=>saveHD(f.run,1,1,crops.panels[0].path,'MOCK'),/Reference/);
  for(const [i,side] of [1024,1254,2048,512].entries())savePanel(f,i+1,1,side);
  saveHD(f.run,5,1,path.join(temp,'hdwrong.png'),'MOCK');savePanel(f,6);
  const delivery=finishHD(f.run);assert.equal(delivery.status,'complete');assert.equal(delivery.panels[3].width,512);
  assert.equal(delivery.panels[4].height,1100);assert.throws(()=>claimHD(f.run,4,cap),/No automatic retry/);
  assert.deepEqual(savePanel(f,1,1,1024),hdJson(f,'hd-1-1-result.json'));
  assert.throws(()=>savePanel(f,1,1,2048),/Different result/);
});

test('V3.1: data URL result can be saved without image generation or QA',()=>{
  const f=sample();hdStart(f);const claim=claimHD(f.run,1,{...cap,max_reference_images:2});
  assert.equal(claim.tool_arguments.referenced_image_paths.length,2);
  const response={image_url:'data:image/png;base64,'+fs.readFileSync(path.join(temp,'hd1254.png')).toString('base64')};
  const result=saveHDResponse(f.run,1,1,response,'MOCK');assert.equal(result.width,1254);
  assert.deepEqual(saveHDResponse(f.run,1,1,response,'MOCK'),result);
});

test('V3.1: batch validation is all-or-nothing before claims; tampered crop is rejected',()=>{
  const f=sample();const crops=hdStart(f);
  assert.throws(()=>claimHDBatch(f.run,{...cap,max_reference_images:1}),/exceed/);
  assert.ok(!fs.existsSync(path.join(f.run,'hd-batch-claim.json')));
  fs.copyFileSync(path.join(temp,'0.png'),crops.panels[5].path);
  assert.throws(()=>claimHDBatch(f.run,cap),/Crop changed/);
  assert.ok(!fs.existsSync(path.join(f.run,'hd-1-1-claim.json')));
});

test('V3.1: simultaneous batch claims permit one dispatch only',async()=>{
  const f=sample();hdStart(f);const capFile=path.join(f.run,'cap.json');json(capFile,cap);
  const {spawn}=await import('node:child_process');
  const call=()=>new Promise(resolve=>{const child=spawn(process.execPath,[path.join(root,'scripts/cli.mjs'),'hd-batch','--run',f.run,'--capability',capFile],{stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>error+=b);child.on('close',code=>resolve({code,error}));});
  const attempts=await Promise.all([call(),call()]);
  assert.deepEqual(attempts.map(a=>a.code).sort(),[0,1],JSON.stringify(attempts));
  assert.equal(fs.readdirSync(f.run).filter(n=>/^hd-\d+-1-claim\.json$/.test(n)).length,6);
});

test('V3.1: user composite revision replaces sample and copy, invalidates old approval',()=>{
  const f=sample(), old=previewHD(f.run);approveHD(f.run,hdResponse(old));
  assert.throws(()=>claimCompositeRevision(f.run,{user_request:{role:'assistant',message:'modify',message_id:'x'}},cap),/Actual user/);
  const request=userEdit();request.panels=structuredClone(f.b.panels);request.panels[1].title='Revised Sample Title';request.fact_review='MOCK fact-supported revision';
  request.panel_sources=f.b.panels.map(p=>({index:p.index,source_ids:p.source_ids,angle_evidence:p.angle_evidence}));
  request.panel_sources[1]={index:2,source_ids:['P2'],angle_evidence:{source_ids:['P2'],limits:'Only the supplied side view'}};
  const claim=claimCompositeRevision(f.run,request,cap);assert.equal(claim.revision,1);assert.equal(claim.tool_arguments.referenced_image_paths[0],old.image_path);
  assert.throws(()=>splitHD(f.run),/pending/);assert.throws(()=>claimCompositeRevision(f.run,request,cap),/pending/);
  const saved=saveCompositeRevision(f.run,1,path.join(temp,'output.png'),'MOCK-edited-composite');
  assert.ok(fs.existsSync(old.image_path));assert.notEqual(saved.image_path,old.image_path);
  assert.throws(()=>approveHD(f.run,hdResponse(old)),/version/);
  const next=previewHD(f.run);assert.equal(next.version,old.version+1);assert.equal(next.image_path,saved.image_path);
  assert.throws(()=>approveHD(f.run,{...hdResponse(next),message_id:request.user_request.message_id}),/new user response/);
  approveHD(f.run,{...hdResponse(next),message_id:'MOCK-accept-new-sample'});splitHD(f.run);
  const hd=claimHD(f.run,2,cap);assert.ok(hd.tool_arguments.prompt.includes('Revised Sample Title'));
  assert.deepEqual(hd.tool_arguments.referenced_image_paths.slice(1).map(p=>path.basename(p)),['P2.png']);
  assert.throws(()=>claimCompositeRevision(f.run,userEdit('new'),cap),/already started/);
});

test('V3.1: failed composite modification retains old result and never reuses a request',()=>{
  const f=sample(), old=previewHD(f.run);const request=userEdit();claimCompositeRevision(f.run,request,cap);
  failCompositeRevision(f.run,1,{reason:'MOCK failed',host_evidence:'MOCK',definitive:true});
  const next=previewHD(f.run);assert.equal(next.image_path,old.image_path);assert.notEqual(next.digest,old.digest);
  assert.throws(()=>claimCompositeRevision(f.run,request,cap),/already submitted/);
  const retry=claimCompositeRevision(f.run,userEdit('MOCK-new-modification'),cap);assert.equal(retry.revision,2);
  assert.throws(()=>currentComposite(f.run),/pending/);
});

test('V3.1: removed QA commands cannot silently reintroduce a visual-review gate',()=>{
  const f=sample();for(const command of ['qa','hd-qa']){
    const result=spawnSync(process.execPath,[path.join(root,'scripts/cli.mjs'),command,'--run',f.run],{encoding:'utf8',timeout:15000});
    assert.equal(result.status,1);assert.ok(!fs.existsSync(path.join(f.run,'composite-qa.json')));
  }
});


test('V3.3 share: generic host completes claimed composite, revision and six HD outputs',()=>{
  const portable = {adapter:'host-tool-v1',host:'mock-agent',tool:'mock_edit_images',available:true,configured:true,reference_image_editing:true,explicit_image_binding:true,schema_evidence:'MOCK schema',image_input:'paths',supported_fields:['text','images','model'],fields:{prompt:'text',images:'images',model:'model'},selection:{model:'mock-quality',evidence:'MOCK comparison'},max_reference_images:4,max_concurrency:2};
  const f=fixture(); compile(f);
  const claim=claimGeneration(f.run,portable);
  const first=mapToolCall(claim,portable);
  assert.equal(first.tool,'mock_edit_images'); assert.equal(first.arguments.model,'mock-quality');
  assert.equal(first.arguments.images.length,3);
  const generated=saveResult(f.run,path.join(temp,'grid.png'),'MOCK generic composite');
  assert.equal(generated.host,'mock-agent'); assert.equal(generated.model,'mock-quality');
  const edit=claimCompositeRevision(f.run,userEdit('MOCK-generic-revision'),portable);
  assert.equal(mapToolCall(edit,portable).arguments.images.length,4);
  saveCompositeRevision(f.run,edit.revision,path.join(temp,'output.png'),'MOCK generic revision');
  hdStart(f); const batch=claimHDBatch(f.run,portable);
  assert.equal(batch.max_concurrency,2);
  for(const job of batch.jobs) {
    const call=mapToolCall(job,portable);
    assert.equal(call.arguments.images.length,2);
    assert.equal(call.arguments.model,'mock-quality');
    savePanel(f,job.index);
  }
  const result=finishHD(f.run); assert.equal(result.status,'complete');
  assert.equal(result.panels.length,6);
  assert.ok(result.panels.every(p=>p.result.host==='mock-agent' && p.result.model==='mock-quality'));
  assert.throws(()=>claimHDBatch(f.run,portable),/Batch already started/);
});
