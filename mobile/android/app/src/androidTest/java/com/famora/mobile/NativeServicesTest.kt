package com.famora.mobile

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.ParcelFileDescriptor
import org.junit.Before
import org.junit.After
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.StaleObjectException
import org.junit.Assert.*
import org.junit.Test
import org.junit.Assume.assumeTrue
import org.junit.runner.RunWith
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import android.util.Base64
import java.security.MessageDigest

@RunWith(AndroidJUnit4::class)
class NativeServicesTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val context = instrumentation.targetContext
  @After fun captureDeviceEvidence() {
    val device = UiDevice.getInstance(instrumentation)
    device.takeScreenshot(File(context.getExternalFilesDir(null), "native-last.png"))
    device.dumpWindowHierarchy(File(context.getExternalFilesDir(null), "native-hierarchy.xml"))
  }
  private fun clickFresh(device: UiDevice, selector: BySelector) {
    val deadline = System.currentTimeMillis() + 15000
    while (System.currentTimeMillis() < deadline) {
      device.waitForIdle()
      try {
        val target = device.wait(Until.findObject(selector), 1000)
        if (target != null) { target.click(); return }
      } catch (_: StaleObjectException) {
        // React may replace accessibility nodes while its initial data resolves.
      }
    }
    fail("Native control did not become available: $selector")
  }

  @Before fun prepareTestDevice() {
    val device = UiDevice.getInstance(instrumentation)
    device.wakeUp()
    device.pressHome()
    // Only the debuggable test APK declares LAN access, for its isolated backend.
    if (Build.VERSION.SDK_INT >= 37) {
      ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand("pm grant ${context.packageName} android.permission.ACCESS_LOCAL_NETWORK")).use { it.readBytes() }
    }
  }

  @Test fun pkceUsesRandomVerifierAndSha256Challenge() {
    try {
      val (verifier, challenge) = FamoraNativeModule.createPKCEPair(context)
      assertEquals(43, verifier.length)
      assertEquals(43, challenge.length)
      val expected = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
      assertEquals(expected, challenge)
      assertEquals(verifier, FamoraNativeModule.readSecure(context, "famora.pkce"))
      assertNotEquals("Sign-in attempts must not reuse their verifier", verifier, FamoraNativeModule.createPKCEPair(context).first)
    } finally { context.getSharedPreferences("famora.encrypted", Context.MODE_PRIVATE).edit().remove("famora.pkce").commit() }
  }

  @Test fun credentialsAreEncryptedWithFreshNonces() {
    val preferences = context.getSharedPreferences("famora.encrypted", Context.MODE_PRIVATE)
    val key = "instrumentation.secure-roundtrip"
    val plaintext = "test-token-${System.nanoTime()}"
    try {
      FamoraNativeModule.writeSecure(context, key, plaintext)
      val firstCiphertext = preferences.getString(key, null)
      assertEquals(plaintext, FamoraNativeModule.readSecure(context, key))
      assertFalse(firstCiphertext!!.contains(plaintext))
      FamoraNativeModule.writeSecure(context, key, plaintext)
      val secondCiphertext = preferences.getString(key, null)
      assertNotEquals("Each write must use a fresh GCM nonce", firstCiphertext, secondCiphertext)
      assertEquals(plaintext, FamoraNativeModule.readSecure(context, key))
      assertNull(FamoraNativeModule.readSecure(context, "$key-missing"))
    } finally { preferences.edit().remove(key).commit() }
  }

  @Test fun launchesStandaloneWithoutMetro() {
    val device = UiDevice.getInstance(instrumentation)
    context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
    assertTrue("Famora should render its native sign-in screen", device.wait(Until.hasObject(By.textContains("Famora")), 45000))
    assertTrue("Connection startup must finish with a usable sign-in control", device.wait(Until.hasObject(By.text("Continue with Google")), 25000))
    val output = File(context.getExternalFilesDir(null), "native-launch.png")
    device.takeScreenshot(output)
    assertFalse("The standalone build must not show a Metro connection error", device.hasObject(By.textContains("Unable to load script")))
  }

  /** Fixture provisioned by the E2E runner; never compiled into the production app. */
  @Test fun authenticatedFixtureCanNavigateNativeWorkspace() {
    val fixture = File(context.filesDir, "native-session.json")
    assumeTrue("Authenticated test requires a disposable E2E session fixture", fixture.exists())
    val data = JSONObject(fixture.readText())
    FamoraNativeModule.writeSecure(context, data.getString("storageKey"), data.get("session").toString())
    FamoraNativeModule.writeSecure(context, "famora.apiBase", data.getString("apiBase"))
    val device = UiDevice.getInstance(instrumentation)
    context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
    assertTrue("Signed-in workspace should open", device.wait(Until.hasObject(By.text("More")), 45000))
    clickFresh(device, By.res("tab-more"))
    assertTrue("Tasks should be available in the tools menu", device.wait(Until.hasObject(By.text("Tasks")), 10000))
    clickFresh(device, By.res("tool-tasks"))
    assertTrue("Task workspace should show its create control", device.wait(Until.hasObject(By.res("workspace-add")), 20000))
    clickFresh(device, By.res("workspace-add"))
    assertTrue("Native editor should open immediately", device.wait(Until.hasObject(By.res("field-title")), 5000))
    val title = "Android E2E task ${System.currentTimeMillis()}"
    device.findObject(By.res("field-title")).text = title
    clickFresh(device, By.res("form-save"))
    assertTrue("Saved task should appear in the native list", device.wait(Until.hasObject(By.text(title)), 30000))
    val session = JSONObject(data.get("session").toString())
    val accessToken = session.getString("access_token")
    var persistedId: String? = null
    val deadline = System.currentTimeMillis() + 30000
    while (persistedId == null && System.currentTimeMillis() < deadline) {
      val connection = URL(data.getString("apiBase") + "/api/mobile/workspace/tasks").openConnection() as HttpURLConnection
      try {
        connection.connectTimeout = 10000; connection.readTimeout = 10000
        connection.setRequestProperty("Authorization", "Bearer $accessToken")
        val payload = JSONObject(connection.inputStream.bufferedReader().readText()).getJSONArray("items")
        for (index in 0 until payload.length()) {
          val item = payload.getJSONObject(index)
          if (item.getString("title") == title) { persistedId = item.getString("id"); break }
        }
      } finally { connection.disconnect() }
      if (persistedId == null) Thread.sleep(400)
    }
    assertNotNull("Task created through the native UI must persist through the authenticated API", persistedId)
    val output = File(context.getExternalFilesDir(null), "native-workspace.png")
    device.takeScreenshot(output)
  }
}
