import fs from 'node:fs';
import crypto from 'node:crypto';

const nativeNames = ['image_gen', 'imagegen', 'image_gen__imagegen'];
const need = (value, message) => { if (!value) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;

// Capabilities are supplied by the host after inspecting its real tools, never by product data.
export function validateCapability(cap) {
  need(cap?.available === true && text(cap.tool), '没有可用的生图工具，请先连接本平台的图片生成工具。');
  if (cap.adapter == null) {
    need(nativeNames.includes(cap.tool) && cap.explicit_image_paths === true, 'Only native imagegen is allowed without a verified host adapter');
  } else {
    need(cap.adapter === 'host-tool-v1' && text(cap.host) && cap.configured === true &&
      cap.reference_image_editing === true && cap.explicit_image_binding === true && text(cap.schema_evidence),
      '需要已配置、支持参考图编辑和明确附件绑定的真实工具；不能仅凭平台名称判断。');
    need(['paths', 'file_ids', 'urls'].includes(cap.image_input), 'Unsupported attachment transport');
    need(Array.isArray(cap.supported_fields) && cap.supported_fields.every(text), 'List actual schema fields');
    need(text(cap.fields?.prompt) && text(cap.fields?.images) && cap.fields.prompt !== cap.fields.images, 'Map prompt and image fields');
    const mapped = Object.values(cap.fields);
    need(mapped.every(k => text(k) && cap.supported_fields.includes(k) && !['__proto__','constructor','prototype'].includes(k)) && new Set(mapped).size === mapped.length,
      'Field map must use unique actual tool fields');
    need(Object.keys(cap.fields).every(k => ['prompt','images','model','quality','size','ratio','transparent_background'].includes(k)), 'Unknown normalized field');
    for (const k of ['model','quality','size','ratio']) if (cap.selection?.[k] != null) {
      need(text(cap.selection[k]) && cap.fields[k] && text(cap.selection.evidence), 'Selected settings need supported fields and evidence');
    }
    if (cap.task_settings != null) {
      need(typeof cap.task_settings === 'object' && !Array.isArray(cap.task_settings), 'task_settings must describe composite, hd or patch settings');
      for (const [role, settings] of Object.entries(cap.task_settings)) {
        need(['composite', 'hd', 'patch'].includes(role) && settings && typeof settings === 'object', 'Unknown task settings role');
        for (const [key, value] of Object.entries(settings)) need(['size', 'ratio'].includes(key) && text(value) && cap.fields[key] && text(cap.selection?.evidence || cap.schema_evidence), 'Task geometry needs actual supported fields and evidence');
      }
    }
    if (cap.extra_arguments != null) {
      need(typeof cap.extra_arguments === 'object' && !Array.isArray(cap.extra_arguments), 'extra_arguments must be an object');
      need(Object.keys(cap.extra_arguments).every(k => cap.supported_fields.includes(k) && !mapped.includes(k) && !['__proto__','constructor','prototype'].includes(k)), 'Extra arguments must not override mapped fields');
    }
  }
  for (const k of ['max_reference_images','max_concurrency']) if (cap[k] != null)
    need(Number.isInteger(cap[k]) && cap[k] >= 1, `${k} must be a positive integer`);
  return cap;
}

export function mapToolCall(job, capability, bindings = {}) {
  if (['scale','white_source'].includes(job.hd_plan?.mode)) throw new Error('Local HD job: run hd-render');
  const cap = validateCapability(capability), args = job.tool_arguments;
  need(args && text(args.prompt) && Array.isArray(args.referenced_image_paths) && args.referenced_image_paths.length, 'Expected claimed generation job');
  if (cap.max_reference_images != null) need(args.referenced_image_paths.length <= cap.max_reference_images, 'Reference image limit exceeded');
  if (cap.adapter == null) return { tool: cap.tool, arguments: args };
  const images = args.referenced_image_paths.map(file => {
    need(fs.existsSync(file), 'Reference file missing');
    if (cap.image_input === 'paths') return file;
    const bound = bindings[file];
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    need(bound && bound.sha256 === digest && text(bound.value) && text(bound.upload_evidence), 'Upload binding must match exact reference bytes and real upload result');
    if (cap.image_input === 'urls') need(/^https:\/\//.test(bound.value), 'Use a host-authorized HTTPS attachment URL');
    return bound.value;
  });
  const output = { ...(cap.extra_arguments || {}), [cap.fields.prompt]: args.prompt, [cap.fields.images]: images };
  if (cap.fields.transparent_background) output[cap.fields.transparent_background] = false;
  const role = job.task_role || (job.canvas_ratio === '1:1' ? 'hd' : 'composite');
  const settings = { ...cap.selection, ...(cap.task_settings?.[role] || (role === 'patch' ? cap.task_settings?.hd : {}) || {}) };
  if (job.canvas_ratio) {
    if (cap.fields.ratio) settings.ratio = job.canvas_ratio;
    for (const name of ['ratio', 'aspect_ratio', 'aspectRatio']) if (Object.hasOwn(cap.extra_arguments || {}, name)) output[name] = job.canvas_ratio;
    const size = settings.size?.match(/^(\d+)x(\d+)$/i);
    if (size) {
      const [width, height] = job.canvas_ratio.split(':').map(Number);
      need(Number(size[1]) * height === Number(size[2]) * width, 'Selected size conflicts with this task; provide a documented task_settings size for composite or hd');
    }
    for (const name of ['size', 'width', 'height']) if (Object.hasOwn(cap.extra_arguments || {}, name))
      need(!['width', 'height'].includes(name) && !/^\d+x\d+$/i.test(String(cap.extra_arguments[name])), 'Move explicit geometry out of extra_arguments into supported per-task size/ratio fields');
  }
  for (const k of ['model','quality','size','ratio']) if (settings[k] != null) output[cap.fields[k]] = settings[k];
  return { tool: cap.tool, arguments: output };
}

// Rankings come from the host's documented comparison of currently available models.
export function chooseImageModel(candidates) {
  const usable = candidates.filter(c => c.available === true && c.configured === true && c.reference_image_editing === true &&
    c.explicit_image_binding === true && text(c.id) && text(c.evidence));
  need(usable.length, '没有已配置且支持参考图编辑的生图模型。');
  if (usable.length === 1) return usable[0];
  need(usable.every(c => Number.isFinite(c.quality_rank)), '多个模型缺少可靠质量比较；请由宿主核实后选择，不能按名字猜。');
  return [...usable].sort((a,b) => b.quality_rank - a.quality_rank)[0];
}
