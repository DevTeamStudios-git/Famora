import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

export type PickedFile = {
  uri: string;
  name: string;
  type: string;
  size: number;
  durationMs?: number;
};
type NativeServices = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  createPKCE(): Promise<{ verifier: string; challenge: string }>;
  pickFile(): Promise<PickedFile | null>;
  pickDateTime(initialISO: string): Promise<string | null>;
  downloadFile(url: string, name: string, mime: string): Promise<number>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<PickedFile | null>;
};
const bridge: NativeServices = NativeModules.FamoraNative;
const requireNative = () => {
  if (!bridge)
    throw new Error(
      'Famora native services are unavailable. Rebuild the Android application.',
    );
  return bridge;
};
export const secureStorage = {
  getItem: (key: string) => requireNative().getItem(key),
  setItem: (key: string, value: string) => requireNative().setItem(key, value),
  removeItem: (key: string) => requireNative().removeItem(key),
};
export const createPKCE = () => requireNative().createPKCE();
export const pickFile = () => requireNative().pickFile();
export const pickDateTime = (initialISO: string, _dateOnly = false) =>
  requireNative().pickDateTime(initialISO);
export async function downloadFile(
  url: string,
  name: string,
  mime = 'application/octet-stream',
) {
  if (Platform.OS === 'android' && Number(Platform.Version) < 29) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED)
      throw new Error('Allow file storage access to save this download.');
  }
  return requireNative().downloadFile(url, name, mime);
}
export const download = downloadFile;
export async function startRecording() {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED)
      throw new Error('Allow microphone access to record a voice message.');
  }
  return requireNative().startRecording();
}
export const stopRecording = () => requireNative().stopRecording();
