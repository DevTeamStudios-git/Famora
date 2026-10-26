import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { Modal, StyleSheet, Text } from 'react-native';
import { AppTheme, FormModal, Label } from '../src/ui';
const mockApi = jest.fn(async (_path: string, _options?: RequestInit) => ({
  success: 'Saved',
}));
const mockClient = {
  api: mockApi,
  session: {
    user: { id: 'user', displayName: 'Test Family', email: 'test@example.com' },
    memberId: 'member',
    family: { id: 'family', name: 'Test family' },
    permissions: [
      'tasks.read',
      'tasks.create',
      'tasks.update',
      'tasks.delete',
      'chat.read',
      'agenda.read',
    ],
    preferences: {} as Record<string, Record<string, string | boolean>>,
    features: [],
    preferenceSections: {},
    modules: {
      tasks: {
        title: 'Tasks',
        path: '/tasks',
        create: 'tasks.create',
        fields: [{ name: 'title', label: 'Title', required: true }],
      },
    },
  },
  error: '',
  loading: false,
  server: 'https://famora.example',
  connect: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refreshSession: jest.fn(),
  supabase: null,
};
let mockColdWorkspace = false;
beforeEach(() => {
  mockColdWorkspace = false;
  mockClient.session.preferences = {};
  mockApi.mockClear();
});
const mockRefresh = jest.fn(async () => {});
jest.mock('../src/client', () => ({
  ClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useClient: () => mockClient,
  useAction: () => jest.fn(),
  getCached: () => undefined,
  setCached: jest.fn(),
  useResource: (path: string | null) => ({
    loading: false,
    error: '',
    refresh: mockRefresh,
    data:
      path === 'workspace/tasks'
        ? mockColdWorkspace
          ? undefined
          : {
              items: [],
              members: [],
              canCreate: true,
              canEdit: true,
              canDelete: true,
              config: mockClient.session.modules.tasks,
            }
        : path === 'agenda'
        ? []
        : undefined,
  }),
}));
jest.mock('../src/native', () => ({
  pickFile: jest.fn(),
  pickDateTime: jest.fn(),
  download: jest.fn(),
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaView: jest.requireActual('react-native').View,
}));

test('accessibility preferences enlarge native text and remove modal motion', async () => {
  let view!: ReactTestRenderer.ReactTestRenderer;
  const content = () => (
    <AppTheme>
      <Label>Readable text</Label>
      <FormModal
        title="Example"
        fields={[]}
        onClose={() => {}}
        onSave={async () => {}}
      />
    </AppTheme>
  );
  await ReactTestRenderer.act(async () => {
    view = ReactTestRenderer.create(content());
  });
  const textSize = () =>
    StyleSheet.flatten(
      view.root
        .findAllByType(Text)
        .find(node => node.props.children === 'Readable text')!.props.style,
    ).fontSize;
  const baseline = textSize();
  expect(view.root.findByType(Modal).props.animationType).toBe('slide');
  mockClient.session.preferences = {
    accessibility: { largerText: true, reducedMotion: true },
  };
  await ReactTestRenderer.act(async () => {
    view.update(content());
  });
  expect(textSize()).toBeGreaterThan(baseline);
  expect(view.root.findByType(Modal).props.animationType).toBe('none');
  await ReactTestRenderer.act(async () => view.unmount());
});

test('native navigation opens Tasks immediately and submits the create form', async () => {
  let view: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    view = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () =>
    view!.root.findByProps({ testID: 'tab-more' }).props.onPress(),
  );
  const taskRow = view!.root.findByProps({ accessibilityLabel: 'Tasks' });
  expect(taskRow).toBeDefined();
  await ReactTestRenderer.act(async () => taskRow!.props.onPress());
  await ReactTestRenderer.act(async () =>
    view!.root.findByProps({ testID: 'workspace-add' }).props.onPress(),
  );
  const title = view!.root
    .findAllByProps({ testID: 'field-title' })
    .find(input => input.props.onChangeText);
  expect(title).toBeDefined();
  await ReactTestRenderer.act(async () =>
    title!.props.onChangeText('Native task'),
  );
  await ReactTestRenderer.act(async () =>
    view!.root.findByProps({ testID: 'form-save' }).props.onPress(),
  );
  expect(mockApi).toHaveBeenCalledWith(
    'workspace/tasks',
    expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
  );
  await ReactTestRenderer.act(async () => view!.unmount());
}, 30000);

test('failed native saves restore the draft and retry the create endpoint', async () => {
  mockApi.mockRejectedValueOnce(new Error('offline'));
  let view!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    view = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'tab-more' }).props.onPress(),
  );
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'tool-tasks' }).props.onPress(),
  );
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'workspace-add' }).props.onPress(),
  );
  const field = () =>
    view.root
      .findAllByProps({ testID: 'field-title' })
      .find(input => input.props.onChangeText)!;
  await ReactTestRenderer.act(async () =>
    field().props.onChangeText('Keep this draft'),
  );
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'form-save' }).props.onPress(),
  );
  expect(field().props.value).toBe('Keep this draft');
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'form-save' }).props.onPress(),
  );
  expect(mockApi.mock.calls.map(call => call[0])).toEqual([
    'workspace/tasks',
    'workspace/tasks',
  ]);
  await ReactTestRenderer.act(async () => view.unmount());
}, 30000);

test('an authorized user can open the create dialog before workspace data arrives', async () => {
  mockColdWorkspace = true;
  let view!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    view = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'tab-more' }).props.onPress(),
  );
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'tool-tasks' }).props.onPress(),
  );
  await ReactTestRenderer.act(async () =>
    view.root.findByProps({ testID: 'workspace-add' }).props.onPress(),
  );
  expect(
    view.root.findAllByProps({ testID: 'field-title' }).length,
  ).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => view.unmount());
}, 30000);
