// Platform is supplied from the real conversation, never inferred from chat language.
const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim();
const profiles = [
  ['Amazon US', 'amazon.com', ['amazon', 'amazon us', 'amazon.com', '亚马逊', '亚马逊美国站', '美国站']],
  ['淘宝', 'taobao', ['淘宝', '淘宝网', 'taobao', 'taobao.com']],
  ['天猫', 'tmall', ['天猫', 'tmall', 'tmall.com']],
  ['天猫国际', 'tmall-global', ['天猫国际', 'tmall global', 'tmall-global']],
  ['京东', 'jd', ['京东', '京东自营', 'jd', 'jd.com']],
  ['京东国际', 'jd-global', ['京东国际', 'jd global', 'jd-global']],
  ['拼多多', 'pinduoduo', ['拼多多', 'pdd', 'pinduoduo']],
  ['抖音电商', 'douyin', ['抖音', '抖店', '抖音商城', '抖音电商', 'douyin']],
  ['快手电商', 'kuaishou', ['快手', '快手小店', '快手电商', 'kuaishou']],
  ['小红书电商', 'xiaohongshu', ['小红书', '小红书电商', '小红书店铺', 'xiaohongshu']],
  ['1688', '1688', ['1688', '1688.com', '阿里巴巴1688']],
  ['微信小店', 'weixin-shop', ['微信小店', '视频号小店', '视频号', 'weixin-shop']],
  ['国内电商通用', 'domestic-generic', ['国内电商通用', '国内通用', 'domestic-generic']],
];
function lookup(value) {
  need(text(value), '请在第一轮补资料中询问：这些图片准备发布／上架到哪个平台？');
  const found = profiles.find(([, , aliases]) => aliases.includes(value.trim().toLowerCase()));
  need(found, `尚未支持的平台「${value}」：请明确实际平台；不要把其他海外平台自动当成亚马逊。国内自定义平台可显式使用 domestic 分支并记录依据。`);
  return { platform: found[0], marketplace: found[1], design_profile: found[1] === 'amazon.com' ? 'amazon_us' : 'domestic' };
}
export function resolvePlatform(input) {
  const value = input.platform || input.marketplace;
  let profile;
  try { profile = lookup(value); }
  catch (error) {
    // A new domestic destination requires the host's explicit, reviewable classification.
    if (text(value) && input.design_profile === 'domestic' && text(input.platform_basis) && !/amazon|亚马逊|temu|tiktok|shopee|lazada|ebay|etsy|walmart|速卖通|aliexpress/i.test(value)) {
      profile = { platform: value.trim(), marketplace: input.marketplace || value.trim(), design_profile: 'domestic' };
    } else throw error;
  }
  if (input.design_profile) need(input.design_profile === profile.design_profile, 'Platform and design_profile conflict');
  if (input.marketplace && profiles.some(([, , aliases]) => aliases.includes(input.marketplace.trim().toLowerCase())))
    need(lookup(input.marketplace).marketplace === profile.marketplace, 'platform and marketplace conflict');
  else if (input.marketplace) need(input.marketplace === profile.marketplace, 'platform and marketplace conflict');
  return { ...profile, platform_basis: input.platform_basis || `用户明确的上架平台：${value}` };
}
export const isDomestic = m => m.design_profile === 'domestic';
export const VISUAL_SYSTEM_FIELDS = ['colors', 'typography', 'components', 'spacing', 'photography'];
export function validateDomesticStyle(style) {
  for (const key of VISUAL_SYSTEM_FIELDS) need(text(style.visual_system?.[key]), `Domestic visual_system.${key} required`);
}
export function visualSystemText(style) {
  const names = ['配色角色', '字体与字号档位', '组件与底栏', '边距与间距', '摄影与材质'];
  return VISUAL_SYSTEM_FIELDS.map((key, i) => `${names[i]}：${style.visual_system[key]}`).join('；');
}
export function whitePanels(m, blueprint) {
  if (!isDomestic(m)) return [1];
  const indices = blueprint.platform_rules?.white_product_panels;
  need(Array.isArray(indices) && indices.every(i => Number.isInteger(i) && i >= 1 && i <= 6) && new Set(indices).size === indices.length, 'Record domestic white_product_panels (indices 1..6, or [] with rationale)');
  return indices;
}
export function validatePlatformRules(m, b) {
  const rules = b.platform_rules;
  need(rules && typeof rules.first_panel_white_background === 'boolean' && text(rules.basis), 'Record platform rule evidence');
  if (isDomestic(m)) {
    need(['confirmed', 'design_assumption'].includes(rules.status), 'Record verified domestic rules or an explicit design_assumption');
    need(typeof rules.first_panel_marketing_copy === 'boolean', 'Record whether domestic first-panel marketing copy is allowed');
    const indices = whitePanels(m, b);
    need(rules.first_panel_white_background === indices.includes(1), 'First-panel role conflicts with white_product_panels');
    if (indices.includes(1)) need(!rules.first_panel_marketing_copy, 'White product panel cannot allow marketing copy');
    if (!rules.first_panel_marketing_copy) need(!b.panels[0].title && !b.panels[0].subtitle && !b.panels[0].extra_copy.length, 'First-panel marketing copy is not allowed for this plan');
  } else {
    need(m.marketplace === 'amazon.com' && (!m.design_profile || m.design_profile === 'amazon_us'), 'Amazon US profile required');
    need(rules.status === 'confirmed', 'Confirm applicable platform rules before generation');
    need(rules.first_panel_white_background, 'Amazon listing main image needs white background');
  }
  for (const index of whitePanels(m, b)) {
    const p = b.panels[index - 1];
    need(p.background === '#FFFFFF' && p.product_only === true && !p.title && !p.subtitle && p.extra_copy.length === 0,
      `White listing ${index === 1 ? 'first panel' : `panel ${index}`}: #FFFFFF, product only, no marketing copy`);
  }
}
export function noCopyPanels(m, b) {
  return [...new Set([...whitePanels(m, b), ...(isDomestic(m) && !b.platform_rules.first_panel_marketing_copy ? [1] : [])])];
}
export function domesticPanelPolicy(m, b, index) {
  if (whitePanels(m, b).includes(index)) return `Panel ${index}: pure white #FFFFFF; complete product and verified included items only; no marketing text, people, badges, frame or banner. Keep the approved framing.`;
  return `Panel ${index}: preserve the approved domestic commercial composition, frame/banner if present, and exact confirmed copy. Do not convert it into an Amazon white main image.${noCopyPanels(m, b).includes(index) ? ' No marketing copy in this panel.' : ''}`;
}
export function domesticSetPolicy(m, b, style) {
  const mode = style.reference_intent?.mode;
  const direction = {
    full_style: '整体参考：保留选定参考的背景形态、材质、光影强度、装饰密度及图文关系；各格改变内容与机位，延续这些视觉特征。',
    selective: '局部参考：只迁移下列明确选定的特征；其余按本品及逐图方案执行。',
    quality_only: '仅参考完成度：采用选定的材质表现、阅读层级与精修质量；配色、具体背景及特效按本品方案执行。',
  }[mode] || '无风格图：按已选文字方向采用真实商业摄影及适配本品的装饰，背景服务商品与信息。';
  return `国内电商：${m.platform}；白底商品格：${whitePanels(m, b).join('、') || '无'}，仅完整商品及确认包含物，无新增文字、人物或装饰。${noCopyPanels(m, b).includes(1) ? '首格无营销文案。' : '首格按已确认营销角色执行。'}\n${direction}\n${domesticStyleBrief(style)}\n营销格按参考与逐图方案组织主副标题、小字、商品及背景，保持阅读间距与缩略图辨识度。完整文案及产品事实优先，装饰不能遮挡关键结构与文字；默认摄影规则不得削弱已明确选定的参考效果。`;
}

// Selected execution features travel verbatim; raw observations stay in the run.
export function domesticStyleBrief(style) {
  const features = [...new Set(style.transferable || [])];
  const exclusions = [...new Set(style.do_not_copy || [])];
  return [`风格方向：${style.creative_summary}`,
    features.length ? `必须保留的视觉特征：\n${features.map((value, i) => `${i + 1}. ${value}`).join('\n')}` : '',
    `整套执行规范：${visualSystemText(style)}。`,
    exclusions.length ? `不迁移：${exclusions.join('；')}。` : '',
  ].filter(Boolean).join('\n');
}
