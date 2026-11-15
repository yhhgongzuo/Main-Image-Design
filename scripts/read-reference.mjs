#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try {
  const [relative, startText = '0', countText = '3000', ...extra] = process.argv.slice(2);
  const start = Number(startText), count = Number(countText);
  if (!relative || extra.length || !Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || count > 6000) throw Error('Usage: read-reference.mjs relative-file [start-character=0] [max-characters=3000, at most 6000]');
  const target = fs.realpathSync(path.resolve(root, relative));
  const within = path.relative(fs.realpathSync(root), target);
  if (!within || within.startsWith('..') || path.isAbsolute(within) || !/\.(?:md|txt)$/i.test(target)) throw Error('Read a Markdown/text instruction file inside this skill');
  const content = fs.readFileSync(target, 'utf8');
  if (start > content.length) throw Error('Start is past the file end');
  const end = Math.min(content.length, start + count);
  console.log(JSON.stringify({ file: relative, total_characters: content.length, start, end, next_start: end < content.length ? end : null, complete: end === content.length }));
  console.log(content.slice(start, end));
  console.log(`END_OF_CHUNK ${relative} ${end}/${content.length}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
