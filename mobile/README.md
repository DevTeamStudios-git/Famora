# Famora for Android

This is a React Native application built with the community CLI and native Android Gradle project. It does not use Expo or a WebView.

From the repository root, run:

```powershell
npm run android:apk
```

The script installs the locked mobile dependencies when needed, locates Android Studio's SDK and Java runtime, generates the public server address, bundles JavaScript, builds a standalone APK, and copies it to `artifacts/Famora.apk`. The APK opens without a Metro development server. The default server is `https://famora-app-five.vercel.app`.

Android Studio, its Android SDK, the SDK licenses, and Java 17 or newer are required. Set `ANDROID_HOME` and `JAVA_HOME` if they are not installed in the usual locations. Gradle can download missing licensed SDK build tools. The first build also downloads Gradle and Maven dependencies.

To target a different server:

```powershell
$env:FAMORA_API_URL = 'https://your-famora.example'
npm run android:apk
```

For the local Android emulator, use `http://10.0.2.2:3100`. HTTP is allowed only for localhost, loopback and the Android emulator host; remote servers require HTTPS. No service role key or database credential is bundled into the application. The generated file `src/generated/config.ts` contains only the public server origin.

The APK contains arm64 and x86_64 native libraries by default. Override `FAMORA_ANDROID_ARCHS` with a comma-separated subset of `arm64-v8a,x86_64,armeabi-v7a,x86` when needed.

This development APK is signed with the repository's development key. Before Play Store distribution, configure a private release signing key and update the application version. Keep that key and its passwords outside source control.

The Android bridge stores authentication sessions encrypted using an AES/GCM key held by Android Keystore. File selection uses Android's document picker, downloads use DownloadManager, voice messages use MediaRecorder, and date/time selection uses Android dialogs. Google sign-in uses PKCE and the `famora://auth/callback` deep link; authorization remains enforced by the server.

For a standalone debug build suitable for instrumentation:

```powershell
npm run android:apk:debug
```

Native device tests require a running emulator or connected Android development device:

```powershell
node scripts/android-apk.mjs --debug --instrumentation
npm run test:android
```

The authenticated native flow uses the isolated E2E setup's ignored `test-results/native-session.json` fixture. Run `npm run test:android -- --authenticated` while its test server and disposable family remain available. This test creates a task through the actual native editor, verifies persistence through the authenticated API, saves `test-results/android-workspace.png`, and clears the emulator app data afterward. Credentials stay in ignored fixture files and Android's private app storage.
