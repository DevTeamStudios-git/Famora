import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  useAction,
  useClient,
  useResource,
  setCached,
  getCached,
} from './client';
import type { ChatMessage, DMData, PickedFile, Route } from './types';
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
  Busy,
  Avatar,
  confirmDelete,
  notifyError,
  styles,
  usePalette,
} from './ui';
import { download, pickFile, startRecording, stopRecording } from './native';

type ChatData = {
  conversationId: string;
  messages: ChatMessage[];
  pinnedMessages?: ChatMessage[];
  savedMessages?: ChatMessage[];
};
export function ChatScreen() {
  const { data, loading, error, refresh } = useResource<ChatData>(
    'chat',
    10000,
  );
  const { session, api, supabase } = useClient();
  const action = useAction();
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachments, setAttachments] = useState<PickedFile[]>([]);
  const [filter, setFilter] = useState('all');
  const [typing, setTyping] = useState<
    Record<string, { name: string; until: number }>
  >({});
  const c = usePalette();
  const list = useRef<FlatList<ChatMessage>>(null);
  const channelRef = useRef<ReturnType<
    NonNullable<typeof supabase>['channel']
  > | null>(null);
  const can = (key: string) => session?.permissions.includes(key) || false;
  useEffect(() => {
    if (!supabase || !session || !data?.conversationId) return;
    const channel = supabase
      .channel(`family:${session.family.id}:chat`, {
        config: { private: true },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversationId=eq.${data.conversationId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => {
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pinned_messages' },
        () => {
          void refresh();
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.memberId !== session.memberId)
          setTyping(current => ({
            ...current,
            [payload.memberId]: {
              name: payload.displayName,
              until: payload.isTyping ? Date.now() + 5000 : 0,
            },
          }));
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void refresh();
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [
    supabase,
    session?.family.id,
    session?.memberId,
    data?.conversationId,
    refresh,
  ]);
  useEffect(() => {
    const interval = setInterval(
      () =>
        setTyping(current =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, entry]) => entry.until > Date.now(),
            ),
          ),
        ),
      3000,
    );
    return () => clearInterval(interval);
  }, []);
  const type = (value: string) => {
    setBody(value);
    if (
      session?.preferences.privacy?.showPresence !== false &&
      data?.conversationId
    )
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          conversationId: data.conversationId,
          memberId: session?.memberId,
          displayName: session?.user.displayName,
          isTyping: !!value,
        },
      });
  };
  const send = async (attachment?: PickedFile, voice = false) => {
    if ((!body.trim() && !attachment && !attachments.length) || !data || busy)
      return;
    const text = body.trim(),
      previous = getCached<ChatData>('chat');
    const pendingId = `pending-${Date.now()}`;
    const pending: ChatMessage = {
      id: pendingId,
      body:
        text ||
        attachment?.name ||
        attachments.map(file => file.name).join(', '),
      createdAt: new Date().toISOString(),
      sender: {
        memberId: session!.memberId,
        displayName: session!.user.displayName,
      },
      isMine: true,
      reactions: [],
      attachments: [],
      replyTo: reply
        ? { id: reply.id, body: reply.body, sender: reply.sender }
        : undefined,
      pending: true,
      isPinned: false,
      isSavedByMe: false,
    };
    if (previous)
      setCached('chat', {
        ...previous,
        messages: [...previous.messages, pending],
      });
    setBody('');
    const queuedFiles = attachment ? [attachment] : attachments;
    setAttachments([]);
    setReply(null);
    setBusy(true);
    try {
      const uploaded = await Promise.all(
        queuedFiles.map(async file => {
          if (file.size && file.size > 4 * 1024 * 1024)
            throw new Error('Choose a chat file smaller than 4 MB.');
          const form = new FormData();
          form.append('file', {
            uri: file.uri,
            name: file.name,
            type: file.type,
          } as unknown as Blob);
          form.append('voice', String(voice));
          return api<{ path: string; fileName: string }>('chat-upload', {
            method: 'POST',
            body: form,
          });
        }),
      );
      await action('chat-send', undefined, undefined, {
        body: text,
        replyToId: reply?.id || null,
        ...(uploaded.length
          ? voice
            ? {
                voice: {
                  ...uploaded[0],
                  durationMs: attachment?.durationMs || 1000,
                },
              }
            : { attachments: uploaded }
          : {}),
      });
      await refresh();
    } catch (problem) {
      if (previous) setCached('chat', previous);
      setBody(text);
      if (!voice) setAttachments(queuedFiles);
      notifyError(problem);
    } finally {
      setBusy(false);
    }
  };
  const record = async () => {
    try {
      if (recording) {
        setRecording(false);
        const file = await stopRecording();
        if (file) await send(file, true);
      } else {
        await startRecording();
        setRecording(true);
      }
    } catch (problem) {
      setRecording(false);
      notifyError(problem);
    }
  };
  useEffect(
    () => () => {
      if (recording) void stopRecording().catch(() => {});
    },
    [recording],
  );
  const messageAction = async (
    kind: string,
    message: ChatMessage,
    value?: string,
  ) => {
    setSelected(null);
    try {
      await action(`chat-${kind}`, message.id, value);
      await refresh();
    } catch (problem) {
      notifyError(problem);
    }
  };
  const source =
    filter === 'pinned'
      ? data?.pinnedMessages ?? data?.messages
      : filter === 'saved'
      ? data?.savedMessages ?? data?.messages
      : data?.messages;
  const visible = (source || []).filter(
    message =>
      filter === 'all' ||
      (filter === 'pinned' ? message.isPinned : message.isSavedByMe),
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
        <View style={styles.row}>
          <Label large>Family chat</Label>
          <View style={{ flex: 1 }} />
          <Label muted>● Live</Label>
        </View>
        <View style={styles.wrap}>
          {['all', 'pinned', 'saved'].map(value => (
            <Button
              key={value}
              secondary={value !== filter}
              onPress={() => setFilter(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </Button>
          ))}
        </View>
        <ErrorBanner
          message={error}
          retry={() => {
            void refresh();
          }}
        />
      </View>
      <FlatList
        ref={list}
        data={visible}
        keyExtractor={message => message.id}
        contentContainerStyle={{ padding: 20, gap: 13, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={c.primary}
          />
        }
        onContentSizeChange={() => {
          if (filter === 'all') list.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          loading && !data ? (
            <Busy />
          ) : (
            <Empty
              title={
                filter === 'all'
                  ? 'Start the conversation'
                  : `No ${filter} messages`
              }
              body="Your family’s messages will appear here."
            />
          )
        }
        renderItem={({ item: message }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${
              message.sender?.displayName || 'Family member'
            }: ${
              message.deletedAt ? 'Message removed' : message.body
            }. Hold for message options.`}
            onLongPress={() => {
              if (!message.pending && !message.deletedAt) setSelected(message);
            }}
            delayLongPress={350}
            style={{
              maxWidth: '92%',
              alignSelf: message.isMine ? 'flex-end' : 'flex-start',
            }}
          >
            <View
              style={{
                backgroundColor: message.isMine ? c.tint : c.surface,
                borderRadius: 20,
                padding: 14,
                gap: 7,
                opacity: message.pending ? 0.6 : 1,
              }}
            >
              {!message.isMine ? (
                <Text style={{ color: c.primary, fontWeight: '600' }}>
                  {message.sender?.displayName || 'Family member'}
                </Text>
              ) : null}
              {message.replyTo ? (
                <View
                  style={{
                    paddingLeft: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: c.primary,
                  }}
                >
                  <Label muted>
                    {message.replyTo.sender?.displayName || 'Reply'}
                  </Label>
                  <Text
                    numberOfLines={2}
                    style={{ color: c.muted, fontSize: 13 }}
                  >
                    {message.replyTo.body}
                  </Text>
                </View>
              ) : null}
              <Label>
                {message.deletedAt ? 'Message removed' : message.body}
              </Label>
              {!message.deletedAt
                ? message.attachments.map(attachment => (
                    <View key={attachment.id} style={{ gap: 6 }}>
                      {attachment.mimeType.startsWith('image/') &&
                      attachment.url ? (
                        <Image
                          source={{ uri: attachment.url }}
                          accessibilityLabel={attachment.fileName}
                          style={{ width: 220, height: 170, borderRadius: 12 }}
                        />
                      ) : null}
                      <Button
                        secondary
                        onPress={() => {
                          if (!attachment.url) return;
                          if (
                            attachment.mimeType.startsWith('audio/') ||
                            attachment.mimeType.startsWith('video/')
                          )
                            void Linking.openURL(attachment.url).catch(
                              notifyError,
                            );
                          else
                            void download(
                              attachment.url,
                              attachment.fileName,
                              attachment.mimeType,
                            ).catch(notifyError);
                        }}
                      >
                        {attachment.mimeType.startsWith('audio/')
                          ? `▶ Voice message${
                              message.voiceDurationMs
                                ? ` · ${Math.round(
                                    message.voiceDurationMs / 1000,
                                  )}s`
                                : ''
                            }`
                          : attachment.fileName}
                      </Button>
                    </View>
                  ))
                : null}
              <View style={styles.wrap}>
                {message.reactions.map(reaction => (
                  <Button
                    key={reaction.emoji}
                    secondary={!reaction.reactedByMe}
                    quiet={!reaction.reactedByMe}
                    disabled={!can('chat.react')}
                    onPress={() => {
                      void messageAction('react', message, reaction.emoji);
                    }}
                  >
                    {reaction.emoji} {reaction.count}
                  </Button>
                ))}
              </View>
              <Text
                style={{ color: c.muted, fontSize: 11, textAlign: 'right' }}
              >
                {message.isPinned ? 'Pinned · ' : ''}
                {message.isSavedByMe ? 'Saved · ' : ''}
                {message.pending
                  ? 'Sending…'
                  : new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                {message.editedAt ? ' · edited' : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
      {Object.values(typing).length ? (
        <View style={{ paddingHorizontal: 22, paddingBottom: 5 }}>
          <Label muted>
            {Object.values(typing)
              .map(entry => entry.name)
              .join(', ')}{' '}
            typing…
          </Label>
        </View>
      ) : null}
      {can('chat.send') ? (
        <View
          style={{
            padding: 12,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: c.surface,
            gap: 8,
          }}
        >
          {reply ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: c.muted }}>
                  Replying to {reply.sender?.displayName}: {reply.body}
                </Text>
              </View>
              <Button quiet onPress={() => setReply(null)}>
                ×
              </Button>
            </View>
          ) : null}
          {recording ? (
            <Label>● Recording voice message… Tap Stop to send.</Label>
          ) : null}
          {attachments.length ? (
            <View style={styles.wrap}>
              {attachments.map((file, index) => (
                <Button
                  key={`${file.uri}-${index}`}
                  secondary
                  onPress={() =>
                    setAttachments(current =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  {file.name} ×
                </Button>
              ))}
            </View>
          ) : null}
          <View style={[styles.row, { alignItems: 'flex-end' }]}>
            <Button
              quiet
              disabled={busy || recording || attachments.length >= 10}
              onPress={() => {
                void pickFile()
                  .then(file => {
                    if (file) {
                      if (file.size > 4 * 1024 * 1024)
                        throw new Error(
                          'Choose a chat file smaller than 4 MB.',
                        );
                      setAttachments(current => [...current, file]);
                    }
                  })
                  .catch(notifyError);
              }}
            >
              ＋
            </Button>
            <View style={{ flex: 1 }}>
              <Input
                placeholder="Message your family"
                value={body}
                onChangeText={type}
              />
            </View>
            <Button
              disabled={
                busy || recording || (!body.trim() && !attachments.length)
              }
              onPress={() => {
                void send();
              }}
            >
              Send
            </Button>
          </View>
          <Button
            quiet
            disabled={busy || attachments.length > 0}
            onPress={() => {
              void record();
            }}
          >
            {recording ? '■ Stop & send voice' : '◉ Record voice message'}
          </Button>
        </View>
      ) : null}
      {selected ? (
        <Sheet title="Message options" onClose={() => setSelected(null)}>
          <Label>{selected.body}</Label>
          {can('chat.send') ? (
            <Button
              secondary
              onPress={() => {
                setReply(selected);
                setSelected(null);
              }}
            >
              Reply
            </Button>
          ) : null}
          {can('chat.react') ? (
            <View style={styles.wrap}>
              {['👍', '❤️', '😂', '🎉', '😮', '🙏'].map(emoji => (
                <Button
                  key={emoji}
                  secondary
                  onPress={() => {
                    void messageAction('react', selected, emoji);
                  }}
                >
                  {emoji}
                </Button>
              ))}
            </View>
          ) : null}
          <Button
            secondary
            onPress={() => {
              void messageAction('save', selected);
            }}
          >
            {selected.isSavedByMe ? 'Unsave' : 'Save message'}
          </Button>
          {can('chat.pin_any_message') ? (
            <Button
              secondary
              onPress={() => {
                void messageAction('pin', selected);
              }}
            >
              {selected.isPinned ? 'Unpin' : 'Pin message'}
            </Button>
          ) : null}
          {selected.isMine && can('chat.edit_own') ? (
            <Button
              secondary
              onPress={() => {
                setEditing(selected);
                setSelected(null);
              }}
            >
              Edit message
            </Button>
          ) : null}
          {(selected.isMine && can('chat.edit_own')) ||
          can('chat.delete_any_message') ? (
            <Button
              danger
              onPress={() =>
                confirmDelete('this message', () =>
                  messageAction('delete', selected),
                )
              }
            >
              Delete message
            </Button>
          ) : null}
        </Sheet>
      ) : null}
      {editing ? (
        <FormModal
          title="Edit message"
          fields={[
            {
              name: 'body',
              label: 'Message',
              type: 'textarea',
              required: true,
            },
          ]}
          values={{ body: editing.body }}
          onClose={() => setEditing(null)}
          onSave={async values => {
            await action('chat-edit', editing.id, String(values.body));
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function DMScreen({
  id,
  navigate,
}: {
  id?: string;
  navigate: (route: Route) => void;
}) {
  const path = id ? `dms/${id}` : 'dms';
  const { data, loading, error, refresh } = useResource<DMData>(
    path,
    id ? 8000 : 0,
  );
  const { session, supabase } = useClient();
  const action = useAction();
  const [body, setBody] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const c = usePalette();
  const list = useRef<FlatList<DMData['messages'][number]>>(null);
  useEffect(() => {
    if (!id || !supabase) return;
    const channel = supabase
      .channel(`dm:${id}`, { config: { private: true } })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversationId=eq.${id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, supabase, refresh]);
  const send = async () => {
    if (!id || !body.trim() || busy) return;
    const text = body;
    const previous = getCached<DMData>(path);
    if (previous)
      setCached(path, {
        ...previous,
        messages: [
          ...previous.messages,
          {
            id: `pending-${Date.now()}`,
            body: text,
            createdAt: new Date().toISOString(),
            senderMemberId: session!.memberId,
            sender: { user: { displayName: session!.user.displayName } },
          },
        ],
      });
    setBody('');
    setBusy(true);
    try {
      await action('dm-send', id, undefined, { body: text });
      await refresh();
    } catch (problem) {
      if (previous) setCached(path, previous);
      setBody(text);
      notifyError(problem);
    } finally {
      setBusy(false);
    }
  };
  if (!id)
    return (
      <ScrollViewWrapper loading={loading && !!data} refresh={refresh}>
        <Label large>Direct messages</Label>
        <ErrorBanner
          message={error}
          retry={() => {
            void refresh();
          }}
        />
        {session?.permissions.includes('dms.send') ? (
          <Card>
            <Choice
              label="Family member"
              value={target}
              onChange={setTarget}
              options={[
                { value: '', label: 'Choose a member' },
                ...(data?.members || []).map(member => ({
                  value: member.id,
                  label: member.user.displayName,
                })),
              ]}
            />
            <Button
              disabled={!target || busy}
              onPress={() => {
                setBusy(true);
                void action<{ id: string }>('dm-start', target)
                  .then(result => navigate({ name: 'dms', id: result.id }))
                  .catch(notifyError)
                  .finally(() => setBusy(false));
              }}
            >
              Start conversation
            </Button>
          </Card>
        ) : null}
        {loading && !data ? <Busy /> : null}
        {data?.conversations.map(conversation => (
          <Pressable
            key={conversation.id}
            accessibilityRole="button"
            onPress={() => navigate({ name: 'dms', id: conversation.id })}
          >
            <Card>
              <View style={styles.row}>
                <Avatar
                  name={conversation.members
                    .filter(member => member.memberId !== session?.memberId)
                    .map(member => member.member.user.displayName)
                    .join(', ')}
                />
                <Label>
                  {conversation.members
                    .filter(member => member.memberId !== session?.memberId)
                    .map(member => member.member.user.displayName)
                    .join(', ') || 'Conversation'}
                </Label>
              </View>
            </Card>
          </Pressable>
        ))}
        {!loading && !data?.conversations.length ? (
          <Empty
            title="A private place to talk"
            body="Choose a family member to start a conversation."
          />
        ) : null}
      </ScrollViewWrapper>
    );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={{ padding: 16 }}>
        <Label large>
          {data?.conversations
            .find(conversation => conversation.id === id)
            ?.members.filter(member => member.memberId !== session?.memberId)
            .map(member => member.member.user.displayName)
            .join(', ') || 'Direct message'}
        </Label>
        <ErrorBanner
          message={error}
          retry={() => {
            void refresh();
          }}
        />
      </View>
      <FlatList
        ref={list}
        data={data?.messages || []}
        keyExtractor={message => message.id}
        contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: false })
        }
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={c.primary}
          />
        }
        ListEmptyComponent={
          loading && !data ? (
            <Busy />
          ) : (
            <Empty
              title="Say hello"
              body="Only the participants can read this conversation."
            />
          )
        }
        renderItem={({ item: message }) => (
          <View
            style={{
              alignSelf:
                message.senderMemberId === session?.memberId
                  ? 'flex-end'
                  : 'flex-start',
              maxWidth: '88%',
              backgroundColor:
                message.senderMemberId === session?.memberId
                  ? c.tint
                  : c.surface,
              padding: 15,
              borderRadius: 20,
              gap: 5,
            }}
          >
            <Label>{message.body}</Label>
            <Text style={{ color: c.muted, fontSize: 11 }}>
              {message.id.startsWith('pending-')
                ? 'Sending…'
                : new Date(message.createdAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
            </Text>
          </View>
        )}
      />
      {session?.permissions.includes('dms.send') ? (
        <View
          style={[
            styles.row,
            {
              padding: 12,
              backgroundColor: c.surface,
              borderTopWidth: 1,
              borderTopColor: c.line,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Input
              placeholder="Write a private message"
              value={body}
              onChangeText={setBody}
            />
          </View>
          <Button
            disabled={busy || !body.trim()}
            onPress={() => {
              void send();
            }}
          >
            Send
          </Button>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
function ScrollViewWrapper({
  children,
  loading,
  refresh,
}: {
  children: React.ReactNode;
  loading: boolean;
  refresh: () => Promise<void>;
}) {
  const c = usePalette();
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={c.primary}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
