export const NOTE_TYPES = {
  BOX: 'box',
  GENERAL: 'general',
};

const NOTE_GROUP_ORDER = {
  [NOTE_TYPES.BOX]: 0,
  [NOTE_TYPES.GENERAL]: 1,
};

export const normalizeTemplateNote = (note = {}) => {
  const noteType = note.note_type === NOTE_TYPES.BOX ? NOTE_TYPES.BOX : NOTE_TYPES.GENERAL;

  const legacyText = typeof note.note_text === 'string' ? note.note_text.trim() : '';
  const rawBullets = Array.isArray(note.bullet_lines)
    ? note.bullet_lines
    : legacyText
      ? [legacyText]
      : [];

  const bullet_lines = rawBullets
    .map(line => String(line || '').trim())
    .filter(Boolean);

  return {
    ...note,
    note_type: noteType,
    title: typeof note.title === 'string' ? note.title : '',
    bullet_lines,
    note_text: typeof note.note_text === 'string' ? note.note_text : '',
    box_content: typeof note.box_content === 'string' ? note.box_content : '',
    border_color: note.border_color || '#475569',
    text_color: note.text_color || '#334155',
    priority: Number.isFinite(Number(note.priority)) ? Number(note.priority) : 0,
    active_flag: note.active_flag !== false,
  };
};

export const sortTemplateNotesForDispatch = (notes = []) => {
  return [...notes]
    .map(normalizeTemplateNote)
    .sort((a, b) => {
      const groupDiff = (NOTE_GROUP_ORDER[a.note_type] ?? 99) - (NOTE_GROUP_ORDER[b.note_type] ?? 99);
      if (groupDiff !== 0) return groupDiff;
      const priorityDiff = (a.priority || 0) - (b.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Supports lightweight markup: **bold** and __underline__
export const renderSimpleMarkupToHtml = (value = '') => {
  let safe = escapeHtml(value);
  safe = safe.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
  safe = safe.replace(/__(.+?)__/gs, '<u>$1</u>');
  safe = safe.replace(/\n/g, '<br />');
  return safe;
};
