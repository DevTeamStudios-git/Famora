package com.famora.mobile

import android.app.Activity
import android.app.DatePickerDialog
import android.app.DownloadManager
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.*
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Device-only capabilities. Auth credentials never leave Android Keystore-backed storage. */
class FamoraNativeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var picker: Promise? = null
  private var recorder: MediaRecorder? = null
  private var recordingFile: File? = null
  private var recordingStarted: Long = 0

  companion object {
    private const val STORE = "famora.encrypted"
    private const val ALIAS = "famora.session.v1"
    private const val PICK_FILE = 49371
    private fun key(): SecretKey {
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
      return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
        init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
      }.generateKey()
    }
    @Synchronized fun writeSecure(context: Context, name: String, value: String) {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
      val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      val stored = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)
      check(context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putString(name, stored).commit())
    }
    @Synchronized fun readSecure(context: Context, name: String): String? {
      val stored = context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getString(name, null) ?: return null
      val parts = stored.split(":", limit = 2)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
      }
      return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    }
    fun createPKCEPair(context: Context): Pair<String, String> {
      val bytes = ByteArray(32).apply { SecureRandom().nextBytes(this) }
      val flags = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
      val verifier = Base64.encodeToString(bytes, flags)
      val challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)), flags)
      writeSecure(context, "famora.pkce", verifier)
      return Pair(verifier, challenge)
    }
  }

  init {
    context.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_FILE) return
        val promise = picker ?: return
        picker = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) { promise.resolve(null); return }
        try {
          var name = "attachment"
          var size = 0L
          context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
              cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = cursor.getString(it) ?: name }
              cursor.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !cursor.isNull(it) }?.let { size = cursor.getLong(it) }
            }
          }
          if (size > 4 * 1024 * 1024) { promise.reject("FILE_SIZE", "Choose a file smaller than 4 MB."); return }
          // Copy to private cache. Provider read grants can expire when the picker closes.
          val target = File(context.cacheDir, "picked-${System.nanoTime()}-${name.replace(Regex("[^A-Za-z0-9._-]"), "_").takeLast(120)}")
          context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output ->
              val buffer = ByteArray(8192)
              var total = 0L
              while (true) { val count = input.read(buffer); if (count < 0) break; total += count; check(total <= 4 * 1024 * 1024) { "Choose a file smaller than 4 MB." }; output.write(buffer, 0, count) }
            }
          } ?: throw IllegalStateException("Could not open that file.")
          promise.resolve(Arguments.createMap().apply {
            putString("uri", Uri.fromFile(target).toString()); putString("name", name)
            putString("type", context.contentResolver.getType(uri) ?: "application/octet-stream"); putDouble("size", target.length().toDouble())
          })
        } catch (error: Exception) { promise.reject("FILE_PICK", error.message ?: "Could not open that file.") }
      }
    })
  }
  override fun getName() = "FamoraNative"
  @ReactMethod fun getItem(name: String, promise: Promise) { try { promise.resolve(readSecure(context, name)) } catch (error: Exception) { promise.reject("SECURE_READ", "Could not read the saved session.", error) } }
  @ReactMethod fun setItem(name: String, value: String, promise: Promise) { try { writeSecure(context, name, value); promise.resolve(null) } catch (error: Exception) { promise.reject("SECURE_WRITE", "Could not save the session.", error) } }
  @ReactMethod fun removeItem(name: String, promise: Promise) {
    if (context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().remove(name).commit()) promise.resolve(null)
    else promise.reject("SECURE_REMOVE", "Could not clear the saved session.")
  }
  @ReactMethod fun createPKCE(promise: Promise) {
    try {
      val (verifier, challenge) = createPKCEPair(context)
      promise.resolve(Arguments.createMap().apply { putString("verifier", verifier); putString("challenge", challenge) })
    } catch (error: Exception) { promise.reject("PKCE", "Could not start secure sign-in.", error) }
  }
  @ReactMethod fun pickFile(promise: Promise) {
    val activity = context.currentActivity ?: run { promise.reject("NO_ACTIVITY", "Open Famora before choosing a file."); return }
    if (picker != null) { promise.reject("PICKER_BUSY", "A file chooser is already open."); return }
    picker = promise
    activity.runOnUiThread {
      try { activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, PICK_FILE) }
      catch (error: Exception) { picker = null; promise.reject("FILE_PICK", "Could not open the file chooser.", error) }
    }
  }
  @ReactMethod fun pickDateTime(initialISO: String, promise: Promise) {
    val activity = context.currentActivity ?: run { promise.reject("NO_ACTIVITY", "Open Famora before choosing a date."); return }
    val calendar = Calendar.getInstance()
    try {
      val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
      format.parse(initialISO)?.let { calendar.time = it }
    } catch (_: Exception) { }
    activity.runOnUiThread {
      DatePickerDialog(activity, { _, year, month, day ->
        calendar.set(year, month, day)
        TimePickerDialog(activity, { _, hour, minute ->
          calendar.set(Calendar.HOUR_OF_DAY, hour); calendar.set(Calendar.MINUTE, minute); calendar.set(Calendar.SECOND, 0); calendar.set(Calendar.MILLISECOND, 0)
          val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
          promise.resolve(format.format(calendar.time))
        }, calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), false).apply { setOnCancelListener { promise.resolve(null) }; show() }
      }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).apply { setOnCancelListener { promise.resolve(null) }; show() }
    }
  }
  @ReactMethod fun downloadFile(url: String, name: String, mime: String, promise: Promise) {
    try {
      val uri = Uri.parse(url)
      require(uri.scheme == "https") { "Downloads require a secure HTTPS address." }
      val safeName = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").takeLast(160).ifBlank { "Famora-file" }
      val request = DownloadManager.Request(uri).setTitle(safeName).setMimeType(mime.ifBlank { "application/octet-stream" })
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName)
      promise.resolve((context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request).toDouble())
    } catch (error: Exception) { promise.reject("DOWNLOAD", error.message ?: "Could not download that file.") }
  }
  @Suppress("DEPRECATION")
  @ReactMethod fun startRecording(promise: Promise) {
    try {
      check(recorder == null) { "A recording is already in progress." }
      val file = File(context.cacheDir, "voice-${System.currentTimeMillis()}.m4a")
      val device = MediaRecorder()
      recorder = device; recordingFile = file
      device.apply {
        setAudioSource(MediaRecorder.AudioSource.MIC); setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        setAudioEncoder(MediaRecorder.AudioEncoder.AAC); setAudioSamplingRate(44100); setAudioEncodingBitRate(96000)
        setOutputFile(file.absolutePath); setMaxDuration(120000); setMaxFileSize(8 * 1024 * 1024)
        prepare(); start()
      }
      recordingStarted = System.currentTimeMillis(); promise.resolve(null)
    } catch (error: Exception) { recorder?.release(); recorder = null; recordingFile?.delete(); recordingFile = null; promise.reject("RECORDING", "Could not record audio. Check microphone permission.", error) }
  }
  @ReactMethod fun stopRecording(promise: Promise) {
    val device = recorder ?: run { promise.resolve(null); return }
    val file = recordingFile
    recorder = null; recordingFile = null
    try {
      device.stop(); device.release()
      if (file == null || !file.exists() || file.length() == 0L) { promise.resolve(null); return }
      promise.resolve(Arguments.createMap().apply { putString("uri", Uri.fromFile(file).toString()); putString("name", file.name); putString("type", "audio/mp4"); putDouble("size", file.length().toDouble()); putDouble("durationMs", (System.currentTimeMillis() - recordingStarted).coerceAtMost(120000).toDouble()) })
    } catch (error: Exception) { device.release(); file?.delete(); promise.reject("RECORDING", "The recording was too short. Please try again.") }
  }
  override fun invalidate() { recorder?.release(); recorder = null; super.invalidate() }
}
