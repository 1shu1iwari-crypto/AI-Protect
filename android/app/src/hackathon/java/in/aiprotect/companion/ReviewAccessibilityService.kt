package `in`.aiprotect.companion

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect

/** Overlay only: no event subscriptions, window retrieval, gestures, or screen scraping. */
class ReviewAccessibilityService : AccessibilityService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var overlay: LiveRiskOverlay? = null
    override fun onServiceConnected() {
        super.onServiceConnected()
        LiveReviewCoordinator.connectAccessibility(true)
        overlay = LiveRiskOverlay(this)
        scope.launch { LiveReviewCoordinator.state.collect { overlay?.render(it) } }
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() { LiveReviewCoordinator.stop("Review interrupted. Microphone off.") }
    override fun onDestroy() {
        LiveReviewCoordinator.connectAccessibility(false)
        scope.cancel();overlay?.close();overlay = null;super.onDestroy()
    }
}
