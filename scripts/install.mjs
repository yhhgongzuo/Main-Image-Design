#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runPython, pythonCommand } from './python-runtime.mjs';
import { verifyBundle } from './bundle-integrity.mjs';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ID = 'ahui-main-image-design';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const need = (v, m) => { if (!v) throw new Error(m); };
const args = process.argv.slice(2), options = {};
try {
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    need(['--host','--target','--check','--replace','--install-deps'].includes(k), `Unknown option ${k}`);
    need(!Object.hasOwn(options,k), `Duplicate option ${k}`);
    options[k] = ['--host','--target'].includes(k) ? args[++i] : true;
    need(options[k] && !String(options[k]).startsWith('--'), `Missing value ${k}`);
  }
  need(Number(process.versions.node.split('.')[0]) >= 20, '需要 Node.js 20 或以上。');
  const host = options['--host'] || ((process.env.CODEX_HOME || process.env.CODEX_THREAD_ID) ? 'codex' : 'unknown');
  need(typeof host === 'string' && host.trim() && host.length <= 120 && !/[\r\n\0]/.test(host), '请填写当前宿主名称。');
  let python = null, pillow = false;
  try { python = pythonCommand(); pillow = runPython(['-c','from PIL import Image; print(Image.__version__)']).status === 0; } catch {}
  if (options['--check']) {
    console.log(JSON.stringify({ host, node: process.versions.node, python, pillow,
      local_runtime_ready: Boolean(python && pillow), image_generation_checked: false,
      note: '这里只检查本地环境；生图工具须由当前 AI 检查。' }, null, 2));
  } else {
    need(host !== 'unknown' || options['--target'], '请由当前 AI 确认平台，使用 --host codex 或指定平台实际技能目录 --target。');
    let target = options['--target'];
    if (!target && host === 'codex') {
      const base = process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME,'skills') :
        fs.existsSync(path.join(os.homedir(),'.codex','skills',ID)) ? path.join(os.homedir(),'.codex','skills') : path.join(os.homedir(),'.agents','skills');
      target = path.join(base, ID);
    }
    need(target, '请使用当前平台的技能导入入口，或由宿主确认真实安装目录后传入 --target；不会按平台名称猜目录。');
    need(path.isAbsolute(target), '--target 必须是完整的技能目录绝对路径。');
    target = path.resolve(target);
    need(target !== path.parse(target).root, '不能将磁盘根目录作为技能目录。');
    const { manifest } = verifyBundle(source);
    const entries = Object.entries(manifest.files);
    for (const [rel, expected] of entries) {
      need(!path.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..'), 'Invalid bundle path');
      const file = path.join(source,rel);
      need(fs.lstatSync(file).isFile() && digest(file) === expected, `分享包文件不完整或已变更：${rel}`);
    }
    let backup = null;
    if (target !== source) {
      const parent = path.dirname(target);
      fs.mkdirSync(parent,{recursive:true});
      need(!fs.existsSync(target) || !fs.lstatSync(target).isSymbolicLink(), '目标是链接，请使用实际目录。');
      if (fs.existsSync(target) && fs.readdirSync(target).length) {
        const entry = path.join(target,'SKILL.md');
        need(fs.existsSync(entry) && /^name:\s*["']?ahui-main-image-design["']?\s*$/m.test(fs.readFileSync(entry,'utf8')),
          '目标已有其他内容，请使用当前 Skill 的独立安装目录，不能覆盖其他技能。');
      }
      const same = fs.existsSync(target) && entries.every(([rel, hash]) => fs.existsSync(path.join(target,rel)) && digest(path.join(target,rel)) === hash);
      if (fs.existsSync(target) && !same) {
        need(options['--replace'], '已有不同版本。升级时加 --replace，安装器会保留旧版备份。');
        const backupRoot = path.resolve(parent,'..','.ahui-skill-backups');
        backup = path.join(backupRoot,`${ID}-${Date.now()}`);
        need(path.dirname(backup) === backupRoot && backupRoot !== target && !backupRoot.startsWith(target + path.sep), 'Invalid resolved backup path');
        fs.mkdirSync(backupRoot,{recursive:true});
        fs.renameSync(target,backup);
      }
      if (!same) {
        fs.mkdirSync(target,{recursive:true});
        for (const rel of [...entries.map(([rel])=>rel), 'bundle-manifest.json','release-manifest.json']) {
          fs.mkdirSync(path.dirname(path.join(target,rel)),{recursive:true});
          fs.copyFileSync(path.join(source,rel),path.join(target,rel));
        }
      }
    }
    const before = spawnSync(process.execPath,[path.join(target,'scripts/install.mjs'),'--check','--host',host], {encoding:'utf8',timeout:60000,windowsHide:true});
    need(before.status === 0, before.stderr);
    pillow = JSON.parse(before.stdout).pillow;
    if (options['--install-deps'] && !pillow) {
      need(python, '技能文件已放好；请安装 Python 3.9 或以上后再次运行安装器。');
      const runtime = path.join(target,'.runtime');
      need(!fs.existsSync(runtime), '已有独立运行环境，请由 AI 检查其中的 Python/Pillow，不覆盖。');
      const venv = runPython(['-m','venv',runtime]);
      need(venv.status === 0, `独立运行环境创建失败：${venv.stderr}`);
      const executable = path.join(runtime,process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const pip = spawnSync(executable,['-m','pip','install','Pillow>=10,<13'], {encoding:'utf8',timeout:180000,windowsHide:true});
      need(pip.status === 0, `技能文件已放好，但图片处理依赖安装失败：${pip.stderr}`);
    }
    // Check in the installed context, including its isolated runtime.
    const check = spawnSync(process.execPath,[path.join(target,'scripts/install.mjs'),'--check','--host',host], {encoding:'utf8',timeout:60000,windowsHide:true});
    need(check.status === 0, check.stderr);
    const result = JSON.parse(check.stdout);
    const advice = host === 'codex' ? '建议选择 GPT-6.1 Sol，把思考模式设为高。' : '建议开启本平台的高思考或深度思考模式（如有）。';
    console.log(JSON.stringify({ status: 'installed', target, backup, version: manifest.version,
      local_runtime_ready: result.local_runtime_ready, image_generation_checked: false,
      message: `阿辉的主图设计已安装${result.local_runtime_ready ? '好' : '，还需要补齐 Python/Pillow'}！${advice}新开一个聊天，上传同一款产品的多张不同角度照片，再说“用阿辉的主图设计”。一开始只传产品图就行，我会带你补资料、选风格、确认文案，再制作图片。`,
      next: '宿主核实生图能力后再报告能否完整出图；本安装器没有修改模型或全局配置。' }, null, 2));
  }
} catch (error) { console.error(JSON.stringify({status:'needs_attention',message:error.message})); process.exitCode = 1; }
