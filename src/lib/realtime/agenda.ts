/** [spec §37] channel naming — mirrors Family Chat's registry */
export const agendaChannel = (familyId: string): string => `family:${familyId}:agenda`;

export const AGENDA_TABLES = [
  "calendar_events",
  "calendar_event_participants",
  "calendars",
  "tasks",
] as const;
