package `in`.aiprotect.companion

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.widget.Button
import android.widget.LinearLayout
import java.util.UUID

object LiveReviewFeature {
    fun offer(id: String, direction: String) = LiveReviewCoordinator.eligible(id, direction)
    fun reviewIntent(context: Context) = Intent(context, LiveReviewActivity::class.java)
    fun installControls(activity: Activity, root: LinearLayout) {
        root.addView(Button(activity).apply {
            text = "Experimental live review"
            setOnClickListener {
                if (!LiveReviewCoordinator.active) offer(UUID.randomUUID().toString(), "unknown")
                activity.startActivity(reviewIntent(activity))
            }
        })
    }
    fun openReview() = LiveReviewCoordinator.openReview()
    fun canSaveReviews() = !LiveReviewCoordinator.active && !LiveReviewCoordinator.hasUnreadReview
}
