package `in`.aiprotect.companion

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import java.util.UUID

object ReviewNotifications {
    const val CHANNEL = "call_review"
    fun offer(context: Context, direction: String, simulated: Boolean = false): String {
        val id = UUID.randomUUID().toString()
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Review a call", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "A private review shortcut. Calls are never blocked or analyzed automatically."
            setSound(null, null); enableVibration(false)
        })
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return id
        if (!manager.areNotificationsEnabled()) return id
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("aiprotect://review/$id?direction=${CallReviewPolicy.safeDirection(direction)}")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(if (simulated) "Demo call · Review this call" else "🛡 Review this call")
            .setContentText("Something feels wrong? Tap to choose what to check.")
            .setContentIntent(pending)
            .addAction(Notification.Action.Builder(null, "Review this call", pending).build())
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setTimeoutAfter(1_200_000)
            .build()
        // One recent-call shortcut limits notification fatigue; opened reviews are separate.
        manager.notify(41, notification)
        return id
    }
}
