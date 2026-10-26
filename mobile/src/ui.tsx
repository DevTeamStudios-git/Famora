import React, { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Field, PickedFile, Values } from './types';
import { initialValues, validateFields } from './model';
import { pickDateTime, pickFile } from './native';
import { useClient } from './client';

const light = {
  background: '#f0f4f9',
  surface: '#ffffff',
  text: '#1f1f1f',
  muted: '#5f6368',
  line: '#e3e7ed',
  primary: '#0b57d0',
  onPrimary: '#ffffff',
  tint: '#e8f0fe',
  input: '#f3f6fb',
  danger: '#b3261e',
  success: '#146c2e',
  fontScale: 1,
  reducedMotion: false,
  compact: false,
};
const dark = {
  background: '#111318',
  surface: '#1e1f20',
  text: '#e3e3e3',
  muted: '#a9adb4',
  line: '#383b42',
  primary: '#a8c7fa',
  onPrimary: '#062e6f',
  tint: '#263750',
  input: '#282a2c',
  danger: '#ffb4ab',
  success: '#b5e8bb',
  fontScale: 1,
  reducedMotion: false,
  compact: false,
};
type Palette = typeof light;
const ThemeContext = createContext<Palette>(light);
export function AppTheme({ children }: { children: React.ReactNode }) {
  const { session } = useClient();
  const scheme = useColorScheme();
  const mode = session?.preferences.appearance?.theme;
  const base =
    mode === 'dark' || (mode !== 'light' && scheme === 'dark') ? dark : light;
  const accessibility = session?.preferences.accessibility;
  return (
    <ThemeContext.Provider
      value={{
        ...base,
        fontScale: accessibility?.largerText === true ? 1.15 : 1,
        reducedMotion: accessibility?.reducedMotion === true,
        compact: session?.preferences.appearance?.density === 'compact',
        line:
          accessibility?.highContrast === true
            ? base === dark
              ? '#c4c7c5'
              : '#5f6368'
            : base.line,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export const usePalette = () => useContext(ThemeContext);
export function Label({
  children,
  muted = false,
  large = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  large?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const c = usePalette();
  return (
    <Text
      style={[
        {
          color: muted ? c.muted : c.text,
          fontSize: (large ? 24 : 15) * c.fontScale,
          lineHeight: (large ? 31 : 23) * c.fontScale,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  quiet = false,
  danger = false,
  disabled = false,
  testID,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  quiet?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 46,
          borderRadius: 24,
          paddingHorizontal: 19,
          paddingVertical: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: quiet
            ? 'transparent'
            : secondary
            ? c.tint
            : danger
            ? c.danger
            : c.primary,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: quiet
            ? danger
              ? c.danger
              : c.primary
            : secondary
            ? c.primary
            : c.onPrimary,
          fontSize: 14 * c.fontScale,
          fontWeight: '600',
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: 22,
          padding: c.compact ? 14 : 18,
          gap: 11,
          borderWidth: 1,
          borderColor: c.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Input({
  label,
  value,
  onChangeText,
  multiline = false,
  placeholder,
  keyboardType,
  secureTextEntry = false,
  testID,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'url' | 'phone-pad';
  secureTextEntry?: boolean;
  testID?: string;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        accessibilityLabel={label || placeholder}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={
          keyboardType === 'email-address' || keyboardType === 'url'
            ? 'none'
            : 'sentences'
        }
        style={{
          backgroundColor: c.input,
          color: c.text,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16 * c.fontScale,
          minHeight: 48,
          textAlignVertical: multiline ? 'top' : 'center',
          ...(multiline ? { minHeight: 125 } : null),
        }}
      />
    </View>
  );
}
export function ErrorBanner({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const c = usePalette();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: c.tint, padding: 16, borderRadius: 16, gap: 8 }}
    >
      <Text style={{ color: c.danger, lineHeight: 21 }}>{message}</Text>
      {retry ? (
        <Button secondary onPress={retry}>
          Try again
        </Button>
      ) : null}
    </View>
  );
}
export function Empty({
  title = 'Nothing here yet',
  body = 'Add the first item to get started.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <View
      style={{
        paddingVertical: 40,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Label large>{title}</Label>
      <Label muted>{body}</Label>
    </View>
  );
}
export function Busy({ text = 'Loading your family…' }: { text?: string }) {
  const c = usePalette();
  return (
    <View style={{ padding: 34, gap: 16, alignItems: 'center' }}>
      <ActivityIndicator color={c.primary} />
      <Label muted>{text}</Label>
    </View>
  );
}
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const c = usePalette();
  return (
    <Modal
      animationType={c.reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
        <View
          style={[
            styles.row,
            {
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            },
          ]}
        >
          <Text style={{ flex: 1, fontSize: 22, color: c.text }}>{title}</Text>
          <Button quiet onPress={onClose}>
            Close
          </Button>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
export function Avatar({
  name,
  url,
  size = 42,
}: {
  name: string;
  url?: string;
  size?: number;
}) {
  const c = usePalette();
  return url ? (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{ fontSize: size * 0.4, color: c.primary, fontWeight: '600' }}
      >
        {name.trim().slice(0, 1).toUpperCase() || 'F'}
      </Text>
    </View>
  );
}
export function Row({
  title,
  body,
  onPress,
  trailing,
  testID,
}: {
  title: string;
  body?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  testID?: string;
}) {
  const c = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? title : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: c.compact ? 10 : 14,
        minHeight: 46,
        paddingHorizontal: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.65 : 1,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Label>{title}</Label>
        {body ? <Label muted>{body}</Label> : null}
      </View>
      {trailing || onPress ? <Label muted>{trailing || '›'}</Label> : null}
    </Pressable>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${
          options.find(x => x.value === value)?.label || 'Choose'
        }`}
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: c.input,
          borderRadius: 14,
          padding: 15,
          borderWidth: 1,
          borderColor: c.line,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Label>{options.find(x => x.value === value)?.label || 'Choose'}</Label>
        <Label>⌄</Label>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType={c.reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: '#0008',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '75%',
            }}
          >
            <Label large>{label}</Label>
            <ScrollView>
              {options.map(option => (
                <Row
                  key={option.value}
                  title={option.label}
                  trailing={value === option.value ? '✓' : undefined}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                />
              ))}
            </ScrollView>
            <Button quiet onPress={() => setOpen(false)}>
              Cancel
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const c = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        paddingVertical: 5,
      }}
    >
      <View style={{ flex: 1 }}>
        <Label>{label}</Label>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.line }}
        thumbColor={value ? c.onPrimary : c.muted}
      />
    </View>
  );
}
export function FormModal({
  title,
  fields,
  values = {},
  initialFiles = {},
  members = [],
  editing = false,
  submit = 'Save',
  onClose,
  onSave,
}: {
  title: string;
  fields: Field[];
  values?: Values;
  initialFiles?: Record<string, PickedFile>;
  members?: { id: string; name: string }[];
  editing?: boolean;
  submit?: string;
  onClose: () => void;
  onSave: (values: Values, files: Record<string, PickedFile>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => ({
    ...values,
    ...initialValues(fields, values),
  }));
  const [files, setFiles] = useState<Record<string, PickedFile>>(initialFiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = usePalette();
  const change = (name: string, value: string | boolean) =>
    setDraft(current => ({ ...current, [name]: value }));
  const save = async () => {
    const invalid = validateFields(fields, draft, files, editing);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(draft, files);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      animationType={c.reducedMotion ? 'none' : 'slide'}
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <Button quiet onPress={onClose} disabled={busy}>
              Cancel
            </Button>
            <Text
              style={{
                fontSize: 20,
                color: c.text,
                fontWeight: '500',
                flex: 1,
              }}
            >
              {title}
            </Text>
            <Button
              testID="form-save"
              onPress={() => {
                void save();
              }}
              disabled={busy}
            >
              {busy ? 'Saving…' : submit}
            </Button>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 22, gap: 20, paddingBottom: 48 }}
          >
            <ErrorBanner message={error} />
            {fields.map(field => {
              const value = draft[field.name];
              const choices =
                field.choices ||
                (field.name === 'assigneeId'
                  ? [
                      { value: '', label: 'Unassigned' },
                      ...members.map(m => ({ value: m.id, label: m.name })),
                    ]
                  : field.options?.map(option => ({
                      value: option,
                      label: option.replaceAll('_', ' '),
                    })));
              if (field.type === 'checkbox')
                return (
                  <Toggle
                    key={field.name}
                    label={field.label}
                    value={value === true}
                    onChange={next => change(field.name, next)}
                  />
                );
              if (choices && field.multiple)
                return (
                  <View key={field.name} style={{ gap: 6 }}>
                    <Label>{field.label}</Label>
                    {choices.map(option => (
                      <Toggle
                        key={option.value}
                        label={option.label}
                        value={String(value || '')
                          .split(',')
                          .includes(option.value)}
                        onChange={checked =>
                          change(
                            field.name,
                            [
                              ...String(value || '')
                                .split(',')
                                .filter(item => item && item !== option.value),
                              ...(checked ? [option.value] : []),
                            ].join(','),
                          )
                        }
                      />
                    ))}
                  </View>
                );
              if (choices)
                return (
                  <Choice
                    key={field.name}
                    label={field.label}
                    value={String(value ?? '')}
                    options={choices}
                    onChange={next => change(field.name, next)}
                  />
                );
              if (field.type === 'file')
                return (
                  <View key={field.name} style={{ gap: 8 }}>
                    <Label>{field.label}</Label>
                    <Button
                      secondary
                      onPress={() => {
                        void pickFile()
                          .then(file => {
                            if (file)
                              setFiles(current => ({
                                ...current,
                                [field.name]: file,
                              }));
                          })
                          .catch(problem => setError(problem.message));
                      }}
                    >
                      {files[field.name]?.name || 'Choose file'}
                    </Button>
                    {editing ? (
                      <Label muted>Leave empty to keep the current file.</Label>
                    ) : null}
                  </View>
                );
              if (field.type === 'date' || field.type === 'datetime-local')
                return (
                  <View key={field.name} style={{ gap: 6 }}>
                    <Label>{field.label}</Label>
                    <Button
                      secondary
                      onPress={() => {
                        void pickDateTime(
                          String(value || new Date().toISOString()),
                          field.type === 'date',
                        )
                          .then(date => {
                            if (date)
                              change(
                                field.name,
                                field.type === 'date'
                                  ? date.slice(0, 10)
                                  : date,
                              );
                          })
                          .catch(problem => setError(problem.message));
                      }}
                    >
                      {value
                        ? new Date(String(value)).toLocaleString(
                            undefined,
                            field.type === 'date'
                              ? {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                }
                              : undefined,
                          )
                        : 'Choose date'}
                    </Button>
                    {value && !field.required ? (
                      <Button quiet onPress={() => change(field.name, '')}>
                        Clear date
                      </Button>
                    ) : null}
                  </View>
                );
              return (
                <Input
                  key={field.name}
                  testID={`field-${field.name}`}
                  label={`${field.label}${field.required ? ' *' : ''}`}
                  value={String(value ?? '')}
                  onChangeText={next => change(field.name, next)}
                  multiline={field.type === 'textarea'}
                  keyboardType={
                    field.type === 'number'
                      ? 'numeric'
                      : field.type === 'email'
                      ? 'email-address'
                      : field.type === 'url'
                      ? 'url'
                      : 'default'
                  }
                />
              );
            })}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export function confirmDelete(title: string, operation: () => Promise<void>) {
  Alert.alert(
    `Delete ${title}?`,
    'This will remove the item from your family workspace.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void operation().catch(problem =>
            Alert.alert('Could not delete', problem.message),
          );
        },
      },
    ],
  );
}
export function notifyError(problem: unknown) {
  Alert.alert(
    'Could not complete action',
    problem instanceof Error ? problem.message : 'Please try again.',
  );
}
export const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 18 },
});
