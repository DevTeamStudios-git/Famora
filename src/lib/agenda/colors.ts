export const CALENDAR_COLOR_TOKENS = {
  INDIGO: { label: "Indigo", bg: "bg-indigo-500/15", border: "border-l-indigo-400", text: "text-indigo-100", dot: "bg-indigo-400" },
  TEAL: { label: "Teal", bg: "bg-teal-500/15", border: "border-l-teal-400", text: "text-teal-100", dot: "bg-teal-400" },
  MOSS: { label: "Moss", bg: "bg-lime-600/15", border: "border-l-lime-500", text: "text-lime-100", dot: "bg-lime-500" },
  AMBER: { label: "Amber", bg: "bg-amber-500/15", border: "border-l-amber-400", text: "text-amber-100", dot: "bg-amber-400" },
  CORAL: { label: "Coral", bg: "bg-orange-500/15", border: "border-l-orange-400", text: "text-orange-100", dot: "bg-orange-400" },
  ROSE: { label: "Rose", bg: "bg-rose-500/15", border: "border-l-rose-400", text: "text-rose-100", dot: "bg-rose-400" },
  VIOLET: { label: "Violet", bg: "bg-violet-500/15", border: "border-l-violet-400", text: "text-violet-100", dot: "bg-violet-400" },
  SKY: { label: "Sky", bg: "bg-sky-500/15", border: "border-l-sky-400", text: "text-sky-100", dot: "bg-sky-400" },
  SLATE: { label: "Slate", bg: "bg-slate-500/20", border: "border-l-slate-400", text: "text-slate-100", dot: "bg-slate-400" },
} as const;

export type CalendarColorToken = keyof typeof CALENDAR_COLOR_TOKENS;

export const colorToken = (c: string): (typeof CALENDAR_COLOR_TOKENS)[CalendarColorToken] =>
  CALENDAR_COLOR_TOKENS[c as CalendarColorToken] ?? CALENDAR_COLOR_TOKENS.INDIGO;
