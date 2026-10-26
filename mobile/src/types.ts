export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: readonly string[];
  choices?: { value: string; label: string }[];
  multiple?: boolean;
};
export type Values = Record<
  string,
  string | boolean | number | null | undefined
>;
export type PickedFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
  durationMs?: number;
};
export type Tool = {
  title: string;
  path: string;
  read: string;
  create: string;
  update: string;
  delete: string;
  fields: Field[];
};
export type WorkspaceItem = {
  id: string;
  title: string;
  body: string;
  detail?: string;
  values: Values;
  url?: string;
  mediaType?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  pending?: boolean;
  options?: { id: string; label: string; votes: number; mine: boolean }[];
};
export type Workspace = {
  config: Tool;
  items: WorkspaceItem[];
  members: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};
export type User = {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  phone?: string;
  bio?: string;
  birthday?: string;
  timezone?: string;
  language?: string;
};
export type AppSession = {
  user: User;
  family: { id: string; name: string };
  memberId: string;
  role: string;
  permissions: string[];
  modules: Record<string, Tool>;
  features: { key: string; enabled: boolean }[];
  preferences: Record<string, Values>;
  preferenceSections: Record<
    string,
    { title: string; fields: Field[]; defaults: Values }
  >;
};
export type Route = {
  name: string;
  id?: string;
  kind?: string;
  section?: string;
  item?: AgendaEvent;
};
export type AgendaEvent = {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  seriesStartAt?: string;
  seriesEndAt?: string;
  version: number;
  location?: string;
  videoCallLink?: string;
  allDay: boolean;
  visibility: string;
  createdByMemberId: string;
  recurrenceRule?: string;
  timeZone?: string;
  categoryId?: string;
  category?: { name: string; color: string };
  attendees: {
    memberId: string;
    rsvp: string;
    member: { displayName: string };
  }[];
  reminders?: { minutesBefore: number }[];
};
export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  sender?: { memberId: string; displayName: string; avatarUrl?: string };
  replyTo?: { id: string; body: string; sender?: { displayName: string } };
  isMine: boolean;
  isPinned: boolean;
  isSavedByMe: boolean;
  pending?: boolean;
  reactions: { emoji: string; count: number; reactedByMe: boolean }[];
  attachments: {
    id: string;
    url?: string;
    fileName: string;
    mimeType: string;
    size: number;
  }[];
  voiceDurationMs?: number;
};
export type DMData = {
  conversations: {
    id: string;
    members: { memberId: string; member: { user: { displayName: string } } }[];
  }[];
  members: { id: string; user: { displayName: string } }[];
  messages: {
    id: string;
    body: string;
    createdAt: string;
    senderMemberId: string;
    sender?: { user: { displayName: string } };
  }[];
};
export type Notification = {
  id: string;
  title: string;
  body?: string;
  link?: string;
  createdAt: string;
  readAt?: string;
};
