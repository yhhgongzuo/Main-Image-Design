import { languageName } from './copy-language.mjs';
import { domesticSetPolicy } from './market-profile.mjs';
import { productIdentityText } from './creative-direction.mjs';

const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];

// Keep selected reference features and exact copy; omit repeated analysis.
export function buildDomesticPrompt(product, style, blueprint, platform, locale, market) {
  const used = new Set(blueprint.panels.flatMap(panel => panel.fact_ids));
  const facts = product.facts.filter(fact => used.has(fact.id) && fact.source !== 'generic').map(fact => fact.statement);
  const identity = productIdentityText(product);
  const limits = unique(blueprint.panels.map(panel => panel.angle_evidence.limits));
  const panels = blueprint.panels.map(panel => {
    const copy = { 主标题: panel.title, 副标题: panel.subtitle, 辅助文案: panel.extra_copy };
    return `${panel.index}. ${panel.purpose}\n` +
      `画面：${unique([panel.presentation, panel.composition]).join('；')}。角度：${panel.angle}。\n` +
      `排版：${panel.typography}。\n` +
      `材质与光线：${panel.lighting_materials}。空间与动作：${panel.scene_physics}。\n` +
      `全部上图文字：${JSON.stringify(copy)}`;
  }).join('\n\n');
  return `【任务】\n为${product.name}制作六张${platform}商品图。一次输出一张2:3竖版合集，2列3行、从左到右从上到下；六格为等分1:1正方形，无外边距、元素不跨格。六格紧密拼接，不添加白色留缝或分隔描线；单格内部有意设计的边框、留白和白底背景保留，不扩展成合集分隔框。语言：${languageName(locale)}（${locale}）。\n\n` +
    `【产品依据】\n${identity}。${facts.length ? `本品资料：${unique(facts).join('；')}。` : ''}${limits.length ? `展示边界：${limits.join('；')}。` : ''}\n\n` +
    `【参考风格与图片角色】\n${domesticSetPolicy(market, blueprint, style)}\n\n` +
    `【逐图画面与完整文案】\n${panels}\n\n` +
    `【执行边界】\n只有“全部上图文字”是新增文字，逐字完整渲染，不改写、漏小字或临场添加宣传。产品附件锁定结构、比例、颜色、标识和材质；风格特征及逐图画面锁定视觉方向，允许局部对齐与合理断行。\n` +
    `按各图具体要求处理材质、光源、接触与遮挡；人物出现时保留自然肤色、发丝及衣物细节。摄影商品可与已选参考的图形或特效背景组合，明确实景与独立放大特写的关系。只执行有依据的场景与动作，不虚构功效、参数、配件、价格、认证或权益，不加水印。\n`;
}
