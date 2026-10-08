package `in`.aiprotect.companion

import android.net.Uri
import android.os.SystemClock
import android.telephony.TelephonyManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/** Consent is short lived, one use, process local, and never granted by a call callback. */
object AudioReviewState {
    enum class Phase { IDLE, STARTING, RECORDING, ANALYZING, DONE, ERROR }
    data class State(val phase: Phase = Phase.IDLE, val status: String = "Ready", val id: String = "")
    data class Request(val id: String, val language: String, val uri: Uri?, val autoFinish: Boolean, val source: String)
    private val mutable = MutableStateFlow(State())
    val state = mutable.asStateFlow()
    val active get() = mutable.value.phase in setOf(Phase.STARTING, Phase.RECORDING, Phase.ANALYZING)
    private var pending: Pair<String, Request>? = null
    private var grantedAt = 0L
    var unread = false
        private set
    fun authorize(language: String, uri: Uri?, autoFinish: Boolean, source: String = if (uri == null) "microphone_recording" else "imported_recording"): String {
        check(!active && !LiveReviewCoordinator.active) { "Finish the current review first." }
        require(language in setOf("en", "hi", "auto"))
        require(uri == null || uri.scheme == "content")
        require(source in setOf("microphone_recording", "imported_recording", "shared_recording"))
        require((uri == null) == (source == "microphone_recording"))
        val request = Request(UUID.randomUUID().toString(), language, uri, autoFinish, source)
        val token = UUID.randomUUID().toString()
        pending = token to request; grantedAt = SystemClock.elapsedRealtime()
        mutable.value = State(Phase.STARTING, "Preparing review…", request.id)
        return token
    }
    fun claim(token: String?): Request? {
        val grant = pending ?: return null
        if (token != grant.first) return null
        pending = null
        if (SystemClock.elapsedRealtime() - grantedAt > 10_000) { fail("Consent expired. Tap Start again."); return null }
        return grant.second
    }
    fun update(phase: Phase, status: String) { mutable.value = mutable.value.copy(phase = phase, status = status) }
    fun beginCorrection(id: String) {
        check(!active && !LiveReviewCoordinator.active) { "Finish the current review first." }
        require(CallReviewPolicy.safeId(id) != null)
        pending = null; mutable.value = State(Phase.ANALYZING, "Updating the review from your corrections…", id)
    }
    fun complete(title: String) { pending = null; unread = true; update(Phase.DONE, title) }
    fun fail(message: String) { pending = null; update(Phase.ERROR, message) }
    fun consumeUnread(): Boolean { val result = unread; unread = false; return result }
    fun dismiss() { if (!active) { pending = null; mutable.value = State() } }
}

class CallEndGate {
    private var observedActive = false
    fun accept(state: Int): Boolean {
        if (state == TelephonyManager.CALL_STATE_OFFHOOK) observedActive = true
        return observedActive && state == TelephonyManager.CALL_STATE_IDLE
    }
}
object AudioVerdict {
    fun title(words: Int, severity: String): String = when {
        words < 5 -> "Insufficient speech to assess this recording"
        severity in setOf("high", "warning") -> "Scam warning signs found — verify independently"
        severity == "watch" -> "Some suspicious signs — review the evidence"
        else -> "No strong scam signs found — not a safety guarantee"
    }
}
object RecognizedText {
    fun normalize(text: String): String = text
        .replace(Regex("\\bo\\s+t\\s+p\\b", RegexOption.IGNORE_CASE), "otp")
        .replace(Regex("ओ\\s+टी\\s+पी"), "ओटीपी")
        .replace(Regex("\\bc\\s+v\\s+v\\b", RegexOption.IGNORE_CASE), "cvv")
        .replace(Regex("\\bu\\s+p\\s+i\\b", RegexOption.IGNORE_CASE), "upi")
}
