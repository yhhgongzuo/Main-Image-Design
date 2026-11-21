import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, need, hash } from './workflow.mjs';
import { windowTasks, writeHDOnce } from './hd-workflow.mjs';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const marker = (run, job, suffix) => path.join(run, `hd-${job.index}-${job.attempt}-${suffix}.json`);
const optional = file => fs.existsSync(file) ? read(file) : null;

export function windowStatus(run) {
  const { jobs, limit } = windowTasks(run);
  const panels = jobs.map(job => {
    const { index } = job;
    const result = optional(marker(run, job, 'result'));
    const review = optional(marker(run, job, 'review'));
    const failure = optional(marker(run, job, 'failure'));
    const thread = optional(marker(run, job, 'thread'));
    const reservation = optional(marker(run, job, 'dispatch'));
    const dispatch = reservation && { title: reservation.title, display_title: reservation.display_title, reserved_at: reservation.reserved_at };
    const started = optional(marker(run, job, 'started'));
    let state = 'ready';
    if (dispatch) state = 'locate_thread';
    if (thread) state = 'waiting';
    if (started) state = 'running';
    if (failure) state = failure.definitive ? 'failed' : 'unknown';
    if (result) state = job.delivery_mode === 'first_result' ? 'saved' : review?.verdict || 'needs_review';
    return { index, attempt: job.attempt, state, mode: job.hd_plan.mode, thread, dispatch, started,
      task_path: marker(run, job, 'claim'), image_path: result?.path, reason: failure?.reason,
      saved_at: result && fs.statSync(marker(run, job, 'result')).mtime.toISOString(),
      reviewed_at: review && fs.statSync(marker(run, job, 'review')).mtime.toISOString() };
  });
  need(Number.isInteger(limit) && limit > 0, 'Invalid window limit');
  const active = panels.filter(p => ['locate_thread', 'waiting', 'running', 'unknown'].includes(p.state)).length;
  return { window_slots: Math.max(0, Math.min(limit, panels.length) - active), panels };
}

export function reserveWindow(run, index, attempt) {
  const { window_slots, panels } = windowStatus(run);
  const panel = panels.find(p => p.index === index && p.attempt === attempt);
  need(panel?.state === 'ready' && window_slots > 0, 'Panel already dispatched, unavailable, or window limit reached');
  const [job] = windowTasks(run, index, attempt).jobs;
  const label = job.panel_label || '商品图';
  const displayTitle = `高清子任务 ${String(index).padStart(2, '0')}｜${label}`;
  const title = `${displayTitle} · ${path.basename(run).slice(-8)} · ${attempt}`;
  const taskArgs = `--run "${run}" --index ${index} --attempt ${attempt}`;
  const local = ['scale', 'white_source'].includes(panel.mode);
  const execution = local ? [
    `本格使用 ${panel.mode}。直接执行 node "${cli}" hd-render ${taskArgs}，由脚本生成并登记图片。无需调用生图工具。`,
    '中断后先读取 hd-worker-start 的开工记录和本格结果；结果尚未登记时，在原执行对话用同一任务继续 hd-render。'
  ] : [
    '使用任务声明的工具和 tool_arguments 生成一次。保留完整提示词、参考附件顺序和真实返回文件。若已开工，查询原调用。',
    '优先保存工具实际返回且明确指向本次的本地文件路径。有 output_hint 时按其中的确切路径取回，避免扫描目录。只有 data URL 时，将原响应保存为仅含 image_url 的 JSON；不要把图片数据写入聊天。',
    `用 hd-save ${taskArgs} 加 --image 原图路径 或 --response 响应文件路径，并传 --host-evidence 真实调用依据。若保存中断，恢复同一返回。明确失败用 hd-fail 登记，结果未知继续查原调用。`
  ];
  const prompt = [
    `你负责第 ${index} 张高清图，第 ${attempt} 次任务。只执行这份已领取的任务：${panel.task_path}`,
    `原 run 绝对路径：${run}。CLI 绝对路径：${cli}。所有数据写回此 run。`,
    '读取单项 JSON，按原路径使用附件。缺少材料或工具时在本聊天报告具体阻碍。',
    `执行前用 node "${cli}" hd-worker-start ${taskArgs}，检查任务版本及参考图。已有开工记录时恢复本窗口的原任务。`,
    ...execution,
    job.delivery_mode === 'first_result'
      ? '首个成功返回的原文件就是本格成品。直接保存实际尺寸。最终回复编号、路径和尺寸，或实际失败原因。用户负责审图。'
      : '在本聊天最终回复编号、尝试号和实际保存路径或具体状态。主对话负责旧任务的交付。'
  ].join('\n');
  const reservation = { title, display_title: displayTitle, reserved_at: new Date().toISOString() };
  writeHDOnce(marker(run, panel, 'dispatch'), { ...reservation, prompt });
  return { ...reservation, prompt };
}

export function bindWindow(run, index, attempt, hostId, threadId, origin) {
  need(origin === undefined || origin === 'create_thread', 'Invalid window binding origin');
  const [job] = windowTasks(run, index, attempt).jobs;
  need(optional(marker(run, job, 'dispatch')) && hostId?.trim() && threadId?.trim(), 'Need reservation and actual hostId/threadId');
  const dest = marker(run, job, 'thread');
  const prior = optional(dest);
  if (prior) {
    need(prior.hostId === hostId && prior.threadId === threadId, 'Panel belongs to another thread');
    return prior;
  }
  for (const name of fs.readdirSync(run).filter(n => /^hd-[1-6]-\d+-thread\.json$/.test(n))) {
    const other = read(path.join(run, name));
    need(other.threadId !== threadId || other.hostId !== hostId, 'Thread already assigned to a panel');
  }
  const thread = { hostId, threadId };
  // Only a binding from this run's creation receipt is eligible for automatic archiving.
  if (origin === 'create_thread') thread.created_for_run = path.basename(run);
  writeHDOnce(dest, thread);
  return thread;
}

export function startWindow(run, index, attempt) {
  const [job] = windowTasks(run, index, attempt).jobs;
  need(optional(marker(run, job, 'dispatch')), 'Expected a reserved HD panel task');
  need(!optional(marker(run, job, 'result')) && !optional(marker(run, job, 'failure')), 'Recover the existing result or failure');
  need(job.tool_arguments.referenced_image_paths.every((p, i) => hash(fs.readFileSync(p)) === job.reference_hashes[i]), 'Claimed reference changed');
  const started = { started_at: new Date().toISOString() };
  writeHDOnce(marker(run, job, 'started'), started);
  return started;
}
