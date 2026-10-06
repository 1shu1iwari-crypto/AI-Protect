package `in`.aiprotect.companion

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import android.content.Intent

/** Overlay only: no event subscriptions, window retrieval, gestures, or screen scraping. */
class ReviewAccessibilityService : AccessibilityService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var overlay: LiveRiskOverlay? = null
    override fun onServiceConnected() {
        super.onServiceConnected()
        LiveReviewCoordinator.connectAccessibility(true)
        overlay = LiveRiskOverlay(this)
        scope.launch { combine(LiveReviewCoordinator.state, AudioReviewState.state) { live, audio -> live to audio }.collect { (live, audio) ->
            if (AudioReviewState.active) overlay?.renderAudio(audio) else overlay?.render(live)
        } }
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    private fun cancelRecording() {
        if (AudioReviewState.state.value.phase == AudioReviewState.Phase.RECORDING) runCatching { startService(Intent(this, AudioReviewService::class.java).setAction(AudioReviewService.CANCEL)) }
    }
    override fun onInterrupt() { cancelRecording(); LiveReviewCoordinator.stop("Review interrupted. Microphone off.") }
    override fun onDestroy() {
        cancelRecording()
        LiveReviewCoordinator.connectAccessibility(false)
        scope.cancel();overlay?.close();overlay = null;super.onDestroy()
    }
}
