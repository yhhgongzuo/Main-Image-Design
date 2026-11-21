import fs from 'node:fs';
import path from 'node:path';
import { need, hash, read } from './workflow.mjs';

export function panelPlan(spec, request) {
  const mode = request ? 'targeted_edit' : 'upscale';
  if (!spec) return { mode };
  need(spec.mode === mode, 'Initial HD uses upscale; requested repair uses targeted_edit');
  for (const key of ['layout', 'geometry', 'change']) {
    if (spec[key] != null) need(typeof spec[key] === 'string' && spec[key].trim(), 'Invalid HD plan field: ' + key);
  }
  if (spec.source_ids != null) {
    need(Array.isArray(spec.source_ids) && spec.source_ids.every(id => typeof id === 'string' && id.trim()) &&
      new Set(spec.source_ids).size === spec.source_ids.length, 'List matching source IDs in priority order');
  }
  if (request) need(typeof spec.change === 'string' && spec.change.trim(), 'Describe the specific requested edit');
  else need(spec.change == null, 'Initial HD only enhances the approved crop');
  return spec;
}

// HD may need another view of the same registered SKU that was outside the composite budget.
export function productAttachments(run, market, product, ids, selected, handoff) {
  return ids.map(id => {
    const source = product.sources.find(s => s.id === id && s.membership === 'main_product' && s.product_id === product.product_id);
    const asset = market.products.find(s => s.id === id);
    need(source && asset, 'HD reference must belong to the registered main product: ' + id);
    const pos = selected.findIndex(s => s.id === id);
    if (pos >= 0) return handoff.tool_arguments.referenced_image_paths[pos];
    const preparedFile = path.join(run, 'prepared-references.json');
    const item = (fs.existsSync(preparedFile) && read(preparedFile).find(s => s.id === id)) || asset;
    need((item.original_sha256 || item.sha256) === asset.sha256, 'HD reference provenance changed');
    const file = fs.realpathSync(path.resolve(run, item.path));
    const relative = path.relative(fs.realpathSync(path.join(run, item.original_sha256 ? 'prepared-products' : 'products')), file);
    need(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'HD reference outside product snapshots');
    need(hash(fs.readFileSync(file)) === item.sha256 && !(market.styles || (market.style ? [market.style] : [])).some(s => s.sha256 === item.sha256 || s.pixel_sha256 === item.pixel_sha256), 'Changed or non-product reference');
    return file;
  });
}
