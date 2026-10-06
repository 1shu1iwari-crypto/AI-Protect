package `in`.aiprotect.companion

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.WindowManager
import android.widget.*

class LiveRiskOverlay(private val context: Context) {
    private val manager = context.getSystemService(WindowManager::class.java)
    private var root: LinearLayout? = null
    fun render(state: LiveReviewCoordinator.State) {
        close()
        if (state.phase == LiveReviewCoordinator.Phase.IDLE) return
        val panel = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL;setPadding(12, 8, 12, 8);setBackgroundColor(Color.rgb(247,247,243)) }
        val risk = when (state.severity) { "high" -> "🔴 STOP & VERIFY";"warning" -> "🟠 Suspicious pattern";"watch" -> "🟡 Be careful";else -> if (LiveReviewCoordinator.active) "🟢 No strong pattern" else "🛡 Review Call" }
        panel.addView(TextView(context).apply { text = risk;textSize = 17f;setTextColor(Color.BLACK) })
        panel.addView(TextView(context).apply {
            text = if (state.phase == LiveReviewCoordinator.Phase.ELIGIBLE) "Tap to start · microphone off" else state.status
            textSize = 12f;setTextColor(Color.DKGRAY)
        })
        if (state.signals.isNotEmpty()) panel.addView(TextView(context).apply {
            text = state.signals.take(3).joinToString(" + ") { it.replace('_', ' ') } +
                if (state.severity in setOf("high", "warning")) "\nDo not share OTP/PIN. Verify independently." else ""
            textSize = 12f;setTextColor(Color.DKGRAY)
        })
        val controls = LinearLayout(context)
        controls.addView(Button(context).apply {
            text = if (state.phase == LiveReviewCoordinator.Phase.ELIGIBLE) "Review" else "Open review"
            setOnClickListener {
                val target = if (state.phase == LiveReviewCoordinator.Phase.ELIGIBLE) AudioReviewActivity::class.java else MainActivity::class.java
                if (target == MainActivity::class.java) LiveReviewCoordinator.stop()
                context.startActivity(Intent(context, target).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            }
        })
        controls.addView(Button(context).apply {
            text = if (LiveReviewCoordinator.active) "Stop" else "Dismiss"
            setOnClickListener { LiveReviewCoordinator.stop();LiveReviewCoordinator.dismiss() }
        })
        panel.addView(controls)
        val dp = context.resources.displayMetrics.density
        try {
            manager.addView(panel, WindowManager.LayoutParams((270 * dp).toInt(), WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.END;y = (80 * dp).toInt() })
            root = panel
        } catch (_: RuntimeException) { /* Notification remains the fallback. */ }
    }
    fun renderAudio(state: AudioReviewState.State) {
        close()
        val panel = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(12, 8, 12, 8); setBackgroundColor(Color.rgb(247,247,243)) }
        panel.addView(TextView(context).apply { text = state.status; textSize = 15f; setTextColor(Color.BLACK) })
        panel.addView(Button(context).apply {
            text = if (state.phase == AudioReviewState.Phase.RECORDING) "Stop & analyze" else "Open progress"
            setOnClickListener {
                if (state.phase == AudioReviewState.Phase.RECORDING) context.startService(Intent(context, AudioReviewService::class.java).setAction(AudioReviewService.FINISH))
                else context.startActivity(Intent(context, AudioReviewActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            }
        })
        panel.addView(Button(context).apply {
            text = "Cancel & delete"
            setOnClickListener { context.startService(Intent(context, AudioReviewService::class.java).setAction(AudioReviewService.CANCEL)) }
        })
        val dp = context.resources.displayMetrics.density
        try {
            manager.addView(panel, WindowManager.LayoutParams((270 * dp).toInt(), WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.END; y = (80 * dp).toInt() })
            root = panel
        } catch (_: RuntimeException) { /* Foreground notification also provides controls. */ }
    }
    fun close() { root?.let { try { manager.removeView(it) } catch (_: RuntimeException) {} };root = null }
}
