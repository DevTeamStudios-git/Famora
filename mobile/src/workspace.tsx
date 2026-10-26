import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
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
import {
  Button,
  Card,
  Empty,
  ErrorBanner,
  FormModal,
  Input,
  Label,
  Busy,
  Sheet,
  confirmDelete,
  notifyError,
  styles,
  usePalette,
} from './ui';
import { optimisticItem, toMultipart } from './model';
import { download } from './native';
import type { PickedFile, Values, Workspace, WorkspaceItem } from './types';

export function WorkspaceScreen({ kind }: { kind: string }) {
  const path = `workspace/${kind}`;
  const { api, session } = useClient();
  const action = useAction();
  const { data, loading, error, refresh } = useResource<Workspace>(path);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [editor, setEditor] = useState<WorkspaceItem | 'new' | null>(null);
  const [history, setHistory] = useState<WorkspaceItem | null>(null);
  const c = usePalette();
  const config = data?.config || session?.modules[kind];
  const items = (data?.items || []).filter(
    item =>
      `${item.title} ${item.body} ${item.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === 'ALL' || item.values.status === status),
  );
  const save = async (values: Values, files: Record<string, PickedFile>) => {
    const previous = getCached<Workspace>(path);
    const editing = editor && editor !== 'new' ? editor : null;
    const id = editing?.id || `pending-${Date.now()}`;
    if (previous)
      setCached(path, {
        ...previous,
        items: [
          optimisticItem(values, id, editing || undefined),
          ...previous.items.filter(item => item.id !== id),
        ],
      });
    setEditor(null);
    try {
      await api(`${path}${editing ? `/${editing.id}` : ''}`, {
        method: 'POST',
        body: toMultipart(values, files),
      });
      await refresh();
    } catch (problem) {
      if (previous) setCached(path, previous);
      setEditor(editing || 'new');
      notifyError(problem);
    }
  };
  const remove = async (item: WorkspaceItem) => {
    const previous = getCached<Workspace>(path);
    if (previous)
      setCached(path, {
        ...previous,
        items: previous.items.filter(row => row.id !== item.id),
      });
    try {
      await api(`${path}/${item.id}`, { method: 'DELETE' });
      await refresh();
    } catch (problem) {
      if (previous) setCached(path, previous);
      throw problem;
    }
  };
  const vote = async (item: WorkspaceItem, optionId: string) => {
    const previous = getCached<Workspace>(path);
    if (previous)
      setCached(path, {
        ...previous,
        items: previous.items.map(row =>
          row.id === item.id
            ? {
                ...row,
                options: row.options?.map(option =>
                  option.id === optionId
                    ? {
                        ...option,
                        mine: !option.mine,
                        votes: Math.max(
                          0,
                          option.votes + (option.mine ? -1 : 1),
                        ),
                      }
                    : !row.values.isMultipleChoice && option.mine
                    ? {
                        ...option,
                        mine: false,
                        votes: Math.max(0, option.votes - 1),
                      }
                    : option,
                ),
              }
            : row,
        ),
      });
    try {
      await action('vote', item.id, optionId);
      await refresh();
    } catch (problem) {
      if (previous) setCached(path, previous);
      notifyError(problem);
    }
  };
  return (
    <>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={c.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 16 }}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Label large>{config?.title || 'Your workspace'}</Label>
                <Label muted>
                  {kind === 'personal'
                    ? 'Only you can see these notes.'
                    : `${
                        data?.items.length || 0
                      } items in your family workspace`}
                </Label>
              </View>
              {data?.canCreate ? (
                <Button testID="workspace-add" onPress={() => setEditor('new')}>
                  {kind === 'files' || kind === 'memories'
                    ? 'Upload'
                    : '+ Add new'}
                </Button>
              ) : null}
            </View>
            <Input
              label={`Search ${config?.title || 'items'}`}
              placeholder="Search your items"
              value={query}
              onChangeText={setQuery}
            />
            {kind === 'tasks' ? (
              <View style={styles.wrap}>
                {['ALL', 'TODO', 'IN_PROGRESS', 'COMPLETED'].map(value => (
                  <Button
                    key={value}
                    secondary={value !== status}
                    onPress={() => setStatus(value)}
                  >
                    {value.replaceAll('_', ' ')}
                  </Button>
                ))}
              </View>
            ) : null}
            <ErrorBanner
              message={error}
              retry={() => {
                void refresh();
              }}
            />
          </View>
        }
        ListEmptyComponent={
          loading && !data ? (
            <Busy />
          ) : (
            <Empty
              title={query ? 'No matching items' : 'Nothing here yet'}
              body={
                query
                  ? 'Try another search.'
                  : 'Use Add new to create your first item.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={{ opacity: item.pending ? 0.6 : 1 }}>
            {item.mediaType?.startsWith('image/') && item.url ? (
              <Image
                source={{ uri: item.url }}
                accessibilityLabel={item.title}
                style={{ height: 190, borderRadius: 16, width: '100%' }}
              />
            ) : null}
            <Label style={{ fontSize: 19, fontWeight: '500' }}>
              {item.title}
            </Label>
            {item.detail ? <Label muted>{item.detail}</Label> : null}
            {item.body ? <Label>{item.body}</Label> : null}
            {item.pending ? <Label muted>Saving…</Label> : null}
            {item.url ? (
              <Button
                secondary
                onPress={() => {
                  if (item.mediaType?.startsWith('video/'))
                    void Linking.openURL(item.url!).catch(notifyError);
                  else void download(item.url!, item.title).catch(notifyError);
                }}
              >
                {item.mediaType?.startsWith('video/')
                  ? 'Play video'
                  : kind === 'files'
                  ? 'Download file'
                  : 'Open media'}
              </Button>
            ) : null}
            {item.options?.map(option => (
              <Button
                key={option.id}
                secondary={!option.mine}
                disabled={item.body === 'Voting closed'}
                onPress={() => {
                  void vote(item, option.id);
                }}
              >
                {option.mine ? '✓ ' : ''}
                {option.label} · {option.votes}
              </Button>
            ))}
            <View style={styles.wrap}>
              {['personal', 'notebook'].includes(kind) ? (
                <Button quiet onPress={() => setHistory(item)}>
                  Version history
                </Button>
              ) : null}
              {data?.canEdit && item.canEdit !== false && !item.pending ? (
                <Button quiet onPress={() => setEditor(item)}>
                  Edit
                </Button>
              ) : null}
              {data?.canDelete && item.canDelete !== false && !item.pending ? (
                <Button
                  quiet
                  danger
                  onPress={() => confirmDelete(item.title, () => remove(item))}
                >
                  Delete
                </Button>
              ) : null}
            </View>
          </Card>
        )}
      />
      {editor && config ? (
        <FormModal
          key={editor === 'new' ? 'new' : editor.id}
          title={
            editor === 'new'
              ? `New ${config.title.toLowerCase()} item`
              : 'Edit item'
          }
          fields={config.fields}
          values={editor === 'new' ? {} : editor.values}
          members={data?.members}
          editing={editor !== 'new'}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      ) : null}
      {history ? (
        <HistoryModal
          item={history}
          personal={kind === 'personal'}
          canEdit={data?.canEdit || false}
          onClose={() => setHistory(null)}
          onRestore={() => {
            setHistory(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}
function HistoryModal({
  item,
  personal,
  canEdit,
  onClose,
  onRestore,
}: {
  item: WorkspaceItem;
  personal: boolean;
  canEdit: boolean;
  onClose: () => void;
  onRestore: () => void;
}) {
  const { data, error, loading } = useResource<
    { id: string; body: string; createdAt: string }[]
  >(`history/${item.id}/${personal ? 'personal' : 'family'}`);
  const action = useAction();
  return (
    <Sheet title="Note history" onClose={onClose}>
      <ErrorBanner message={error} />
      {loading && !data ? <Busy /> : null}
      {!data?.length && !loading ? (
        <Empty
          title="No saved versions yet"
          body="Earlier note versions appear after you edit this note."
        />
      ) : null}
      {data?.map(version => (
        <Card key={version.id}>
          <Label muted>{new Date(version.createdAt).toLocaleString()}</Label>
          <Label>{version.body}</Label>
          {canEdit ? (
            <Button
              secondary
              onPress={() =>
                Alert.alert(
                  'Restore this version?',
                  'The current note will be saved in version history.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Restore',
                      onPress: () => {
                        void action('note-restore', item.id, version.id, {
                          personal,
                        })
                          .then(onRestore)
                          .catch(notifyError);
                      },
                    },
                  ],
                )
              }
            >
              Restore version
            </Button>
          ) : null}
        </Card>
      ))}
    </Sheet>
  );
}
