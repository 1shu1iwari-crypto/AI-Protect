package `in`.aiprotect.companion

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.widget.LinearLayout

/** Play flavor has no live microphone or accessibility implementation. */
object LiveReviewFeature {
    fun offer(id: String, direction: String) = Unit
    fun reviewIntent(context: Context) = Intent(context, MainActivity::class.java)
    fun installControls(activity: Activity, root: LinearLayout) = Unit
    fun openReview() = false
    fun canSaveReviews() = true
}
