package `in`.aiprotect.companion

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.speech.SpeechRecognizer
import android.widget.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import java.util.UUID

/** A visible activity is the only place that can mint a one-use capture grant. */
class LiveReviewActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var status: TextView
    private lateinit var start: Button
    private lateinit var language: Spinner
    private var startingHere = false
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!LiveReviewCoordinator.active) {
            val uri = intent.data
            val id = CallReviewPolicy.safeId(uri?.lastPathSegment)
                ?: LiveReviewCoordinator.state.value.id.takeIf { it.isNotBlank() }
                ?: UUID.randomUUID().toString()
            LiveReviewCoordinator.eligible(id, uri?.getQueryParameter("direction") ?: LiveReviewCoordinator.state.value.direction)
        }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL;setPadding(28, 48, 28, 28) }
        root.addView(TextView(this).apply { text = "Start live call review?";textSize = 24f })
        root.addView(TextView(this).apply {
            text = "Experimental sideload feature. After you tap Start Review, AI-Protect temporarily listens to microphone audio and uses on-device speech recognition. Audio and transcripts are not saved; only derived scam signals remain.\n\nUse speakerphone. Earpiece and Bluetooth may not capture the other speaker. Quiet does not mean safe. No call is blocked.\n\nEnable the optional accessibility shield below. It does not read your screen or press dialer buttons. Stop at any time; review ends automatically after 10 minutes. Opening the saved review also stops capture."
            textSize = 16f
        })
        language = Spinner(this).apply { adapter = ArrayAdapter(this@LiveReviewActivity, android.R.layout.simple_spinner_dropdown_item, arrayOf("English (India)", "Hindi (India)")) }
        root.addView(language)
        fun button(label: String, action: () -> Unit) = Button(this).apply { text = label;setOnClickListener { action() };root.addView(this) }
        button("Enable review shield") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        button("Allow microphone & notifications") {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS), 301)
        }
        status = TextView(this).apply { textSize = 16f };root.addView(status)
        start = button("Start Review") { begin() }
        button("Stop Review") { startingHere = false;LiveReviewCoordinator.stop() }
        button("Open saved review / manual signals") {
            LiveReviewCoordinator.stop()
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            finish()
        }
        button("Cancel / close") { startingHere = false;LiveReviewCoordinator.stop();LiveReviewCoordinator.dismiss();finish() }
        setContentView(ScrollView(this).apply { addView(root) })
        scope.launch {
            LiveReviewCoordinator.state.collect { state ->
                status.text = state.status
                start.isEnabled = !LiveReviewCoordinator.active
                language.isEnabled = !LiveReviewCoordinator.active
                if (startingHere && state.phase == LiveReviewCoordinator.Phase.LISTENING) {
                    startingHere = false
                    // Keep the activity in the background. Do not resume MainActivity and end capture.
                    moveTaskToBack(true)
                }
            }
        }
    }
    private fun begin() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED ||
            !getSystemService(NotificationManager::class.java).areNotificationsEnabled()) {
            status.text = "Allow microphone and notifications first, then tap Start Review again.";return
        }
        if (!LiveReviewCoordinator.accessibilityConnected) { status.text = "Enable the review shield in Accessibility, return here, then tap Start Review.";return }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) { status.text = "On-device speech recognition is unavailable. Use manual call signals; no audio was captured.";return }
        if (LiveReviewCoordinator.state.value.phase == LiveReviewCoordinator.Phase.FINISHED)
            LiveReviewCoordinator.eligible(UUID.randomUUID().toString(), "unknown")
        try {
            val token = LiveReviewCoordinator.consent(LiveReviewCoordinator.state.value.id)
            startingHere = true
            startForegroundService(Intent(this, LiveReviewService::class.java)
                .putExtra("consent", token).putExtra("language", if (language.selectedItemPosition == 1) "hi-IN" else "en-IN"))
        } catch (_: Exception) {
            startingHere = false;LiveReviewCoordinator.stop("Could not start microphone review. Try again from this screen.")
            status.text = "Could not start microphone review. No background restart will be attempted."
        }
    }
    override fun onDestroy() { scope.cancel();super.onDestroy() }
}
