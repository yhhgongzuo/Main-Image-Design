// Conversation decisions are recorded by the host; this validates readiness, not chat authenticity.
import { createHash } from 'node:crypto';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim();
export const userMessage = value => value?.role === 'user' && text(value.message) && text(value.message_id);
export const INFORMATION_TOPICS = ['product_identity', 'specifications', 'selling_points', 'audience_usage', 'pricing'];

export function initialInteraction(m) {
  return { run_id: m.run_id,
    style_reference: { status: m.style ? 'supplied' : 'pending', question: '', response: null },
    information: { status: 'pending', known: [], questions: [], response: null, notes: '',
      coverage: Object.fromEntries(INFORMATION_TOPICS.map(key => [key, { status: 'pending', evidence: '' }])),
      angles: { distinct_count: null, status: 'pending', evidence: '' } },
    style: { mode: m.style ? 'reference' : 'recommendation', status: m.style ? 'ready' : 'pending', options: [], selected_id: null, response: null,
      preference: null, presentation: null, confirmation: null, delegated: false, delegation: null } };
}

export const styleOptionsDigest = options => createHash('sha256').update(JSON.stringify(options)).digest('hex');

function validateStyleOptions(choice) {
  need(Array.isArray(choice.options) && [1, 3].includes(choice.options.length) && new Set(choice.options.map(x => x.id)).size === choice.options.length, 'Offer three product-specific directions, or one direction based on an actual user preference or explicit style delegation');
  for (const option of choice.options) for (const key of ['id', 'name', 'description', 'fit']) need(text(option[key]), `Style option ${key} required`);
  if (choice.options.length === 1 && !choice.delegated) need(userMessage(choice.preference), 'A single proposed direction requires the actual user style preference; product photos are not a style preference');
}

export function presentStyleOptions(m, interaction) {
  need(interaction?.run_id === m.run_id && !m.style, 'Style choices apply only to this run without a supplied style reference');
  const choice = interaction.style;
  need(choice?.mode === 'recommendation' && !choice.delegated, 'Use this second stage for user style confirmation, not an explicit delegation');
  validateStyleOptions(choice);
  const digest = styleOptionsDigest(choice.options);
  const preview = '**第二环节：确认风格**\n\n有喜欢的风格参考图，仍可以直接上传，一张即可，同行图也可以。以下是待你确认的文字方向，尚未选定，也尚未开始六图策划。\n\n' +
    choice.options.map((option, index) => `${index + 1}. **${option.id}｜${option.name}**：${option.description}。适合本品的原因：${option.fit}。`).join('\n\n') +
    '\n\n请在聊天里告诉我采用哪个方向，或直接说明想调整的地方。风格确认后，我再策划六张图的完整文案与画面；这一步不授权生成图片。\n';
  Object.assign(choice, { status: 'awaiting_confirmation', selected_id: null, response: null, confirmation: null,
    presentation: { digest, prior_user_message_id: choice.preference?.message_id || interaction.information?.response?.message_id || m.generation_request?.message_id || null } });
  return { status: choice.status, digest, preview };
}

export function confirmStyleOptions(m, interaction, request) {
  need(interaction?.run_id === m.run_id && !m.style, 'Style confirmation belongs to another run or uses a supplied reference');
  const choice = interaction.style;
  need(choice?.mode === 'recommendation' && choice.status === 'awaiting_confirmation' && !choice.delegated, 'Display the second-stage style preview before confirming');
  validateStyleOptions(choice);
  const digest = styleOptionsDigest(choice.options);
  need(choice.presentation?.digest === digest && request?.digest === digest, 'Style options changed; display the current directions and wait for a new reply');
  need(userMessage(request) && request.message_id !== choice.presentation.prior_user_message_id, 'Use the actual new user reply after the style preview, not the earlier product-information reply');
  const selected = choice.options.find(option => option.id === request.selected_id);
  need(selected, 'User confirmation must identify a displayed style direction');
  const response = { role: request.role, message: request.message, message_id: request.message_id };
  Object.assign(choice, { status: 'selected', selected_id: selected.id, response, confirmation: { digest, selected_id: selected.id } });
  interaction.style_reference = { ...interaction.style_reference, status: 'answered', question: '请在聊天里告诉我采用哪个方向，或直接说明想调整的地方。', response };
  return { status: 'style_confirmed', selected_id: selected.id, name: selected.name };
}

