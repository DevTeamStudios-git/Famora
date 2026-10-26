import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  FormModal,
  Label,
  Busy,
  Row,
  notifyError,
  styles,
  usePalette,
} from './ui';
import { useClient } from './client';
import { WorkspaceScreen } from './workspace';
import { AgendaScreen, EventScreen } from './agenda';
import { ChatScreen, DMScreen } from './chat';
import {
  AdminScreen,
  HomeScreen,
  MembersScreen,
  NotificationsScreen,
  SearchScreen,
  SettingsScreen,
} from './resources';
import type { Route } from './types';

export default function Famora() {
  const { session, loading, error, login, connect, server } = useClient();
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [serverEditor, setServerEditor] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const c = usePalette();
  const route = stack[stack.length - 1];
  const navigate = (next: Route) =>
    setStack(current => {
      const previous = current[current.length - 1];
      if (
        previous.name === next.name &&
        previous.id === next.id &&
        previous.kind === next.kind &&
        previous.section === next.section
      )
        return current;
      return [...current, next];
    });
  const tab = (name: string) => setStack([{ name }]);
  const back = () =>
    setStack(current => (current.length > 1 ? current.slice(0, -1) : current));
  useEffect(() => {
    setStack([{ name: 'home' }]);
  }, [session?.user.id]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      if (route.name !== 'home') {
        tab('home');
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [stack.length, route.name]);
  const permitted = (permission: string, feature?: string) =>
    !!session?.permissions.includes(permission) &&
    (!feature ||
      session.features.find(flag => flag.key === feature)?.enabled !== false);
  const active =
    route.name === 'workspace'
      ? 'more'
      : ['home', 'chat', 'agenda'].includes(route.name)
      ? route.name
      : 'more';
  const content = () => {
    switch (route.name) {
      case 'home':
        return <HomeScreen navigate={navigate} />;
      case 'workspace':
        return route.kind && session?.modules[route.kind] ? (
          <WorkspaceScreen key={route.kind} kind={route.kind} />
        ) : (
          <Unavailable />
        );
      case 'agenda':
        return permitted('agenda.read', 'agenda') ? (
          <AgendaScreen navigate={navigate} />
        ) : (
          <Unavailable />
        );
      case 'event':
        return route.item ? (
          <EventScreen event={route.item} navigate={navigate} back={back} />
        ) : (
          <Unavailable />
        );
      case 'chat':
        return permitted('chat.read', 'chat') ? (
          <ChatScreen />
        ) : (
          <Unavailable />
        );
      case 'dms':
        return permitted('dms.read', 'dms') ? (
          <DMScreen
            key={route.id || 'list'}
            id={route.id}
            navigate={navigate}
          />
        ) : (
          <Unavailable />
        );
      case 'notifications':
        return permitted('notifications.read') ? (
          <NotificationsScreen navigate={navigate} />
        ) : (
          <Unavailable />
        );
      case 'members':
        return permitted('members.read') ? <MembersScreen /> : <Unavailable />;
      case 'search':
        return <SearchScreen navigate={navigate} />;
      case 'settings':
        return (
          <SettingsScreen
            key={route.section || 'all'}
            section={route.section}
            navigate={navigate}
          />
        );
      case 'admin':
        return permitted('admin_panel.access') ? (
          <AdminScreen
            key={route.section || 'overview'}
            section={route.section}
            navigate={navigate}
          />
        ) : (
          <Unavailable />
        );
      default:
        return (
          <ScrollView contentContainerStyle={styles.content}>
            <Label large>More for your family</Label>
            <Card>
              {Object.entries(session?.modules || {}).map(([kind, tool]) => (
                <Row
                  key={kind}
                  title={tool.title}
                  body={
                    kind === 'personal'
                      ? 'Only you can read these notes'
                      : undefined
                  }
                  onPress={() => navigate({ name: 'workspace', kind })}
                />
              ))}
            </Card>
            <Card>
              {permitted('dms.read', 'dms') ? (
                <Row
                  title="Direct messages"
                  body="Private conversations with your family"
                  onPress={() => navigate({ name: 'dms' })}
                />
              ) : null}
              {permitted('members.read') ? (
                <Row
                  title="Family members"
                  onPress={() => navigate({ name: 'members' })}
                />
              ) : null}
              {permitted('notifications.read') ? (
                <Row
                  title="Notifications"
                  onPress={() => navigate({ name: 'notifications' })}
                />
              ) : null}
              <Row
                title="Search"
                onPress={() => navigate({ name: 'search' })}
              />
              <Row
                title="Settings"
                onPress={() => navigate({ name: 'settings' })}
              />
              {permitted('admin_panel.access') ? (
                <Row
                  title="Family administration"
                  onPress={() =>
                    navigate({ name: 'admin', section: 'overview' })
                  }
                />
              ) : null}
            </Card>
          </ScrollView>
        );
    }
  };
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <StatusBar
        barStyle={c.background === '#111318' ? 'light-content' : 'dark-content'}
      />
      {!session ? (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 28,
            justifyContent: 'center',
            gap: 22,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 22,
              backgroundColor: c.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ fontSize: 38, fontWeight: '700', color: c.onPrimary }}
            >
              F
            </Text>
          </View>
          <Label large>Famora</Label>
          <Text
            style={{
              fontSize: 34,
              lineHeight: 42,
              color: c.text,
              fontWeight: '500',
            }}
          >
            Your family. A little more together.
          </Text>
          <Label muted>
            Plan the week, share the everyday and keep what matters close.
          </Label>
          <ErrorBanner
            message={error}
            retry={() => {
              void connect(server).catch(() => {});
            }}
          />
          {loading ? (
            <Busy text="Connecting to Famora…" />
          ) : (
            <>
              <Button
                disabled={signingIn}
                onPress={() => {
                  setSigningIn(true);
                  void login()
                    .catch(notifyError)
                    .finally(() => setSigningIn(false));
                }}
              >
                {signingIn ? 'Opening Google…' : 'Continue with Google'}
              </Button>
              <Label muted>
                Sign in with an approved family Google account.
              </Label>
              <Button quiet onPress={() => setServerEditor(true)}>
                Server settings
              </Button>
            </>
          )}
        </ScrollView>
      ) : (
        <>
          <View
            style={[
              styles.row,
              { paddingHorizontal: 16, paddingVertical: 10, minHeight: 66 },
            ]}
          >
            {stack.length > 1 ? (
              <Button quiet onPress={back} style={{ paddingHorizontal: 12 }}>
                ‹
              </Button>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Famora home"
              onPress={() => tab('home')}
              style={[styles.row, { flex: 1 }]}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: c.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 23,
                    color: c.onPrimary,
                    fontWeight: '700',
                  }}
                >
                  F
                </Text>
              </View>
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '500' }}>
                Famora
              </Text>
            </Pressable>
            <Button quiet onPress={() => navigate({ name: 'search' })}>
              ⌕
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your profile and settings"
              onPress={() => navigate({ name: 'settings' })}
            >
              <Avatar
                name={session.user.displayName}
                url={session.user.avatarUrl}
                size={38}
              />
            </Pressable>
          </View>
          {error ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <ErrorBanner message={error} />
            </View>
          ) : null}
          <View
            style={{
              flex: 1,
              backgroundColor: c.surface,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              overflow: 'hidden',
            }}
          >
            {content()}
          </View>
          <View
            style={{
              flexDirection: 'row',
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderTopWidth: 1,
              borderTopColor: c.line,
              backgroundColor: c.background,
            }}
          >
            {[
              { key: 'home', label: 'Home', symbol: '⌂', show: true },
              {
                key: 'chat',
                label: 'Chat',
                symbol: '☷',
                show: permitted('chat.read', 'chat'),
              },
              {
                key: 'agenda',
                label: 'Agenda',
                symbol: '▦',
                show: permitted('agenda.read', 'agenda'),
              },
              { key: 'more', label: 'More', symbol: '☰', show: true },
            ]
              .filter(item => item.show)
              .map(item => (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active === item.key }}
                  testID={`tab-${item.key}`}
                  onPress={() => tab(item.key)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 3,
                    paddingVertical: 4,
                  }}
                >
                  <View
                    style={{
                      minWidth: 62,
                      alignItems: 'center',
                      borderRadius: 20,
                      paddingHorizontal: 14,
                      paddingVertical: 4,
                      backgroundColor:
                        active === item.key ? c.tint : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 23,
                        color: active === item.key ? c.primary : c.muted,
                      }}
                    >
                      {item.symbol}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: active === item.key ? '600' : '400',
                      color: active === item.key ? c.primary : c.muted,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
          </View>
        </>
      )}
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
    </SafeAreaView>
  );
}
function Unavailable() {
  return (
    <View style={styles.content}>
      <Label large>This tool is unavailable</Label>
      <Label muted>
        Your family administrator controls access to this tool.
      </Label>
    </View>
  );
}
