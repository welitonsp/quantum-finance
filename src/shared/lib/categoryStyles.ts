export interface CategoryStyleEntry {
  bg: string;
  text: string;
  border: string;
}

export interface CategoryMeta {
  emoji: string;
  color: string;
}

export const CATEGORY_STYLES: Record<string, CategoryStyleEntry> = {
  'Alimentação':    { bg: 'bg-amber-500/10',   text: 'text-amber-400',       border: 'border-amber-500/20'   },
  'Transporte':     { bg: 'bg-blue-500/10',     text: 'text-blue-400',        border: 'border-blue-500/20'    },
  'Assinaturas':    { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',        border: 'border-cyan-500/20'    },
  'Saúde':          { bg: 'bg-rose-500/10',     text: 'text-rose-400',        border: 'border-rose-500/20'    },
  'Moradia':        { bg: 'bg-orange-500/10',   text: 'text-orange-400',      border: 'border-orange-500/20'  },
  'Educação':       { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',      border: 'border-indigo-500/20'  },
  'Lazer':          { bg: 'bg-pink-500/10',     text: 'text-pink-400',        border: 'border-pink-500/20'    },
  'Salário':        { bg: 'bg-emerald-500/10',  text: 'text-emerald-400',     border: 'border-emerald-500/20' },
  'Investimento':   { bg: 'bg-teal-500/10',     text: 'text-teal-400',        border: 'border-teal-500/20'    },
  'Freelance':      { bg: 'bg-violet-500/10',   text: 'text-violet-400',      border: 'border-violet-500/20'  },
  'Impostos/Taxas': { bg: 'bg-red-500/10',      text: 'text-red-400',         border: 'border-red-500/20'     },
  'Vestuário':      { bg: 'bg-purple-500/10',   text: 'text-purple-400',      border: 'border-purple-500/20'  },
  'Diversos':       { bg: 'bg-white/5',         text: 'text-quantum-fgMuted', border: 'border-quantum-border' },
  'Outros':         { bg: 'bg-white/5',         text: 'text-quantum-fgMuted', border: 'border-quantum-border' },
};

export const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  'Alimentação':    'text-amber-400  bg-amber-400/10  border-amber-400/20',
  'Transporte':     'text-blue-400   bg-blue-400/10   border-blue-400/20',
  'Assinaturas':    'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  'Saúde':          'text-rose-400   bg-rose-400/10   border-rose-400/20',
  'Moradia':        'text-orange-400 bg-orange-400/10 border-orange-400/20',
  'Educação':       'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  'Lazer':          'text-pink-400   bg-pink-400/10   border-pink-400/20',
  'Salário':        'text-quantum-accent bg-quantum-accent/10 border-quantum-accent/20',
  'Investimento':   'text-quantum-accent bg-quantum-accent/10 border-quantum-accent/20',
  'Impostos/Taxas': 'text-red-400    bg-red-400/10    border-red-400/20',
  'Vestuário':      'text-purple-400 bg-purple-400/10 border-purple-400/20',
  'Freelance':      'text-teal-400   bg-teal-400/10   border-teal-400/20',
  'Diversos':       'text-quantum-fgMuted bg-white/5   border-quantum-border',
  'Outros':         'text-quantum-fgMuted bg-white/5   border-quantum-border',
};

export const MUTED_CATEGORY_BADGE_CLASS = 'text-quantum-fgMuted bg-white/5 border-white/15';

export const CATEGORY_META: Record<string, CategoryMeta> = {
  'Alimentação':    { emoji: '🍽️',  color: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-300'  },
  'Transporte':     { emoji: '🚗',  color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-300'           },
  'Assinaturas':    { emoji: '📱',  color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-300'  },
  'Educação':       { emoji: '📚',  color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-300'           },
  'Saúde':          { emoji: '❤️',  color: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-300'           },
  'Moradia':        { emoji: '🏠',  color: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 text-yellow-300'  },
  'Impostos/Taxas': { emoji: '📋',  color: 'from-red-500/20 to-red-600/10 border-red-500/30 text-red-300'               },
  'Lazer':          { emoji: '🎮',  color: 'from-pink-500/20 to-pink-600/10 border-pink-500/30 text-pink-300'           },
  'Vestuário':      { emoji: '👗',  color: 'from-violet-500/20 to-violet-600/10 border-violet-500/30 text-violet-300'  },
  'Salário':        { emoji: '💰',  color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-300' },
  'Freelance':      { emoji: '💼',  color: 'from-teal-500/20 to-teal-600/10 border-teal-500/30 text-teal-300'           },
  'Investimento':   { emoji: '📈',  color: 'from-lime-500/20 to-lime-600/10 border-lime-500/30 text-lime-300'           },
  'Diversos':       { emoji: '📦',  color: 'from-slate-500/20 to-slate-600/10 border-slate-500/30 text-quantum-fg'       },
  'Outros':         { emoji: '•',   color: 'from-slate-500/20 to-slate-600/10 border-slate-500/30 text-quantum-fg'       },
};

export function getCategoryStyle(category: string | undefined): CategoryStyleEntry {
  return CATEGORY_STYLES[category ?? ''] ?? CATEGORY_STYLES['Diversos']!;
}

export function getCategoryBadgeClass(category: string | undefined, fallback = CATEGORY_BADGE_CLASSES['Diversos']!): string {
  return CATEGORY_BADGE_CLASSES[category ?? ''] ?? fallback;
}

export function getCategoryMeta(category: string | undefined): CategoryMeta {
  return CATEGORY_META[category ?? ''] ?? CATEGORY_META['Outros']!;
}
