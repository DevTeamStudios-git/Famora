import type { Field, Values, WorkspaceItem, PickedFile } from './types';

export function serverAddress(value: string) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      'Enter a server address without credentials, query parameters or fragments.',
    );
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)
    )
  )
    throw new Error('Use an HTTPS Famora server.');
  return url.origin;
}
export function initialValues(fields: Field[], existing: Values = {}) {
  return Object.fromEntries(
    fields.map(field => [
      field.name,
      existing[field.name] ??
        (field.type === 'checkbox' ? false : field.options?.[0] ?? ''),
    ]),
  ) as Values;
}
export function validateFields(
  fields: Field[],
  values: Values,
  files: Record<string, PickedFile>,
  editing = false,
) {
  for (const field of fields) {
    if (
      field.required &&
      field.type === 'file' &&
      !editing &&
      !files[field.name]
    )
      return `Choose ${field.label.toLowerCase()}.`;
    if (
      field.required &&
      field.type !== 'file' &&
      !String(values[field.name] ?? '').trim()
    )
      return `${field.label} is required.`;
    if (
      field.options &&
      !field.options.includes(String(values[field.name] ?? ''))
    )
      return `Choose a valid ${field.label.toLowerCase()}.`;
    if (
      field.type === 'number' &&
      values[field.name] !== '' &&
      !Number.isFinite(Number(values[field.name]))
    )
      return `${field.label} must be a number.`;
    if (
      files[field.name]?.size &&
      Number(files[field.name].size) > 4 * 1024 * 1024
    )
      return 'Choose a file smaller than 4 MB.';
  }
  return null;
}
export function toMultipart(
  values: Values,
  files: Record<string, PickedFile> = {},
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values))
    if (value != null)
      form.append(
        key,
        value === true ? 'on' : value === false ? '' : String(value),
      );
  for (const [key, file] of Object.entries(files))
    form.append(key, {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob);
  return form;
}
export function optimisticItem(
  values: Values,
  id: string,
  previous?: WorkspaceItem,
): WorkspaceItem {
  return {
    ...previous,
    id,
    title: String(
      values.title ||
        values.name ||
        values.caption ||
        values.question ||
        'Untitled',
    ),
    body: String(values.description || values.body || values.notes || ''),
    detail: [values.status, values.priority].filter(Boolean).join(' · '),
    values,
    pending: true,
  };
}
export function monthDays(year: number, month: number) {
  const offset = new Date(year, month, 1).getDay();
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, i - offset + 1),
  );
}
export function dateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
}
export function routeForPath(
  path: string,
): { name: string; kind?: string; id?: string } | null {
  const url = new URL(path, 'https://famora.invalid');
  const kinds: Record<string, string> = {
    '/tasks': 'tasks',
    '/notebook': 'notebook',
    '/notebook/personal': 'personal',
    '/contacts': 'contacts',
    '/tools/recipes': 'recipes',
    '/announcements': 'announcements',
    '/files': 'files',
    '/memories': 'memories',
    '/tools/polls': 'polls',
  };
  if (kinds[url.pathname])
    return { name: 'workspace', kind: kinds[url.pathname] };
  if (url.pathname === '/dms')
    return {
      name: 'dms',
      id: url.searchParams.get('conversation') ?? undefined,
    };
  if (
    [
      '/agenda',
      '/chat',
      '/notifications',
      '/members',
      '/search',
      '/settings',
    ].includes(url.pathname)
  )
    return { name: url.pathname.slice(1) };
  return null;
}
