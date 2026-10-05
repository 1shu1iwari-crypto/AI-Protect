package `in`.aiprotect.companion

import android.os.Looper
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LiveReviewTest {
    @After fun cleanup() { LiveReviewCoordinator.stop();LiveReviewCoordinator.dismiss();LiveReviewCoordinator.connectAccessibility(false) }
    @Test fun callDetectionNeverStartsCaptureAndGrantCannotBeReplayed() {
        LiveReviewCoordinator.eligible("call-12345678", "incoming")
        assertFalse(LiveReviewCoordinator.active)
        assertFalse(LiveReviewCoordinator.begin("forged-token") {})
        LiveReviewCoordinator.connectAccessibility(true)
        val token = LiveReviewCoordinator.consent("call-12345678")
        var stops = 0
        assertTrue(LiveReviewCoordinator.begin(token) { stops++ })
        assertFalse(LiveReviewCoordinator.begin(token) {})
        LiveReviewCoordinator.stop();LiveReviewCoordinator.stop()
        assertEquals(1, stops)
        assertFalse(LiveReviewCoordinator.begin(token) {})
    }
    @Test fun staleConsentAndAccessibilityLossCannotKeepMicrophoneRunning() {
        LiveReviewCoordinator.connectAccessibility(true)
        LiveReviewCoordinator.eligible("call-12345678", "incoming")
        val expired = LiveReviewCoordinator.consent("call-12345678")
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(11))
        assertFalse(LiveReviewCoordinator.begin(expired) {})
        val valid = LiveReviewCoordinator.consent("call-12345678")
        var stopped = false
        assertTrue(LiveReviewCoordinator.begin(valid) { stopped = true })
        LiveReviewCoordinator.connectAccessibility(false)
        assertTrue(stopped);assertFalse(LiveReviewCoordinator.active)
    }
    @Test fun newCallCannotReplaceAnActiveReview() {
        LiveReviewCoordinator.connectAccessibility(true)
        LiveReviewCoordinator.eligible("call-12345678", "incoming")
        val token = LiveReviewCoordinator.consent("call-12345678")
        assertTrue(LiveReviewCoordinator.begin(token) {})
        LiveReviewCoordinator.eligible("call-87654321", "outgoing")
        assertEquals("call-12345678", LiveReviewCoordinator.state.value.id)
        LiveReviewCoordinator.markSaved()
        assertTrue(LiveReviewCoordinator.openReview())
        assertFalse(LiveReviewCoordinator.active)
        assertFalse(LiveReviewCoordinator.openReview())
    }
    @Test fun silenceIsDiscardedAndContinuousSpeechCannotExceedSixSecondChunks() {
        val emitted = mutableListOf<ShortArray>()
        val chunker = SpeechChunker { emitted.add(it) }
        repeat(1000) { chunker.push(ShortArray(320), 320) }
        assertTrue(emitted.isEmpty())
        repeat(1000) { chunker.push(ShortArray(320) { 2000 }, 320) }
        repeat(30) { chunker.push(ShortArray(320), 320) }
        assertTrue(emitted.isNotEmpty())
        assertTrue(emitted.all { it.size <= 96_000 })
        assertEquals(320_000, emitted.sumOf { pcm -> pcm.count { it == 2000.toShort() } })
        chunker.clear()
    }
    @Test fun finalDuplicatesAreSuppressedButLaterRepeatedRequestsRemainEvidence() {
        val aggregator = TranscriptAggregator()
        assertEquals("Share OTP", aggregator.finalPhrase(" Share   OTP ", 1000))
        assertNull(aggregator.finalPhrase("share otp", 1500))
        assertEquals("Share OTP", aggregator.finalPhrase("Share OTP", 5000))
        aggregator.clear()
        assertEquals("Share OTP", aggregator.finalPhrase("Share OTP", 5100))
    }
}
