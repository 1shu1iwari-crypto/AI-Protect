package `in`.aiprotect.companion

import android.net.Uri
import android.os.Looper
import android.telephony.TelephonyManager
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioReviewTest {
    @After fun cleanup() {
        AudioReviewState.fail("reset"); AudioReviewState.consumeUnread(); AudioReviewState.dismiss()
        LiveReviewCoordinator.stop(); LiveReviewCoordinator.dismiss(); LiveReviewCoordinator.connectAccessibility(false)
        File(RuntimeEnvironment.getApplication().noBackupFilesDir, "audio-reports").deleteRecursively()
    }
    @Test fun importConsentNeedsNoAccessibilityAndCannotBeForgedOrReplayed() {
        LiveReviewCoordinator.connectAccessibility(false)
        val token = AudioReviewState.authorize("en", Uri.parse("content://recordings/1"), false)
        assertNull(AudioReviewState.claim("forged"))
        assertNotNull(AudioReviewState.claim(token))
        assertNull(AudioReviewState.claim(token))
    }
    @Test fun expiredConsentAndConcurrentStartsAreRejected() {
        val token = AudioReviewState.authorize("hi", null, false)
        assertThrows(IllegalStateException::class.java) { AudioReviewState.authorize("en", null, false) }
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(11))
        assertNull(AudioReviewState.claim(token)); assertFalse(AudioReviewState.active)
    }
    @Test fun callEndRequiresAnObservedActiveCall() {
        val gate = CallEndGate()
        assertFalse(gate.accept(TelephonyManager.CALL_STATE_IDLE))
        assertFalse(gate.accept(TelephonyManager.CALL_STATE_RINGING))
        assertFalse(gate.accept(TelephonyManager.CALL_STATE_IDLE))
        assertFalse(gate.accept(TelephonyManager.CALL_STATE_OFFHOOK))
        assertTrue(gate.accept(TelephonyManager.CALL_STATE_IDLE))
    }
    @Test fun resamplingPreservesDurationAndConstantAmplitudeAcrossCommonRates() {
        for (rate in listOf(8000, 16000, 44100, 48000)) {
            val output = mutableListOf<Short>(); val converter = Mono16k(rate) { output.add(it) }
            repeat(rate * 2) { converter.sample(500) }
            assertEquals(32000, output.size); assertTrue(output.all { it == 500.toShort() })
        }
    }
    @Test fun silenceIsNeverReportedSafeAndQuietResultIsQualified() {
        assertTrue(AudioVerdict.title(0, "quiet").startsWith("Insufficient"))
        assertTrue(AudioVerdict.title(4, "high").startsWith("Insufficient"))
        assertTrue(AudioVerdict.title(20, "quiet").contains("not a safety guarantee"))
        assertTrue(AudioVerdict.title(20, "high").contains("warning signs"))
    }
    @Test fun spelledCredentialsNormalizeWithoutLosingNegation() {
        assertEquals("do not share otp or cvv", RecognizedText.normalize("do not share o t p or c v v"))
        assertEquals("ओटीपी मत बताओ", RecognizedText.normalize("ओ टी पी मत बताओ"))
    }
    @Test fun analysisOwnsTheReviewUntilCompletionAndUnreadIsConsumedOnce() {
        val token = AudioReviewState.authorize("en", Uri.parse("content://recordings/2"), false)
        assertNotNull(AudioReviewState.claim(token))
        AudioReviewState.update(AudioReviewState.Phase.ANALYZING, "Working")
        assertFalse(LiveReviewFeature.canSaveReviews())
        assertThrows(IllegalStateException::class.java) { AudioReviewState.authorize("en", null, false) }
        AudioReviewState.complete("Done"); assertFalse(AudioReviewState.active)
        assertTrue(AudioReviewState.consumeUnread()); assertFalse(AudioReviewState.consumeUnread())
    }
    @Test fun reportsAreBoundedExpireAndCanBeDeleted() {
        val store = AudioReportStore(RuntimeEnvironment.getApplication())
        val now = System.currentTimeMillis()
        repeat(12) { store.save(JSONObject().put("id", "report-id-$it").put("created", now - 100 + it)) }
        assertEquals(10, store.list().size)
        assertFalse(store.list().any { it.getString("id") == "report-id-0" })
        store.delete("report-id-11"); assertEquals(9, store.list().size)
        store.save(JSONObject().put("id", "expired-report").put("created", now - 86_400_001))
        assertFalse(store.list().any { it.getString("id") == "expired-report" })
    }
    @Test fun authenticityGracefullyDegradesWhenUnreachable() = kotlinx.coroutines.runBlocking {
        val analyzer = OfflineAudioAnalyzer(RuntimeEnvironment.getApplication())
        val dummyPcm = File(RuntimeEnvironment.getApplication().cacheDir, "test.pcm").apply {
            writeBytes(ByteArray(32000))
        }
        val result = analyzer.analyzeAuthenticity(dummyPcm, serverUrl = "http://127.0.0.1:59999")
        assertNull(result)
        dummyPcm.delete()
    }
}
