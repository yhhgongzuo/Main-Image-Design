// Conversation decisions are recorded by the host; this validates readiness, not chat authenticity.
const need = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim();
export const userMessage = value => value?.role === 'user' && text(value.message) && text(value.message_id);

export function initialInteraction(m) {
  return { run_id: m.run_id,
    information: { status: 'pending', known: [], questions: [], response: null, notes: '' },
    style: { mode: m.style ? 'reference' : 'recommendation', status: m.style ? 'ready' : 'pending', options: [], selected_id: null, response: null } };
}

export function validateInteraction(m, interaction, style) {
  need(interaction?.run_id === m.run_id, 'Interaction belongs to another run');
  const info = interaction.information, choice = interaction.style;
  need(['sufficient', 'answered', 'declined'].includes(info?.status), 'Product information interaction is pending; ask once and wait');
  need(text(info.notes) && Array.isArray(info.known) && Array.isArray(info.questions), 'Record known facts and information decision');
  if (info.status === 'sufficient') need(info.questions.length === 0, 'Pending questions cannot be marked sufficient');
  else {
    need(info.questions.length >= 1 && info.questions.length <= 5 && info.questions.every(text), 'Ask one concise round with 1-5 relevant questions');
    need(userMessage(info.response), 'Actual information reply required; silence is not a reply');
  }
  if (m.style) {
    need(choice?.mode === 'reference' && choice.status === 'ready' && choice.options?.length === 0 && !choice.selected_id, 'Use supplied reference directly; do not offer three styles');
    need(style.origin === 'reference', 'Style must be analyzed from the supplied reference');
    if (m.styles?.length > 1) need(Array.isArray(style.source_ids) && style.source_ids.length === m.styles.length && m.styles.every(s => style.source_ids.includes(s.id)), 'Analyze every supplied style reference');
  } else {
    need(choice?.mode === 'recommendation' && choice.status === 'selected', 'Select a text-only style before generation');
    need(Array.isArray(choice.options) && choice.options.length === 3 && new Set(choice.options.map(x => x.id)).size === 3, 'Exactly three text-only style options required');
    for (const option of choice.options) for (const key of ['id', 'name', 'description', 'fit']) need(text(option[key]), `Style option ${key} required`);
    const selected = choice.options.find(x => x.id === choice.selected_id);
    need(selected && userMessage(choice.response), 'Actual style selection or explicit delegation required');
    need(style.origin === 'recommendation' && style.option_id === selected.id && style.name === selected.name, 'Style analysis must match selected text option');
    if (choice.delegated) need(text(choice.reason), 'Explain delegated style recommendation');
  }
  return interaction;
}
