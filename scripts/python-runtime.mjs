import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let cached;
export function pythonCommand() {
  if (cached) return cached;
  const local = path.join(root, '.runtime', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const choices = process.env.AHUI_PYTHON ? [[process.env.AHUI_PYTHON, []]] :
    [...(fs.existsSync(local) ? [[local, []]] : []), ['python3', []], ['python', []], ...(process.platform === 'win32' ? [['py', ['-3']]] : [])];
  for (const [command, args] of choices) {
    const probe = spawnSync(command, [...args, '-c', 'import sys; assert sys.version_info >= (3, 9)'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    if (probe.status === 0) return cached = { command, args };
  }
  throw new Error('需要 Python 3.9 或以上；安装后重试，也可用 AHUI_PYTHON 指定解释器路径。');
}
export function runPython(args, options = {}) {
  const found = pythonCommand();
  return spawnSync(found.command, [...found.args, ...args], {
    encoding: 'utf8', timeout: 120000, windowsHide: true, ...options,
    env: { ...process.env, ...options.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
}
