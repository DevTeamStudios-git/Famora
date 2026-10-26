import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useAction, useClient, useResource } from './client';
import type {
  AgendaEvent,
  Field,
  Notification,
  Route,
  Values,
  Workspace,
} from './types';
import { routeForPath, toMultipart } from './model';
import {
  Avatar,
  Button,
  Card,
  Empty,
  ErrorBanner,
  FormModal,
  Input,
  Label,
  Busy,
  Row,
  notifyError,
  styles,
  usePalette,
} from './ui';

export type Navigate = (route: Route) => void;
export function navigatePath(path: string, navigate: Navigate) {
  if (path.startsWith('/admin'))
    navigate({ name: 'admin', section: path.split('/')[2] || 'overview' });
  else if (path.startsWith('/settings/'))
    navigate({ name: 'settings', section: path.split('/')[2] });
  else {
    const route = routeForPath(path);
    if (route) navigate(route);
  }
}
export function HomeScreen({ navigate }: { navigate: Navigate }) {
  const { session } = useClient();
  const c = usePalette();
  const can = (key: string) => session?.permissions.includes(key);
  const {
    data: tasks,
    loading,
    error,
    refresh,
  } = useResource<Workspace>(session?.modules.tasks ? 'workspace/tasks' : null);
  const { data: events } = useResource<AgendaEvent[]>(
    can('agenda.read') ? 'agenda' : null,
  );
  const { data: announcements } = useResource<Workspace>(
    session?.modules.announcements ? 'workspace/announcements' : null,
  );
  const openTasks =
    tasks?.items.filter(item => item.values.status !== 'COMPLETED') || [];
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!tasks}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={c.primary}
        />
      }
    >
      <View
        style={{
          borderRadius: 24,
          backgroundColor: c.tint,
          padding: 24,
          gap: 12,
        }}
      >
        <Label muted>
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Label>
        <Label large>A little more together.</Label>
        <Label>
          Hi {session?.user.displayName.split(' ')[0]}, welcome to{' '}
          {session?.family.name}.
        </Label>
        <View style={styles.wrap}>
          {can('agenda.read') ? (
            <Button onPress={() => navigate({ name: 'agenda' })}>
              Open calendar
            </Button>
          ) : null}
          {session?.modules.tasks ? (
            <Button
              secondary
              onPress={() => navigate({ name: 'workspace', kind: 'tasks' })}
            >
              Your tasks
            </Button>
          ) : null}
        </View>
      </View>
      <Label style={styles.sectionTitle}>Your family workspace</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {Object.entries(session?.modules || {}).map(([kind, tool]) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={tool.title}
            onPress={() => navigate({ name: 'workspace', kind })}
            style={{ width: '48%' }}
          >
            <Card style={{ minHeight: 105, justifyContent: 'center' }}>
              <Label style={{ color: c.primary, fontSize: 24 }}>
                {
                  (
                    {
                      tasks: '✓',
                      notebook: '▤',
                      personal: '▤',
                      contacts: '☷',
                      recipes: '♧',
                      announcements: '⚑',
                      files: '▱',
                      memories: '▧',
                      polls: '◉',
                    } as Record<string, string>
                  )[kind]
                }
              </Label>
              <Label>{tool.title}</Label>
            </Card>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
      {session?.modules.tasks ? (
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Label style={styles.sectionTitle}>Open tasks</Label>
            <Button
              quiet
              onPress={() => navigate({ name: 'workspace', kind: 'tasks' })}
            >
              View all
            </Button>
          </View>
          {openTasks.slice(0, 4).map(item => (
            <Row
              key={item.id}
              title={item.title}
              body={item.detail}
              onPress={() => navigate({ name: 'workspace', kind: 'tasks' })}
            />
          ))}
          {!openTasks.length ? (
            <Label muted>Your task list is clear.</Label>
          ) : null}
        </Card>
      ) : null}
      {can('agenda.read') ? (
        <Card>
          <Label style={styles.sectionTitle}>Coming up</Label>
          {events?.slice(0, 4).map(event => (
            <Row
              key={`${event.id}-${event.startAt}`}
              title={event.title}
              body={new Date(event.startAt).toLocaleString()}
              onPress={() =>
                navigate({ name: 'event', id: event.id, item: event })
              }
            />
          ))}
          {!events?.length ? <Label muted>No upcoming events.</Label> : null}
        </Card>
      ) : null}
      {announcements?.items.length ? (
        <Card>
          <Label style={styles.sectionTitle}>Announcements</Label>
          {announcements.items.slice(0, 3).map(item => (
            <Row
              key={item.id}
              title={item.title}
              body={item.body}
              onPress={() =>
                navigate({ name: 'workspace', kind: 'announcements' })
              }
            />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
export function SearchScreen({ navigate }: { navigate: Navigate }) {
  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setCommitted(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, loading, error } = useResource<
    { id: string; title: string; type: string; path: string }[]
  >(committed.length >= 2 ? `search?q=${encodeURIComponent(committed)}` : null);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Label large>Search Famora</Label>
      <Input
        label="Search your family"
        placeholder="Tasks, notes, files and events"
        value={query}
        onChangeText={setQuery}
      />
      <ErrorBanner message={error} />
      {loading && !data ? <Busy text="Searching…" /> : null}
      {committed.length < 2 ? (
        <Empty
          title="Find it in one place"
          body="Type at least two characters to search your family workspace."
        />
      ) : null}
      {data?.map(item => (
        <Card key={`${item.type}-${item.id}`}>
          <Row
            title={item.title}
            body={item.type}
            onPress={() => navigatePath(item.path, navigate)}
          />
        </Card>
      ))}
      {committed.length >= 2 && !loading && !data?.length ? (
        <Empty title="No matches" body="Try a different name or keyword." />
      ) : null}
    </ScrollView>
  );
}
export function NotificationsScreen({ navigate }: { navigate: Navigate }) {
  const { data, loading, error, refresh } = useResource<Notification[]>(
    'notifications',
    30000,
  );
  const action = useAction();
  const c = usePalette();
  const read = async (id?: string) => {
    try {
      await action('notifications-read', id);
      await refresh();
    } catch (problem) {
      notifyError(problem);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!data}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={c.primary}
        />
      }
    >
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Label large>Notifications</Label>
        <Button
          quiet
          onPress={() => {
            void read();
          }}
        >
          Read all
        </Button>
      </View>
      <ErrorBanner message={error} />
      {loading && !data ? <Busy /> : null}
      {data?.map(item => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => {
            void read(item.id);
            if (item.link) navigatePath(item.link, navigate);
          }}
        >
          <Card
            style={{
              borderLeftWidth: item.readAt ? 1 : 4,
              borderLeftColor: item.readAt ? c.line : c.primary,
            }}
          >
            <Label style={{ fontWeight: item.readAt ? '400' : '600' }}>
              {item.title}
            </Label>
            {item.body ? <Label muted>{item.body}</Label> : null}
            <Label muted>{new Date(item.createdAt).toLocaleString()}</Label>
          </Card>
        </Pressable>
      ))}
      {!loading && !data?.length ? (
        <Empty
          title="You’re all caught up"
          body="Family updates will appear here."
        />
      ) : null}
    </ScrollView>
  );
}
export function MembersScreen() {
  const { data, loading, error, refresh } = useResource<
    {
      id: string;
      displayRole: string;
      user: { displayName: string; avatarUrl?: string };
    }[]
  >('members');
  const c = usePalette();
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!data}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={c.primary}
        />
      }
    >
      <Label large>Your family</Label>
      <ErrorBanner message={error} />
      {loading && !data ? <Busy /> : null}
      {data?.map(member => (
        <Card key={member.id}>
          <View style={styles.row}>
            <Avatar
              name={member.user.displayName}
              url={member.user.avatarUrl}
            />
            <View style={{ flex: 1 }}>
              <Label>{member.user.displayName}</Label>
              <Label muted>{member.displayRole.replaceAll('_', ' ')}</Label>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
export function SettingsScreen({
  section,
  navigate,
}: {
  section?: string;
  navigate: Navigate;
}) {
  const { session, api, refreshSession, logout, server } = useClient();
  const [editor, setEditor] = useState<string | null>(null);
  const [profile, setProfile] = useState(section === 'profile');
  const [serverEditor, setServerEditor] = useState(false);
  const { connect } = useClient();
  const c = usePalette();
  const selected = section ? session?.preferenceSections[section] : undefined;
  const savePreferences = async (key: string, values: Values) => {
    await api(`preferences/${key}`, {
      method: 'POST',
      body: toMultipart(values),
    });
    await refreshSession();
    setEditor(null);
  };
  const profileFields: Field[] = [
    { name: 'displayName', label: 'Display name', required: true },
    { name: 'phone', label: 'Phone' },
    { name: 'bio', label: 'About you', type: 'textarea' },
    { name: 'birthday', label: 'Birthday', type: 'date' },
    { name: 'timezone', label: 'Time zone' },
    { name: 'language', label: 'Language' },
    {
      name: 'avatarUpload',
      label: 'Profile photo (JPEG, PNG or WebP)',
      type: 'file',
    },
  ];
  const user = session!.user;
  const profileValues: Values = {
    displayName: user.displayName,
    phone: user.phone || '',
    bio: user.bio || '',
    birthday: user.birthday?.slice(0, 10) || '',
    timezone: user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: user.language || 'en',
  };
  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Label large>{selected?.title || 'Settings'}</Label>
        {selected ? (
          <Card>
            <Label>{selected.title}</Label>
            {selected.fields.map(field => (
              <Row
                key={field.name}
                title={field.label}
                body={String(
                  session?.preferences[section!]?.[field.name] ??
                    selected.defaults[field.name] ??
                    'Default',
                )}
              />
            ))}
            <Button onPress={() => setEditor(section!)}>
              Edit preferences
            </Button>
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.row}>
                <Avatar
                  name={user.displayName}
                  url={user.avatarUrl}
                  size={58}
                />
                <View style={{ flex: 1 }}>
                  <Label style={styles.sectionTitle}>{user.displayName}</Label>
                  <Label muted>{user.email}</Label>
                </View>
              </View>
              <Button secondary onPress={() => setProfile(true)}>
                Edit profile
              </Button>
            </Card>
            <Card>
              <Label style={styles.sectionTitle}>Your preferences</Label>
              {Object.entries(session?.preferenceSections || {}).map(
                ([key, config]) => (
                  <Row
                    key={key}
                    title={config.title}
                    onPress={() => setEditor(key)}
                  />
                ),
              )}
            </Card>
            <Card>
              <Label style={styles.sectionTitle}>Your access</Label>
              <Label>
                {session?.family.name} · {session?.role.replaceAll('_', ' ')}
              </Label>
              <Label muted>
                Your Google account must remain approved by a family
                administrator. Permissions are checked by the server for every
                action.
              </Label>
              <Button
                secondary
                onPress={() =>
                  Alert.alert(
                    'Your permissions',
                    session?.permissions.join('\n') || 'No active permissions.',
                  )
                }
              >
                View your permissions
              </Button>
            </Card>
            <Card>
              <Label style={styles.sectionTitle}>Connection & sessions</Label>
              <Label muted>{server}</Label>
              <Button secondary onPress={() => setServerEditor(true)}>
                Change server
              </Button>
              <Button
                quiet
                onPress={() =>
                  Alert.alert(
                    'Sign out?',
                    'Your encrypted session will be removed from this device.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Sign out',
                        onPress: () => {
                          void logout().catch(notifyError);
                        },
                      },
                    ],
                  )
                }
              >
                Sign out of this device
              </Button>
            </Card>
            <Card>
              <Label style={styles.sectionTitle}>About Famora</Label>
              <Label muted>
                Family planning, conversations and shared memories in one place.
                This Android app uses native phone controls and encrypted
                Android Keystore session storage.
              </Label>
              <Label muted>Famora 1.0 · React Native</Label>
            </Card>
          </>
        )}
      </ScrollView>
      {editor && session?.preferenceSections[editor] ? (
        <FormModal
          title={session.preferenceSections[editor].title}
          fields={session.preferenceSections[editor].fields}
          values={{
            ...session.preferenceSections[editor].defaults,
            ...session.preferences[editor],
          }}
          onClose={() => setEditor(null)}
          onSave={async values => savePreferences(editor, values)}
        />
      ) : null}
      {profile ? (
        <FormModal
          title="Your profile"
          fields={profileFields}
          values={profileValues}
          editing
          onClose={() => setProfile(false)}
          onSave={async (values, files) => {
            await api('profile', {
              method: 'POST',
              body: toMultipart(values, files),
            });
            await refreshSession();
            setProfile(false);
          }}
        />
      ) : null}
      {serverEditor ? (
        <FormModal
          title="Famora server"
          fields={[
            {
              name: 'server',
              label: 'HTTPS server address',
              type: 'url',
              required: true,
            },
          ]}
          values={{ server }}
          onClose={() => setServerEditor(false)}
          onSave={async values => {
            await connect(String(values.server));
            setServerEditor(false);
          }}
        />
      ) : null}
    </>
  );
}
type AdminForm = {
  title: string;
  action: string;
  fields: Field[];
  values: Values;
  submit?: string;
};
type AdminData = {
  title: string;
  forms: AdminForm[];
  items: { id: string; title: string; body: string; path?: string }[];
  links: { title: string; path: string }[];
};
export function AdminScreen({
  section = 'overview',
  navigate,
}: {
  section?: string;
  navigate: Navigate;
}) {
  const { data, loading, error, refresh } = useResource<AdminData>(
    `admin/${section}`,
  );
  const { api, refreshSession } = useClient();
  const [form, setForm] = useState<AdminForm | null>(null);
  const [search, setSearch] = useState('');
  const c = usePalette();
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={c.primary}
          />
        }
      >
        <Label large>{data?.title || 'Family administration'}</Label>
        <ErrorBanner
          message={error}
          retry={() => {
            void refresh();
          }}
        />
        {loading && !data ? <Busy /> : null}
        {data?.links.length ? (
          <Card>
            {data.links.map(link => (
              <Row
                key={link.path}
                title={link.title}
                onPress={() => navigatePath(link.path, navigate)}
              />
            ))}
          </Card>
        ) : null}
        {(data?.forms.length || 0) > 6 ? (
          <Input
            label="Find a setting or family member"
            value={search}
            onChangeText={setSearch}
          />
        ) : null}
        {data?.forms
          .filter(item =>
            item.title.toLowerCase().includes(search.toLowerCase()),
          )
          .map((item, index) => (
            <Card key={`${item.action}-${item.title}-${index}`}>
              <Label style={styles.sectionTitle}>{item.title}</Label>
              <Button secondary onPress={() => setForm(item)}>
                {item.submit || 'Manage'}
              </Button>
            </Card>
          ))}
        {data?.items
          .filter(item =>
            `${item.title} ${item.body}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map(item => (
            <Card key={item.id}>
              <Label style={styles.sectionTitle}>{item.title}</Label>
              <Label muted>{item.body}</Label>
              {item.path ? (
                <Button
                  quiet
                  onPress={() => navigatePath(item.path!, navigate)}
                >
                  Open
                </Button>
              ) : null}
            </Card>
          ))}
      </ScrollView>
      {form ? (
        <FormModal
          title={form.title}
          fields={form.fields}
          values={form.values}
          submit={form.submit || 'Save'}
          onClose={() => setForm(null)}
          onSave={async values => {
            await api(`admin/${form.action}`, {
              method: 'POST',
              body: toMultipart({ ...form.values, ...values }),
            });
            setForm(null);
            await Promise.all([refresh(), refreshSession()]);
          }}
        />
      ) : null}
    </>
  );
}