export function validateStyleDecision(m, interaction, style) {
  need(interaction?.run_id === m.run_id, 'Style decision belongs to another run');
  const reference = interaction.style_reference, choice = interaction.style;
  if (m.style) {
    need(reference?.status === 'supplied', 'Record the actual supplied style reference');
    need(choice?.mode === 'reference' && choice.status === 'ready' && choice.options?.length === 0 && !choice.selected_id, 'Use supplied reference directly; do not offer three styles');
    need(style.origin === 'reference', 'Style must be analyzed from the supplied reference');
    if (m.styles?.length > 1) need(Array.isArray(style.source_ids) && style.source_ids.length === m.styles.length && m.styles.every(s => style.source_ids.includes(s.id)), 'Analyze every supplied style reference');
    return;
  }
  need(reference?.status === 'answered' && userMessage(reference.response), 'Style is unresolved; an unanswered style question cannot enter six-image planning');
  need(choice?.mode === 'recommendation' && choice.status === 'selected', 'Complete the separate second-stage style confirmation before six-image planning');
  validateStyleOptions(choice);
  const selected = choice.options.find(option => option.id === choice.selected_id);
  need(selected && userMessage(choice.response), 'Actual style confirmation or explicit style delegation required');
  if (choice.delegated) {
    const delegation = choice.delegation;
    need(choice.options.length === 1 && text(choice.reason), 'Record one chosen direction and the reason for explicit style delegation');
    need(text(delegation?.quote) && choice.response.message.includes(delegation.quote), 'Quote the actual user authorization to decide the style');
    const scoped = /风格|视觉方向|style|visual direction/i.test(delegation.quote) && /决定|做主|你来定|你定|你选|你来选|AI定|AI选|全权|交给(?:你|AI)|由你|你来设计|decid|choos|up to you/i.test(delegation.quote);
    const context = delegation.context;
    const contextual = context?.role === 'assistant' && text(context.message_id) && /风格|视觉方向|style|visual direction/i.test(context.message || '') &&
      /^(你来定|你来决定|你决定|你选|你来选|你来设计|交给你决定|交给AI决定|you decide|you choose|up to you)[。！!\s.]*$/i.test(delegation.quote.trim());
    need(scoped || contextual, 'Product-information replies such as 按图片做, 没有参考图, or 其他按现有资料做 do not delegate the style');
    // Scope and quote checks do not establish consent semantics; the host must verify an affirmative, explicit delegation.
  } else {
    const digest = styleOptionsDigest(choice.options);
    need(choice.presentation?.digest === digest && choice.confirmation?.digest === digest && choice.confirmation.selected_id === selected.id, 'Missing or stale second-stage style confirmation; run style-preview and style-confirm');
    need(choice.response.message_id !== choice.presentation.prior_user_message_id, 'An earlier intake reply cannot confirm a later AI-proposed style');
  }
  need(style.origin === 'recommendation' && style.option_id === selected.id && style.name === selected.name, 'Style analysis must match the user-confirmed or explicitly delegated direction');
}

export function validateInteraction(m, interaction, style) {
  need(interaction?.run_id === m.run_id, 'Interaction belongs to another run');
  const info = interaction.information;
  need(interaction.style_reference, 'Record the first-round style reference decision');
  if (interaction.style_reference) {
    const reference = interaction.style_reference;
    need(['supplied', 'answered'].includes(reference.status), 'Resolve the style reference or second-stage style confirmation before planning');
    if (reference.status !== 'supplied') need(text(reference.question) && userMessage(reference.response), 'Record the style question and actual reply; a partial reply may leave style unanswered');
  }
  need(['sufficient', 'answered', 'declined'].includes(info?.status), 'Product information interaction is pending; ask once and wait');
  need(text(info.notes) && Array.isArray(info.known) && Array.isArray(info.questions), 'Record known facts and information decision');
  if (info.status === 'sufficient') need(info.questions.length === 0, 'Pending questions cannot be marked sufficient');
  else {
    need(info.questions.length >= 1 && info.questions.length <= 5 && info.questions.every(text), 'Ask one concise round with 1-5 relevant questions');
    need(userMessage(info.response), 'Actual information reply required; silence is not a reply');
  }
  if (m.intake_contract === '3.9') {
    for (const key of INFORMATION_TOPICS) {
      const topic = info.coverage?.[key];
      need(['known', 'asked', 'declined', 'not_applicable'].includes(topic?.status) && text(topic.evidence), `Check first-round product information: ${key}`);
      if (topic.status === 'asked') need(text(topic.question) && info.questions.includes(topic.question) && userMessage(info.response), `Record the actual question and reply for ${key}`);
      if (topic.status === 'declined') need(userMessage(topic.response || info.response), `Record the user's actual no-information reply for ${key}`);
      if (info.status === 'sufficient') need(['known', 'not_applicable'].includes(topic.status), 'Sufficient information cannot contain unanswered or declined topics');
    }
    const angles = info.angles;
    need(Number.isInteger(angles?.distinct_count) && angles.distinct_count >= 0 && text(angles.evidence), 'Record actual distinct product views, not attachment count');
    need(['known', 'asked', 'declined'].includes(angles.status), 'Record the product-angle decision');
    if (angles.distinct_count < 3) {
      need(['asked', 'declined'].includes(angles.status), 'Ask for more product views when fewer than three are recognizable');
      need(userMessage(angles.response || info.response), 'Record the actual reply before continuing with limited views');
      if (angles.status === 'asked') need(text(angles.question) && info.questions.includes(angles.question), 'Include the actual angle question in the first round');
    }
  }
  validateStyleDecision(m, interaction, style);
  return interaction;
}
