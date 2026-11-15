#!/usr/bin/env node
import fs from 'node:fs';

// Read an existing task only. This never claims a task or submits generation.
try {
  const [file, ...extra] = process.argv.slice(2);
  if (!file || extra.length) throw Error('Usage: read-task.mjs absolute-task-json');
  const task = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (task.arguments && typeof task.arguments === 'object') {
    console.log(JSON.stringify({ tool: task.tool, arguments: task.arguments }));
  } else {
    if (!task.tool_arguments || typeof task.tool_arguments.prompt !== 'string' || !Array.isArray(task.tool_arguments.referenced_image_paths)) throw Error('Use the single task_path, not a batch receipt');
    console.log(JSON.stringify({ tool: task.tool, index: task.index, attempt: task.attempt, tool_arguments: task.tool_arguments }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
