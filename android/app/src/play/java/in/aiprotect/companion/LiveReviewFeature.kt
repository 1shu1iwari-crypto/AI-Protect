package `in`.aiprotect.companion

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.widget.LinearLayout
import android.widget.Toast

/** Play flavor has no live microphone or accessibility implementation. */
object LiveReviewFeature {
    fun offer(id: String, direction: String) = Unit
    fun reviewIntent(context: Context) = Intent(context, MainActivity::class.java)
    fun installControls(activity: Activity, root: LinearLayout) = Unit
    fun handleAudioShare(activity: Activity, incoming: Intent) {
        Toast.makeText(activity, "Recording review is available in the AI-Protect MVP build.", Toast.LENGTH_LONG).show()
    }
    fun openReview() = false
    fun canSaveReviews() = true
}
