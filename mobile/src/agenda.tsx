import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAction, useClient, useResource } from './client';
import type { AgendaEvent, Field, Route, Values } from './types';
import { dateKey, monthDays, routeForPath } from './model';
import {
  Button,
  Card,
  Choice,
  Empty,
  ErrorBanner,
  FormModal,
  Input,
  Label,
  Sheet,
  Toggle,
  Busy,
  confirmDelete,
  notifyError,
  styles,
  usePalette,
} from './ui';

type AgendaMeta = {
  categories: { id: string; name: string; color: string }[];
  members: { id: string; displayName: string }[];
};
export function AgendaScreen({
  navigate,
}: {
  navigate: (route: Route) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [selected, setSelected] = useState(dateKey(now));
  const [mode, setMode] = useState<'month' | 'agenda'>('month');
  const [editor, setEditor] = useState<AgendaEvent | 'new' | null>(null);
  const c = usePalette();
  const { session } = useClient();
  const start = new Date(
      month.getFullYear(),
      month.getMonth(),
      -6,
    ).toISOString(),
    end = new Date(month.getFullYear(), month.getMonth() + 1, 8).toISOString();
  const { data, loading, error, refresh } = useResource<AgendaEvent[]>(
    `agenda?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
  const events = data || [];
  const visible = events.filter(
    event => mode === 'agenda' || dateKey(event.startAt) === selected,
  );
  const days = useMemo(
    () => monthDays(month.getFullYear(), month.getMonth()),
    [month],
  );
  const move = (offset: number) => {
    setMonth(date => new Date(date.getFullYear(), date.getMonth() + offset, 1));
  };
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
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Label large>Family calendar</Label>
          {session?.permissions.includes('agenda.event.create') ? (
            <Button onPress={() => setEditor('new')}>+ Event</Button>
          ) : null}
        </View>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Button quiet onPress={() => move(-1)}>
            ‹
          </Button>
          <Text style={{ fontSize: 20, color: c.text, fontWeight: '500' }}>
            {month.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </Text>
          <Button quiet onPress={() => move(1)}>
            ›
          </Button>
        </View>
        <View style={styles.wrap}>
          <Button
            secondary
            onPress={() => {
              const date = new Date();
              setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              setSelected(dateKey(date));
            }}
          >
            Today
          </Button>
          <Button secondary={mode !== 'month'} onPress={() => setMode('month')}>
            Month
          </Button>
          <Button
            secondary={mode !== 'agenda'}
            onPress={() => setMode('agenda')}
          >
            Agenda
          </Button>
        </View>
        <ErrorBanner
          message={error}
          retry={() => {
            void refresh();
          }}
        />
        {mode === 'month' ? (
          <Card>
            <View style={{ flexDirection: 'row' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text
                  key={index}
                  style={{
                    width: '14.28%',
                    textAlign: 'center',
                    color: c.muted,
                    fontSize: 12,
                    paddingBottom: 8,
                  }}
                >
                  {day}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {days.map(day => {
                const key = dateKey(day);
                const count = events.filter(
                  event => dateKey(event.startAt) === key,
                ).length;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.toDateString()}, ${count} events`}
                    onPress={() => setSelected(key)}
                    style={{
                      width: '14.28%',
                      height: 53,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      borderRadius: 20,
                      backgroundColor:
                        selected === key ? c.primary : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color:
                          selected === key
                            ? c.onPrimary
                            : day.getMonth() === month.getMonth()
                            ? c.text
                            : c.muted,
                        fontSize: 16,
                        fontWeight: dateKey(new Date()) === key ? '700' : '400',
                      }}
                    >
                      {day.getDate()}
                    </Text>
                    <View
                      style={{
                        width: count ? 5 : 0,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor:
                          selected === key ? c.onPrimary : c.primary,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : null}
        <Label style={{ fontSize: 18, fontWeight: '500' }}>
          {mode === 'agenda'
            ? 'Upcoming in this month'
            : new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
        </Label>
        {loading && !data ? <Busy /> : null}
        {!loading && !visible.length ? (
          <Empty
            title="Room for something good"
            body="No events for this day. Use + Event to plan something."
          />
        ) : null}
        {visible.map(event => (
          <Pressable
            key={`${event.id}-${event.startAt}`}
            accessibilityRole="button"
            onPress={() =>
              navigate({ name: 'event', id: event.id, item: event })
            }
          >
            <Card
              style={{
                borderLeftWidth: 5,
                borderLeftColor: event.category?.color || c.primary,
              }}
            >
              <Label style={{ fontSize: 18, fontWeight: '500' }}>
                {event.title}
              </Label>
              <Label muted>
                {event.allDay
                  ? 'All day'
                  : new Date(event.startAt).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
              </Label>
              {event.location ? <Label>{event.location}</Label> : null}
              {event.recurrenceRule ? (
                <Label muted>Repeating event</Label>
              ) : null}
            </Card>
          </Pressable>
        ))}
      </ScrollView>
      {editor ? (
        <EventEditor
          event={editor === 'new' ? null : editor}
          date={selected}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}
export function EventEditor({
  event,
  date,
  onClose,
  onSaved,
}: {
  event: AgendaEvent | null;
  date?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: meta } = useResource<AgendaMeta>('agenda-meta');
  const action = useAction();
  const start =
    event?.seriesStartAt ||
    event?.startAt ||
    new Date(`${date || dateKey(new Date())}T10:00:00`).toISOString();
  const end =
    event?.seriesEndAt ||
    event?.endAt ||
    new Date(new Date(start).getTime() + 3600000).toISOString();
  const fields: Field[] = [
    { name: 'title', label: 'Title', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    {
      name: 'startAt',
      label: 'Starts',
      type: 'datetime-local',
      required: true,
    },
    { name: 'endAt', label: 'Ends', type: 'datetime-local', required: true },
    { name: 'allDay', label: 'All-day event', type: 'checkbox' },
    { name: 'location', label: 'Location' },
    { name: 'videoCallLink', label: 'Video call link', type: 'url' },
    { name: 'visibility', label: 'Visibility', options: ['FAMILY', 'PRIVATE'] },
    {
      name: 'categoryId',
      label: 'Category',
      choices: [
        { value: '', label: 'No category' },
        ...(meta?.categories || []).map(category => ({
          value: category.id,
          label: category.name,
        })),
      ],
    },
    {
      name: 'attendeeIds',
      label: 'Invite family members',
      choices: (meta?.members || []).map(member => ({
        value: member.id,
        label: member.displayName,
      })),
      multiple: true,
    },
    {
      name: 'recurrenceRule',
      label: 'Repeat',
      options: ['', 'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY'],
    },
    { name: 'timeZone', label: 'Time zone', required: true },
    {
      name: 'reminder',
      label: 'Reminder minutes before (optional)',
      type: 'number',
    },
  ];
  const values: Values = {
    title: event?.title || '',
    description: event?.description || '',
    startAt: start,
    endAt: end,
    allDay: event?.allDay || false,
    location: event?.location || '',
    videoCallLink: event?.videoCallLink || '',
    visibility: event?.visibility || 'FAMILY',
    categoryId: event?.categoryId || '',
    attendeeIds:
      event?.attendees.map(member => member.memberId).join(',') || '',
    recurrenceRule: event?.recurrenceRule || '',
    timeZone:
      event?.timeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC',
    reminder: event?.reminders?.[0]?.minutesBefore || '',
  };
  // Custom recurrence rules remain editable when an existing series uses a rule beyond the quick presets.
  if (
    event?.recurrenceRule &&
    !fields[10].options?.includes(event.recurrenceRule)
  )
    fields[10].options = [...(fields[10].options || []), event.recurrenceRule];
  return (
    <FormModal
      title={event ? 'Edit event' : 'New event'}
      fields={fields}
      values={values}
      editing={!!event}
      onClose={onClose}
      onSave={async draft => {
        const from = new Date(String(draft.startAt)),
          to = new Date(String(draft.endAt));
        if (!Number.isFinite(from.getTime()) || from >= to)
          throw new Error('Choose an end time after the start time.');
        const payload = {
          title: String(draft.title),
          description: String(draft.description || '') || null,
          startAt: from.toISOString(),
          endAt: to.toISOString(),
          allDay: draft.allDay === true,
          location: String(draft.location || '') || null,
          videoCallLink: String(draft.videoCallLink || '') || null,
          visibility: String(draft.visibility),
          categoryId: String(draft.categoryId || '') || null,
          attendeeIds: String(draft.attendeeIds || '')
            .split(',')
            .filter(Boolean),
          recurrenceRule: String(draft.recurrenceRule || '') || null,
          timeZone: String(draft.timeZone),
          reminders:
            Number(draft.reminder) > 0
              ? [{ minutesBefore: Number(draft.reminder) }]
              : [],
          ...(event ? { version: event.version } : {}),
        };
        await action(
          event ? 'event-update' : 'event-create',
          event?.id,
          undefined,
          payload,
        );
        onSaved();
      }}
    />
  );
}
type Details = {
  comments: { id: string; body: string; author: string; date: string }[];
  checklist: { id: string; label: string; isDone: boolean }[];
  attachments: { id: string; name: string }[];
  files: { id: string; name: string }[];
};
export function EventScreen({
  event,
  navigate,
  back,
}: {
  event: AgendaEvent;
  navigate: (route: Route) => void;
  back: () => void;
}) {
  const { data, loading, error, refresh } = useResource<Details>(
    `event/${event.id}`,
  );
  const { session } = useClient();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [checklist, setChecklist] = useState('');
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState(false);
  const own = event.createdByMemberId === session?.memberId;
  const canEdit =
    !!session?.permissions.includes('agenda.event.update.any') ||
    (own && !!session?.permissions.includes('agenda.event.update.own'));
  const canDelete =
    !!session?.permissions.includes('agenda.event.delete.any') ||
    (own && !!session?.permissions.includes('agenda.event.delete.own'));
  const change = async (operation: string, values: Record<string, unknown>) => {
    setBusy(true);
    try {
      await action('event-detail', event.id, operation, values);
      setComment('');
      setChecklist('');
      await refresh();
    } catch (problem) {
      notifyError(problem);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Label large>{event.title}</Label>
        <Label muted>
          {new Date(event.startAt).toLocaleString()} –{' '}
          {new Date(event.endAt).toLocaleString()}
        </Label>
        {event.description ? <Label>{event.description}</Label> : null}
        {event.location ? (
          <Card>
            <Label>Location</Label>
            <Label>{event.location}</Label>
            <Button
              quiet
              onPress={() => {
                void Linking.openURL(
                  `geo:0,0?q=${encodeURIComponent(event.location!)}`,
                ).catch(notifyError);
              }}
            >
              Open map
            </Button>
          </Card>
        ) : null}
        {event.videoCallLink ? (
          <Button
            secondary
            onPress={() => {
              void Linking.openURL(event.videoCallLink!).catch(notifyError);
            }}
          >
            Join video call
          </Button>
        ) : null}
        <Card>
          <Label style={{ fontSize: 18, fontWeight: '500' }}>
            Your response
          </Label>
          <View style={styles.wrap}>
            {['YES', 'MAYBE', 'NO', 'NONE'].map(value => (
              <Button
                key={value}
                secondary
                onPress={() => {
                  void action('rsvp', event.id, value)
                    .then(() => Alert.alert('Response saved'))
                    .catch(notifyError);
                }}
              >
                {value === 'NONE'
                  ? 'Clear'
                  : value === 'YES'
                  ? 'Going'
                  : value === 'NO'
                  ? 'Not going'
                  : 'Maybe'}
              </Button>
            ))}
          </View>
          {event.attendees.map(attendee => (
            <Label muted key={attendee.memberId}>
              {attendee.member.displayName} · {attendee.rsvp}
            </Label>
          ))}
        </Card>
        <View style={styles.wrap}>
          {canEdit ? (
            <Button secondary onPress={() => setEditing(true)}>
              Edit event
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              quiet
              danger
              onPress={() =>
                confirmDelete(event.title, async () => {
                  await action('event-delete', event.id);
                  back();
                })
              }
            >
              Delete event
            </Button>
          ) : null}
        </View>
        <ErrorBanner
          message={error}
          retry={() => {
            void refresh();
          }}
        />
        {loading && !data ? <Busy /> : null}
        <Card>
          <Label style={{ fontSize: 18, fontWeight: '500' }}>Checklist</Label>
          {data?.checklist.map(item => (
            <Toggle
              key={item.id}
              label={item.label}
              value={item.isDone}
              onChange={checked => {
                if (canEdit)
                  void change('toggle', {
                    itemId: item.id,
                    isDone: String(checked),
                  });
              }}
            />
          ))}
          {canEdit ? (
            <>
              <Input
                label="New checklist item"
                value={checklist}
                onChangeText={setChecklist}
              />
              <Button
                secondary
                disabled={busy || !checklist.trim()}
                onPress={() => {
                  void change('checklist', { label: checklist });
                }}
              >
                Add checklist item
              </Button>
            </>
          ) : null}
        </Card>
        <Card>
          <Label style={{ fontSize: 18, fontWeight: '500' }}>Files</Label>
          {data?.attachments.map(attachment => (
            <View key={attachment.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Label>{attachment.name}</Label>
              </View>
              {canEdit ? (
                <Button
                  quiet
                  danger
                  onPress={() => {
                    void change('detach', { attachmentId: attachment.id });
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </View>
          ))}
          {data?.attachments.length ? (
            <Button
              quiet
              onPress={() => navigate({ name: 'workspace', kind: 'files' })}
            >
              Open family files
            </Button>
          ) : null}
          {canEdit && data?.files.length ? (
            <>
              <Choice
                label="Attach a family file"
                value={file}
                options={[
                  { value: '', label: 'Choose file' },
                  ...data.files.map(row => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
                onChange={setFile}
              />
              <Button
                secondary
                disabled={!file || busy}
                onPress={() => {
                  void change('attach', { fileId: file });
                }}
              >
                Attach file
              </Button>
            </>
          ) : null}
        </Card>
        <Card>
          <Label style={{ fontSize: 18, fontWeight: '500' }}>Comments</Label>
          {data?.comments.map(item => (
            <View key={item.id} style={{ gap: 3, paddingVertical: 7 }}>
              <Label muted>
                {item.author} · {new Date(item.date).toLocaleDateString()}
              </Label>
              <Label>{item.body}</Label>
            </View>
          ))}
          {session?.permissions.includes('agenda.event.comment') ? (
            <>
              <Input
                label="Your comment"
                value={comment}
                onChangeText={setComment}
                multiline
              />
              <Button
                disabled={busy || !comment.trim()}
                onPress={() => {
                  void change('comment', { body: comment });
                }}
              >
                Post comment
              </Button>
            </>
          ) : null}
        </Card>
      </ScrollView>
      {editing ? (
        <EventEditor
          event={event}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            back();
          }}
        />
      ) : null}
    </>
  );
}
