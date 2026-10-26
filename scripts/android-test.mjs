import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authenticated = process.argv.includes('--authenticated');
const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  process.env.HOME && path.join(process.env.HOME, 'Library', 'Android', 'sdk'),
  process.env.HOME && path.join(process.env.HOME, 'Android', 'Sdk')].filter(Boolean).find(candidate => existsSync(path.join(candidate, 'platform-tools')));
if (!sdk) throw new Error('Android SDK not found. Set ANDROID_HOME.');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
function command(args, {allowFailure = false, quiet = false, input} = {}) {
  const result = spawnSync(adb, args, {cwd: root, input, encoding: 'utf8', timeout: 180000});
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  if (!allowFailure && (result.error || result.status !== 0)) throw result.error ?? new Error(`adb failed: ${args[0]}`);
  return result.stdout || '';
}
const output = command(['devices'], {quiet: true});
const devices = output.split(/\r?\n/).filter(line => /\tdevice$/.test(line)).map(line => line.split('\t')[0]);
const serial = process.env.FAMORA_ANDROID_SERIAL || devices.find(device => device.startsWith('emulator-')) || (devices.length === 1 ? devices[0] : null);
if (!serial || !devices.includes(serial)) throw new Error('Start an Android emulator or connect a development device. Set FAMORA_ANDROID_SERIAL if more than one device is attached.');
const run = (args, options) => command(['-s', serial, ...args], options);
const appApk = path.join(root, 'mobile/android/app/build/outputs/apk/debug/app-debug.apk');
const testApk = path.join(root, 'mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
if (!existsSync(appApk) || !existsSync(testApk)) throw new Error('Build the app and instrumentation APK first: node scripts/android-apk.mjs --debug --instrumentation');
run(['install', '-r', '-t', appApk]);
run(['install', '-r', '-t', testApk]);
run(['shell', 'pm', 'clear', 'com.famora.mobile']);
const fixture = path.join(root, 'test-results', 'native-session.json');
try {
  if (authenticated) {
    if (!existsSync(fixture)) throw new Error('Authenticated native test fixture is missing. Run the isolated E2E setup with FAMORA_NATIVE_E2E=1.');
    const data = JSON.parse(readFileSync(fixture, 'utf8'));
    if (!data.storageKey || !data.session || !data.apiBase) throw new Error('Native fixture must contain storageKey, session and apiBase.');
    run(['shell', 'run-as', 'com.famora.mobile', 'mkdir', '-p', 'files']);
    // Stream directly into private app storage. Never place credentials in shared /sdcard or /tmp.
    run(['shell', '-T', "run-as com.famora.mobile sh -c 'umask 077; cat > files/native-session.json'"], {input: readFileSync(fixture), quiet: true});
  }
  const className = 'com.famora.mobile.NativeServicesTest' + (authenticated ? '#authenticatedFixtureCanNavigateNativeWorkspace' : '');
  const result = run(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class', className, 'com.famora.mobile.test/androidx.test.runner.AndroidJUnitRunner']);
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed|INSTRUMENTATION_CODE: 0|shortMsg=/.test(result) || !/OK \(\d+ tests?\)/.test(result))
    throw new Error('Android instrumentation did not pass.');
  mkdirSync(path.join(root, 'test-results'), {recursive: true});
  run(['pull', '/sdcard/Android/data/com.famora.mobile/files/' + (authenticated ? 'native-workspace.png' : 'native-launch.png'), path.join(root, 'test-results', authenticated ? 'android-workspace.png' : 'android-launch.png')], {allowFailure: true});
} finally {
  // Keep disposable test credentials out of the emulator after the test.
  run(['shell', 'pm', 'clear', 'com.famora.mobile'], {allowFailure: true, quiet: true});
}
