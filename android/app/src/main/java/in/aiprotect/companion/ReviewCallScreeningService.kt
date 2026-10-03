package `in`.aiprotect.companion

import android.telecom.Call
import android.telecom.CallScreeningService

class ReviewCallScreeningService : CallScreeningService() {
    override fun onScreenCall(details: Call.Details) {
        val direction = when (details.callDirection) {
            Call.Details.DIRECTION_INCOMING -> "incoming"
            Call.Details.DIRECTION_OUTGOING -> "outgoing"
            else -> "unknown"
        }
        val policy = CallReviewPolicy.decide(direction)
        // Respond immediately, before notification work, inside Telecom's 5s budget.
        // Do not silence, reject, suppress logs/notifications, or change normal ringing.
        if (policy.respondAllow) respondToCall(details, CallResponse.Builder()
            .setDisallowCall(false).setRejectCall(false).setSilenceCall(false)
            .setSkipCallLog(false).setSkipNotification(false).build())
        if (policy.offerReview) try { ReviewNotifications.offer(this, direction) } catch (_: Exception) { /* No impact on call. */ }
        // Never read details.handle, contacts, call logs or call audio.
    }
}
