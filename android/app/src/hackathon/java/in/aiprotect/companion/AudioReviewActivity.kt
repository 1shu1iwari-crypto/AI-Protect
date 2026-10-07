package `in`.aiprotect.companion

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class AudioReviewActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var language: Spinner
    private lateinit var automatic: CheckBox
    private lateinit var status: TextView
    private lateinit var record: Button
    private lateinit var upload: Button
    private lateinit var stop: Button
    private lateinit var cancel: Button
    private lateinit var reports: LinearLayout
    private var selected: Uri? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        selected = savedInstanceState?.getString("selected")?.let(Uri::parse)
        if (!AudioReviewState.active) {
            File(noBackupFilesDir, "audio-work").deleteRecursively()
            val marker = File(noBackupFilesDir, "audio-job.json")
            if (marker.exists()) { marker.delete(); AudioReviewState.fail("The previous review was interrupted. Temporary audio deleted. Choose a recording or start again.") }
        }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 32, 24, 32) }
        val scroll = ScrollView(this).apply { addView(root) }; setContentView(scroll)
        scroll.setOnApplyWindowInsetsListener { view, insets -> view.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom); insets }
        fun label(text: String, size: Float = 16f) = TextView(this).apply { this.text = text; textSize = size; setPadding(0, 12, 0, 12); root.addView(this) }
        fun button(text: String, action: () -> Unit) = Button(this).apply { this.text = text; setOnClickListener { action() }; root.addView(this) }
        label("Record now. Review afterward.", 25f)
        label("Record with everyone's awareness, then analyze after the call. Use speakerphone: Android may still silence the microphone or exclude the other caller. You can also choose a recording made by your phone's recorder.")
        label("Offline English (India) and Hindi models are included. Temporary audio stays on this phone and is deleted after analysis or cancellation. No recording is uploaded. Ten-minute / 60 MB limit. Speech recognition can make mistakes.")
        language = Spinner(this).apply { adapter = ArrayAdapter(this@AudioReviewActivity, android.R.layout.simple_spinner_dropdown_item, listOf("English (India)", "Hindi")); root.addView(this) }
        button("Enable floating review shield") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        button("Allow microphone & report notifications") { permissions(true) }
        automatic = CheckBox(this).apply {
            text = "Analyze automatically when an observed SIM call ends (optional)"
            isChecked = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            setOnCheckedChangeListener { _, checked -> if (checked && checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.READ_PHONE_STATE), 704) }
            root.addView(this)
        }
        label("Automatic finish uses phone-state permission for the default SIM only. For WhatsApp, other internet calls or unsupported SIMs, tap Stop & analyze yourself. No contacts, phone numbers or call logs are read.")
        status = label("Ready", 18f)
        record = button("Record & review later") {
            if (permissions(true)) {
                if (!LiveReviewCoordinator.accessibilityConnected) {
                    AlertDialog.Builder(this).setMessage("Enable AI-Protect MVP's floating review shield in Accessibility settings, then return here.")
                        .setPositiveButton("Open settings") { _, _ -> startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }.setNegativeButton("Cancel", null).show()
                } else AlertDialog.Builder(this).setTitle("Start recording?")
                    .setMessage("Make sure participants know about the recording. The microphone records until Stop, detected call end, cancellation, or the ten-minute limit. Audio is temporarily saved privately, then analyzed offline and deleted.")
                    .setPositiveButton("Start recording") { _, _ -> startReview(null) }.setNegativeButton("Cancel", null).show()
            }
        }
        upload = button("Choose a recording to review") {
            if (permissions(false)) startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE), 703)
        }
        stop = button("Stop recording & analyze") { serviceAction(AudioReviewService.FINISH) }
        cancel = button("Cancel & delete temporary audio") { serviceAction(AudioReviewService.CANCEL) }
        button("Open manual reviews") { startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)) }
        label("Recent reports · expire after 24 hours", 20f)
        reports = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; root.addView(this) }
        scope.launch { AudioReviewState.state.collect { state ->
            status.text = state.status
            val busy = AudioReviewState.active || LiveReviewCoordinator.active
            record.isEnabled = !busy; upload.isEnabled = !busy; language.isEnabled = !busy; automatic.isEnabled = !busy
            stop.isEnabled = state.phase == AudioReviewState.Phase.RECORDING; cancel.isEnabled = AudioReviewState.active
            renderReports()
        } }
    }
    private fun permissions(microphone: Boolean): Boolean {
        val needed = mutableListOf<String>()
        if (microphone && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.RECORD_AUDIO)
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.POST_NOTIFICATIONS)
        if (needed.isNotEmpty()) { requestPermissions(needed.toTypedArray(), 702); return false }
        val manager = getSystemService(NotificationManager::class.java)
        if (!manager.areNotificationsEnabled() || listOf(AudioReviewService.CHANNEL, AudioReviewService.REPORTS).any { manager.getNotificationChannel(it)?.importance == NotificationManager.IMPORTANCE_NONE }) {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)); return false
        }
        return true
    }
    private fun startReview(uri: Uri?) {
        if (!permissions(uri == null)) return
        try {
            val consent = AudioReviewState.authorize(if (language.selectedItemPosition == 1) "hi" else "en", uri, automatic.isChecked)
            startForegroundService(Intent(this, AudioReviewService::class.java).putExtra("consent", consent)); selected = null
        } catch (e: Exception) {
            if (AudioReviewState.state.value.phase == AudioReviewState.Phase.STARTING) AudioReviewState.fail("Could not start review. Reopen the app and try again.")
            Toast.makeText(this, e.message ?: "Could not start review", Toast.LENGTH_LONG).show()
        }
    }
    private fun serviceAction(action: String) { if (AudioReviewState.active) startService(Intent(this, AudioReviewService::class.java).setAction(action)) }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 703 && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            if (uri.scheme != "content") return
            selected = uri
            AlertDialog.Builder(this).setTitle("Analyze this recording offline?")
                .setMessage("Use audio you have permission to review. A private temporary copy is analyzed and deleted. The original file stays unchanged. Choose the matching language before importing.")
                .setPositiveButton("Analyze") { _, _ -> startReview(uri) }.setNegativeButton("Cancel") { _, _ -> selected = null }.show()
        }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 704) automatic.isChecked = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        if (requestCode == 702) Toast.makeText(this, "Tap your recording or import button again when permissions are ready.", Toast.LENGTH_LONG).show()
    }
    private fun renderReports() {
        if (!::reports.isInitialized) return
        reports.removeAllViews()
        val items = AudioReportStore(this).list().sortedByDescending { it.optString("id") == intent.getStringExtra("report") }
        if (items.isEmpty()) reports.addView(TextView(this).apply { text = "Your completed reports will appear here." })
        for (report in items) {
            val id = report.getString("id")
            reports.addView(TextView(this).apply {
                val mediaAuth = report.optString("media_authenticity", "")
                val authBadge = when (mediaAuth) {
                    "synthetic_suspected" -> "⚠️ Acoustic Authenticity: Synthetic / voice clone signs suspected\n"
                    "no_strong_synthetic_indication" -> "✓ Acoustic Authenticity: No synthetic manipulation signs found\n"
                    "inconclusive" -> "ℹ Acoustic Authenticity: Inconclusive (audio quality degraded or borderline)\n"
                    else -> ""
                }
                text = report.getString("title") + "\n" +
                    authBadge +
                    report.getString("source") + " · " + report.getInt("words") + " recognized words\n" +
                    report.getJSONArray("signals").let { signals -> (0 until signals.length()).joinToString(", ") { signals.getString(it).replace('_', ' ') } } + "\n" + report.getString("note")
                textSize = 16f; setPadding(0, 24, 0, 8)
            })
            if (report.optBoolean("hasReview")) reports.addView(Button(this).apply {
                text = "Open evidence timeline"; isEnabled = !AudioReviewState.active
                setOnClickListener {
                    val store = ReviewStore(this@AudioReviewActivity); val state = JSONObject(store.read()); state.put("active", id); store.write(state.toString())
                    AudioReviewState.consumeUnread(); LiveReviewCoordinator.markSaved()
                    startActivity(Intent(this@AudioReviewActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                }
            })
            reports.addView(Button(this).apply {
                text = "Delete this report"; isEnabled = !AudioReviewState.active
                setOnClickListener {
                    AudioReportStore(this@AudioReviewActivity).delete(id)
                    val store = ReviewStore(this@AudioReviewActivity); val state = JSONObject(store.read()); val old = state.optJSONArray("reviews") ?: JSONArray()
                    val kept = (0 until old.length()).map { old.getJSONObject(it) }.filter { it.getString("session_id") != id }
                    state.put("reviews", JSONArray(kept)); if (state.optString("active") == id) state.put("active", kept.lastOrNull()?.optString("session_id") ?: JSONObject.NULL)
                    store.write(state.toString()); LiveReviewCoordinator.markSaved(); renderReports()
                }
            })
        }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); renderReports() }
    override fun onResume() { super.onResume(); renderReports() }
    override fun onSaveInstanceState(outState: Bundle) { outState.putString("selected", selected?.toString()); super.onSaveInstanceState(outState) }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
