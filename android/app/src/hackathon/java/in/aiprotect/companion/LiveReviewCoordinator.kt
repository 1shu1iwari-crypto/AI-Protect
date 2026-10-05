package `in`.aiprotect.companion

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/** Main-thread, in-memory ownership. A call callback never grants microphone consent. */
object LiveReviewCoordinator {
    enum class Phase { IDLE, ELIGIBLE, STARTING, LISTENING, FINISHED }
    data class State(
        val phase: Phase = Phase.IDLE, val id: String = "", val direction: String = "unknown",
        val severity: String = "quiet", val signals: List<String> = emptyList(),
        val status: String = "Review Call"
    )
    private val mutable = MutableStateFlow(State())
    val state = mutable.asStateFlow()
    private val main = Handler(Looper.getMainLooper())
    private var grant: String? = null
    private var grantedAt = 0L
    private var stopper: (() -> Unit)? = null
    private var unreadReview = false
    val hasUnreadReview get() = unreadReview
    var accessibilityConnected = false
        private set
    val active get() = mutable.value.phase in setOf(Phase.STARTING, Phase.LISTENING)
    private val expiry = Runnable { if (!active) dismiss() }

    fun eligible(id: String, direction: String) {
        if (active || CallReviewPolicy.safeId(id) == null) return
        grant = null
        mutable.value = State(Phase.ELIGIBLE, id, CallReviewPolicy.safeDirection(direction))
        main.removeCallbacks(expiry);main.postDelayed(expiry, 1_200_000)
    }
    fun connectAccessibility(connected: Boolean) {
        accessibilityConnected = connected
        if (!connected && active) stop("Accessibility disabled. Review stopped.")
    }
    fun consent(id: String): String {
        check(!active && accessibilityConnected && mutable.value.id == id && mutable.value.phase == Phase.ELIGIBLE)
        return UUID.randomUUID().toString().also { grant = it;grantedAt = SystemClock.elapsedRealtime() }
    }
    fun begin(token: String?, onStop: () -> Unit): Boolean {
        if (token == null || token != grant || SystemClock.elapsedRealtime() - grantedAt > 10_000 ||
            !accessibilityConnected || active || mutable.value.phase != Phase.ELIGIBLE) return false
        grant = null;stopper = onStop;main.removeCallbacks(expiry)
        mutable.value = mutable.value.copy(phase = Phase.STARTING, status = "Preparing local review…")
        return true
    }
    fun listening() { if (active) mutable.value = mutable.value.copy(phase = Phase.LISTENING, status = "Reviewing · no audio saved") }
    fun risk(severity: String, signals: List<String>) {
        if (active) mutable.value = mutable.value.copy(severity = severity, signals = signals)
    }
    fun markSaved() { unreadReview = true }
    fun stop(reason: String = "Review stopped. Microphone off.") {
        grant = null
        val stop = stopper;stopper = null
        if (active) mutable.value = mutable.value.copy(phase = Phase.FINISHED, status = reason)
        stop?.invoke()
    }
    fun openReview(): Boolean {
        stop()
        val reload = unreadReview;unreadReview = false
        dismiss()
        return reload
    }
    fun dismiss() {
        if (active) return
        main.removeCallbacks(expiry);grant = null;mutable.value = State()
    }
}
