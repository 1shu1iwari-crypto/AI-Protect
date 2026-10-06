package `in`.aiprotect.companion

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import java.util.UUID

object LiveReviewFeature {
    fun offer(id: String, direction: String) = LiveReviewCoordinator.eligible(id, direction)
    fun reviewIntent(context: Context) = Intent(context, AudioReviewActivity::class.java)
    fun installControls(activity: Activity, root: LinearLayout) {
        root.addView(Button(activity).apply {
            text = "Record or upload a call · review afterward"
            setOnClickListener { activity.startActivity(reviewIntent(activity)) }
        })
        root.addView(Button(activity).apply {
            text = "Real-time review (experimental)"
            setOnClickListener {
                if (AudioReviewState.active) Toast.makeText(activity, "Finish the audio review first.", Toast.LENGTH_LONG).show()
                else {
                    if (!LiveReviewCoordinator.active) offer(UUID.randomUUID().toString(), "unknown")
                    activity.startActivity(Intent(activity, LiveReviewActivity::class.java))
                }
            }
        })
    }
    fun openReview(): Boolean {
        if (AudioReviewState.active) return false
        val audioUnread = AudioReviewState.consumeUnread()
        return LiveReviewCoordinator.openReview() || audioUnread
    }
    fun canSaveReviews() = !LiveReviewCoordinator.active && !LiveReviewCoordinator.hasUnreadReview && !AudioReviewState.active && !AudioReviewState.unread
}
