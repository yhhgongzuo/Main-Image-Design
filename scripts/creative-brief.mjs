import { languageName } from './copy-language.mjs';
import { panelDirection } from './creative-direction.mjs';

// Detailed analysis stays in the run; only these semantic summaries reach imagegen.
export function buildPrompt(p, lock, b, platform = 'Amazon US', locale = 'en-US') {
  const identity = [...new Set([p.identity_summary, ...p.identity_lock.must_preserve, ...p.identity_lock.geometry_constraints, ...p.identity_lock.forbidden_changes])].join('；');
  const used = new Set(b.panels.flatMap(x => x.fact_ids));
  const facts = p.facts.filter(x => used.has(x.id)).map(x => x.statement).join('；');
  const boundaries = [...new Set(b.panels.map(x => x.angle_evidence.limits))].join('；');
  return `【商品与目标】\n为${p.name}设计六张高质量${platform}电商主图，面向${b.audience}，图片文案语言：${languageName(locale)}（${locale}）：1张白底首图加5张副图，回答不同购买问题。${identity}。事实：${facts}。\n\n` +
    `【整体视觉风格】\n${lock.creative_summary}\n采用的设计语言：${lock.transferable.join("；")}。执行标准：${lock.set_rules.join("；")}。不迁移：${lock.do_not_copy.join("；")}。\n\n` +
    `【六张内容与确定文案】\n从左到右、从上到下：\n` +
    b.panels.map(x => `${x.index}. ${x.purpose}：${x.objective}；主标题「${x.title}」${x.subtitle ? `；副标题「${x.subtitle}」` : ''}${x.extra_copy.length ? `；其他上图文字${x.extra_copy.map(t => `「${t}」`).join('、')}` : ''}；${panelDirection(x)}。`).join('\n') +
    `\n仅逐字渲染已确认的标题、副标题与其他上图文字，不添加或改写；仅供理解的释义不上图；文案按指定语言的阅读方向与语义断行，保留真实商品标识。${b.platform_rules.first_panel_white_background ? '首格RGB纯白背景，商品完整不裁切、约占画面85%，只呈现所售商品及已确认包含物，不叠加标题、徽章、边框或营销图形。' : ''}\n\n` +
    `【专业创意设计】\n将六张作为完整商业作品：在已确认的角度、关键构图和排版策略内，自主设计主体大小、文字层级、场景、留白、光影与必要装饰。让画面表达卖点，六张构图丰富、疏密强弱有节奏；统一品牌语言，允许统一标题区域和标注样式；先安排第一眼重点、第二眼信息与文字留白，按语义断行，删去无任务的装饰；各材质保留真实反射与纹理区别，商品和环境光线相容，人物接触、比例与受力可信，不用过度磨皮、统一高光或全景散景代替摄影；场景和动作必须直接说明用途与买家利益，环境清晰可辨但产品仍醒目；避免连续相似直立摆拍或局部特写，不用换背景替代内容变化，不重复购买信息或空泛口号。\n\n` +
    `【基础硬性约束】\n一次只生成一张2:3竖版合集，两列三行、六格独立1:1正方形，边界整齐、元素不跨格，便于后期切分。以产品附件为真实依据，保持结构、比例、颜色、标识、材质及配件；${boundaries}。不虚构功能性能或添加未确认宣传；场景、尺度、配件和动作也不能暗示未经确认的能力。商品事实和已确认文案优先。不得复制风格参考中的商品，不添加水印或无意义标记。\n`;
}
