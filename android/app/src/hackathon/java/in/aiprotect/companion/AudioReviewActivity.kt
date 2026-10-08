package `in`.aiprotect.companion

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.view.View
import android.widget.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Shared recording -> explicit consent -> offline review -> a readable action plan. */
class AudioReviewActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val main = Handler(Looper.getMainLooper())
    private lateinit var language: Spinner
    private lateinit var automatic: CheckBox
    private lateinit var status: TextView
    private lateinit var record: Button
    private lateinit var upload: Button
    private lateinit var stop: Button
    private lateinit var cancel: Button
    private lateinit var reports: LinearLayout
    private var selected: Uri? = null
    private var selectedSource = "imported_recording"
    private var consentDialog: AlertDialog? = null
    private var generation = 0
    private var correction: Job? = null
    private var player: MediaPlayer? = null
    private var tts: TextToSpeech? = null
    private var export: String? = null
    private var installingModel = false
    private val languageCodes get() = if (WhisperModels.ready(this)) listOf("auto", "en", "hi") else listOf("en", "hi")
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun label(root: LinearLayout, value: String, size: Float = 18f): TextView = TextView(this).apply {
        text = value; textSize = size; setTextColor(Color.rgb(30, 46, 41)); setPadding(0, dp(8), 0, dp(8)); root.addView(this)
    }
    private fun button(root: LinearLayout, value: String, action: () -> Unit): Button = Button(this).apply {
        text = value; textSize = 17f; isAllCaps = false; minHeight = dp(52)
        setOnClickListener { action() }; root.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    private fun languagePicker(root: LinearLayout): Spinner = Spinner(this).apply {
        adapter = ArrayAdapter(this@AudioReviewActivity, android.R.layout.simple_spinner_dropdown_item,
            languageCodes.map { when(it) { "auto" -> "Automatic / Hindi + English"; "hi" -> "Hindi"; else -> "English (India)" } })
        minimumHeight = dp(52); root.addView(this)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        selected = savedInstanceState?.getString("selected")?.let(Uri::parse)
        selectedSource = savedInstanceState?.getString("selectedSource") ?: "imported_recording"
        if (!AudioReviewState.active) {
            File(noBackupFilesDir, "audio-work").deleteRecursively()
            val marker = File(noBackupFilesDir, "audio-job.json")
            if (marker.exists()) { marker.delete(); AudioReviewState.fail("The previous review was interrupted. Temporary audio was deleted. Share your recording again.") }
        }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(16), dp(20), dp(24)); setBackgroundColor(Color.rgb(246, 245, 239)) }
        val scroll = ScrollView(this).apply { addView(root) }; setContentView(scroll)
        scroll.setOnApplyWindowInsetsListener { view, insets -> view.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom); insets }
        label(root, "Call recording review", 28f).setTypeface(null, Typeface.BOLD)
        label(root, "Share a suspicious recording from your recorder, WhatsApp or Files. AI-Protect checks it after you tap Analyze.")
        label(root, "Your recording stays on this phone. The temporary copy is deleted after review. Your original is unchanged.", 16f)
        language = languagePicker(root)
        upload = button(root, "Choose a recording") {
            if (!AudioReviewState.active) startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE), PICK_AUDIO)
        }
        status = label(root, "Ready · up to 10 minutes / 60 MB", 19f)
        status.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        stop = button(root, "Stop recording & analyze") { serviceAction(AudioReviewService.FINISH) }
        cancel = button(root, "Cancel review & delete temporary audio") {
            correction?.cancel(); serviceAction(AudioReviewService.CANCEL)
        }
        val options = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        button(root, "More options") { options.visibility = if (options.visibility == View.GONE) View.VISIBLE else View.GONE }
        root.addView(options)
        button(options, "Allow report notifications") {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATIONS)
            else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        label(options, "Notifications are optional. You can always read the result here.", 16f)
        record = button(options, "Record a call & review afterward") { offerRecording() }
        button(options, "Enable the floating review shield") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        automatic = CheckBox(this).apply {
            text = "Finish recording when an observed SIM call ends"; textSize = 16f
            isChecked = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            setOnCheckedChangeListener { _, checked -> if (checked && checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.READ_PHONE_STATE), PHONE_STATE) }
            options.addView(this)
        }
        label(options, "Recording needs participant awareness, microphone access and the floating shield. Use speakerphone. Android may exclude the other caller. For WhatsApp or unsupported SIMs, tap Stop yourself. Importing a recording needs none of these permissions.", 16f)
        if (WhisperNative.available) button(options, "Add a multilingual offline speech model") {
            if (!installingModel && !AudioReviewState.active && !LiveReviewCoordinator.active) startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE), PICK_MODEL)
        }
        button(root, "Open other reviews") { startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)) }
        label(root, "Recent results · deleted after 24 hours", 22f)
        reports = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; root.addView(this) }
        scope.launch { AudioReviewState.state.collect { state ->
            status.text = state.status
            refreshControls()
            stop.visibility = if (state.phase == AudioReviewState.Phase.RECORDING) View.VISIBLE else View.GONE
            cancel.visibility = if (AudioReviewState.active) View.VISIBLE else View.GONE
            renderReports()
        } }
        if (AudioShareReceiver.isAudioShare(intent)) acceptShare(intent)
        else selected?.let { offerImport(it, selectedSource) }
    }
    private fun acceptShare(incoming: Intent) {
        val uri = AudioShareReceiver.uri(incoming)
        if (uri == null) { showError("No readable recording was attached. Share one audio file from your recorder or Files app."); return }
        offerImport(uri, "shared_recording")
    }
    private fun offerImport(uri: Uri, source: String) {
        if (installingModel || AudioReviewState.active || LiveReviewCoordinator.active) { showError("Finish the current setup or review, then share this recording again."); return }
        selected = uri; selectedSource = source; generation++
        val current = generation; consentDialog?.dismiss()
        scope.launch {
            try {
                val details = withContext(Dispatchers.IO) { AudioImportCoordinator(this@AudioReviewActivity).details(uri) }
                if (current != generation) return@launch
                val body = LinearLayout(this@AudioReviewActivity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), 0, dp(24), dp(8)) }
                label(body, "Use a recording you have permission to review. We make a private temporary copy and delete it after analysis. No audio is uploaded.")
                details.bytes?.let { label(body, "Recording size: %.1f MB".format(it / (1024.0 * 1024)), 16f) }
                val picker = languagePicker(body).apply { setSelection(language.selectedItemPosition) }
                consentDialog = AlertDialog.Builder(this@AudioReviewActivity).setTitle("Analyze this recording?").setView(body)
                    .setPositiveButton("Analyze this recording") { _, _ -> language.setSelection(picker.selectedItemPosition); startReview(uri, source) }
                    .setNegativeButton("Cancel") { _, _ -> selected = null }.setOnCancelListener { selected = null }.show()
            } catch (_: SecurityException) { selected = null; showError("The recording is no longer readable. Share it again from your recorder or Files app.") }
            catch (error: Exception) { if (error is CancellationException) throw error; selected = null; showError(error.message ?: "Could not read this recording. Share a local audio file again.") }
        }
    }
    private fun offerRecording() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MICROPHONE); return
        }
        if (!LiveReviewCoordinator.accessibilityConnected) {
            AlertDialog.Builder(this).setMessage("Enable AI-Protect's floating review shield, then return here.")
                .setPositiveButton("Open settings") { _, _ -> startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }.setNegativeButton("Cancel", null).show(); return
        }
        AlertDialog.Builder(this).setTitle("Start recording?")
            .setMessage("Make sure participants know about the recording. The microphone records until Stop, detected call end, cancellation or ten minutes. Analysis starts afterward; temporary audio is deleted.")
            .setPositiveButton("Start recording") { _, _ -> startReview(null, "microphone_recording") }.setNegativeButton("Cancel", null).show()
    }
    private fun startReview(uri: Uri?, source: String) {
        try {
            check(!installingModel) { "Wait for speech model setup to finish." }
            val code = languageCodes[language.selectedItemPosition]
            val consent = AudioReviewState.authorize(code, uri, automatic.isChecked, source)
            val request = Intent(this, AudioReviewService::class.java).putExtra("consent", consent)
            if (uri != null) { request.clipData = ClipData.newRawUri("Recording", uri); request.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            stopPlayback(); tts?.stop(); startForegroundService(request); selected = null
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                Toast.makeText(this, "Your result will appear here. Enable notifications in More options for a background alert.", Toast.LENGTH_LONG).show()
        } catch (error: Exception) {
            if (AudioReviewState.state.value.phase == AudioReviewState.Phase.STARTING) AudioReviewState.fail("Could not start review. Share your recording again.")
            showError(error.message ?: "Could not start review.")
        }
    }
    private fun serviceAction(action: String) { if (AudioReviewState.active && correction == null) startService(Intent(this, AudioReviewService::class.java).setAction(action)) }
    private fun refreshControls() {
        val busy = installingModel || AudioReviewState.active || LiveReviewCoordinator.active
        record.isEnabled = !busy; upload.isEnabled = !busy; language.isEnabled = !busy; automatic.isEnabled = !busy
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK) { if (requestCode == EXPORT) export = null; return }
        val uri = data?.data ?: return
        when (requestCode) {
            PICK_AUDIO -> offerImport(uri, "imported_recording")
            PICK_MODEL -> scope.launch {
                val selectedLanguage = languageCodes.getOrNull(language.selectedItemPosition) ?: "en"
                try {
                    check(!installingModel && !AudioReviewState.active && !LiveReviewCoordinator.active)
                    installingModel = true; refreshControls(); status.text = "Adding offline languages…"
                    withContext(Dispatchers.IO) { WhisperModels.install(this@AudioReviewActivity, uri) }
                    language.adapter = languagePicker(LinearLayout(this@AudioReviewActivity)).adapter
                    language.setSelection(languageCodes.indexOf(selectedLanguage).coerceAtLeast(0)); status.text = "Multilingual offline speech is ready."
                } catch (error: Exception) { if (error is CancellationException) throw error; showError(error.message ?: "Could not add the speech model.") }
                finally { installingModel = false; refreshControls() }
            }
            EXPORT -> { val value = export; export = null; if (value != null) scope.launch {
                try { withContext(Dispatchers.IO) { contentResolver.openOutputStream(uri)?.use { it.write(value.toByteArray()) } ?: error("Choose a writable location.") } }
                catch (_: Exception) { showError("Could not export. Choose a writable location.") }
            } }
        }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PHONE_STATE) automatic.isChecked = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        if (requestCode == MICROPHONE && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) offerRecording()
    }
    private fun renderReports() {
        if (!::reports.isInitialized) return
        reports.removeAllViews()
        val items = AudioReportStore(this).list().sortedByDescending { it.optString("id") == intent.getStringExtra("report") }
        if (items.isEmpty()) label(reports, "Your completed review will appear here.", 16f)
        for (report in items) {
            val id = report.getString("id"); val verdict = report.optJSONObject("verdict")
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(12), dp(16), dp(16))
                background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(16).toFloat(); setStroke(dp(1), Color.rgb(218, 224, 216)) }
                reports.addView(this, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(16) })
            }
            label(card, report.getString("title"), 23f).setTypeface(null, Typeface.BOLD)
            if (verdict != null) {
                val risk = when(verdict.getString("financial_risk")) { "high" -> "High risk"; "watch" -> "Needs review"; "inconclusive" -> "Inconclusive"; else -> "No strong signs found" }
                val voice = when(verdict.optString("voice_authenticity")) { "synthetic_suspected" -> "Synthetic speech suspected"; "no_strong_synthetic_indication" -> "No strong synthetic indication; identity remains unverified"; else -> "Inconclusive" }
                label(card, "Financial request: $risk\nVoice authenticity: $voice\nCaller identity: Not verified")
                val factors = verdict.optJSONArray("factors") ?: JSONArray()
                if (factors.length() > 0) label(card, "What we noticed\n" + (0 until factors.length()).joinToString("\n") { "• " + factors.getString(it) })
                val plan = verdict.getJSONObject("action_plan")
                label(card, plan.getString("title"), 21f).setTypeface(null, Typeface.BOLD)
                val steps = plan.getJSONArray("steps")
                label(card, (0 until steps.length()).joinToString("\n\n") { steps.getString(it) })
                label(card, "Did you already send money?", 18f)
                val money = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; card.addView(this) }
                for ((title, payment) in listOf("No" to "not_sent", "Yes" to "sent")) money.addView(Button(this).apply {
                    text = title; textSize = 18f; isAllCaps = false; isEnabled = !AudioReviewState.active
                    setOnClickListener { updatePayment(report, payment) }
                }, LinearLayout.LayoutParams(0, -2, 1f))
                if (plan.getString("payment_status") == "sent") button(card, "Call 1930") { openRoute("tel:1930") }
                val routes = plan.getJSONArray("routes")
                for (i in 0 until routes.length()) {
                    val route = routes.getJSONObject(i)
                    if (!route.getString("url").startsWith("tel:")) button(card, route.getString("label")) { openRoute(route.getString("url")) }
                }
                button(card, "Hear this explanation") { speak(report) }
                button(card, "Share summary with someone I trust") {
                    val summary = report.getString("title") + "\nCaller identity: Not verified\nVoice authenticity: $voice\n" +
                        (0 until factors.length()).joinToString("\n") { factors.getString(it) } + "\n\n" + (0 until steps.length()).joinToString("\n") { steps.getString(it) }
                    startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, summary), "Choose someone you trust"))
                }
                val limits = verdict.optJSONArray("limitations") ?: JSONArray()
                label(card, (0 until limits.length()).joinToString("\n") { limits.getString(it) }, 15f)
                label(card, "Speech model: ${verdict.optString("asr_model")} · ${verdict.optString("language")} · ${report.getInt("words")} words", 14f)
                if (AudioTranscriptPreview.get(id) != null) button(card, "Check or correct the recognized speech") { showTranscript(report) }
                else label(card, "The speech preview has been cleared. Share the original again to inspect it.", 15f)
            }
            label(card, report.getString("note"), 15f)
            if (report.optBoolean("hasReview")) button(card, "Open evidence timeline") {
                if (AudioReviewState.active) return@button
                val store = ReviewStore(this); val state = JSONObject(store.read()); val saved = state.optJSONArray("reviews") ?: JSONArray()
                if ((0 until saved.length()).none { saved.getJSONObject(it).getString("session_id") == id }) {
                    showError("This timeline has expired. The redacted result is still shown here."); return@button
                }
                state.put("active", id); store.write(state.toString())
                AudioReviewState.consumeUnread(); LiveReviewCoordinator.markSaved()
                startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            }
            button(card, "Export redacted report") {
                export = report.toString(2)
                startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, "AI-Protect-call-review.json"), EXPORT)
            }
            button(card, "Delete this report") {
                if (AudioReviewState.active) return@button
                stopPlayback(); AudioTranscriptPreview.delete(id); AudioReportStore(this).delete(id)
                val store = ReviewStore(this); val state = JSONObject(store.read()); val old = state.optJSONArray("reviews") ?: JSONArray()
                val kept = (0 until old.length()).map { old.getJSONObject(it) }.filter { it.getString("session_id") != id }
                state.put("reviews", JSONArray(kept)); if (state.optString("active") == id) state.put("active", kept.lastOrNull()?.optString("session_id") ?: JSONObject.NULL)
                store.write(state.toString()); LiveReviewCoordinator.markSaved(); renderReports()
            }
        }
    }
    private fun updatePayment(report: JSONObject, payment: String) {
        if (AudioReviewState.active) return
        scope.launch {
            try {
                val plan = AudioEvidenceBridge.plan(this@AudioReviewActivity, report.getString("id"), payment)
                AudioReviewResult.updatePlan(this@AudioReviewActivity, report, plan); renderReports()
            } catch (error: Exception) { if (error is CancellationException) throw error; showError("Could not update the plan. Contact your bank and call 1930 promptly if money was sent.") }
        }
    }
    private fun time(ms: Long) = "%d:%02d".format(ms / 60000, ms / 1000 % 60)
    private fun showTranscript(report: JSONObject) {
        if (AudioReviewState.active) return
        val id = report.getString("id"); val entry = AudioTranscriptPreview.get(id) ?: return
        val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), 0, dp(20), dp(16)) }
        val edits = mutableListOf<Pair<EditText, Spinner>>()
        label(body, "Check important words, especially requests, refusals and amounts. No speaker is identified automatically. Mark your own speech as Me to exclude it from the financial request.", 16f)
        for (segment in entry.transcript.segments) {
            label(body, "${time(segment.startMs)}–${time(segment.endMs)} · ${segment.language}", 16f)
            val text = EditText(this).apply { setText(segment.text); textSize = 18f; body.addView(this) }
            val speaker = Spinner(this).apply {
                adapter = ArrayAdapter(this@AudioReviewActivity, android.R.layout.simple_spinner_dropdown_item, listOf("Speaker unknown", "Other person", "Me"))
                setSelection(listOf("unknown", "other", "me").indexOf(segment.speaker).coerceAtLeast(0)); body.addView(this)
            }
            edits.add(text to speaker)
            entry.original?.let { original -> button(body, "Play original at ${time(segment.startMs)}") { replay(original, segment) } }
        }
        button(body, "Stop playback") { stopPlayback() }
        val scroll = ScrollView(this).apply { addView(body) }
        AlertDialog.Builder(this).setTitle("Recognized speech · local preview").setView(scroll)
            .setNegativeButton("Close") { _, _ -> stopPlayback() }
            .setPositiveButton("Use corrected words") { _, _ ->
                stopPlayback()
                val corrected = entry.transcript.copy(segments = entry.transcript.segments.mapIndexedNotNull { i, segment ->
                    val value = edits[i].first.text.toString().trim()
                    if (value.isBlank()) null else segment.copy(text = value, speaker = listOf("unknown", "other", "me")[edits[i].second.selectedItemPosition], userReviewed = true)
                })
                try { AudioReviewState.beginCorrection(id) } catch (error: Exception) { showError(error.message ?: "Finish the current review first."); return@setPositiveButton }
                correction = scope.launch {
                    try {
                        val response = AudioEvidenceBridge.analyze(this@AudioReviewActivity, id, corrected, report.getJSONObject("authenticity"), report.getJSONObject("verdict").getJSONObject("action_plan").getString("payment_status"))
                        AudioReviewResult.save(this@AudioReviewActivity, id, corrected.source, response)
                        AudioTranscriptPreview.put(id, corrected, entry.original); AudioReviewState.complete(response.getJSONObject("verdict").getString("headline"))
                    } catch (error: Exception) {
                        AudioReviewState.fail(if (error is CancellationException) "Correction cancelled. The previous report was kept." else "Correction could not finish. The previous report was kept.")
                    } finally { correction = null }
                }
            }.setOnCancelListener { stopPlayback() }.show()
    }
    private fun replay(uri: Uri, segment: TranscriptSegment) {
        stopPlayback()
        try {
            player = MediaPlayer().apply {
                setDataSource(this@AudioReviewActivity, uri)
                setOnPreparedListener { media -> media.seekTo(segment.startMs.toInt()); media.start(); main.postDelayed({ if (player === media) stopPlayback() }, segment.endMs - segment.startMs + 250) }
                setOnErrorListener { _, _, _ -> stopPlayback(); showError("The original is no longer readable. Share it again to replay it."); true }
                prepareAsync()
            }
        } catch (_: Exception) { stopPlayback(); showError("Could not play this recording. Share the original again.") }
    }
    private fun stopPlayback() { player?.let { runCatching { it.stop() }; it.release() }; player = null }
    private fun speak(report: JSONObject) {
        tts?.stop(); tts?.shutdown()
        val verdict = report.optJSONObject("verdict") ?: return
        val hindi = verdict.optString("language").startsWith("hi")
        val words = if (hindi) {
            val risk = when (verdict.getString("financial_risk")) {
                "high" -> "इस रिकॉर्डिंग में वित्तीय धोखाधड़ी के संकेत मिले हैं।"
                "watch" -> "रुकें और इस अनुरोध की जाँच करें।"
                "inconclusive" -> "इस रिकॉर्डिंग की भरोसेमंद जाँच नहीं हो सकी।"
                else -> "धोखाधड़ी के मजबूत संकेत नहीं मिले। इसका मतलब यह नहीं है कि कॉल सुरक्षित है।"
            }
            risk + " आवाज़ की प्रामाणिकता और कॉल करने वाले की पहचान की पुष्टि नहीं हुई है। बैंक के आधिकारिक ऐप या कार्ड पर दिए नंबर से संपर्क करें। किसी भरोसेमंद व्यक्ति की मदद लें।" +
                if (verdict.getJSONObject("action_plan").getString("payment_status") == "sent") " पैसा भेज दिया है तो तुरंत बैंक से संपर्क करें और एक नौ तीन शून्य पर कॉल करें।" else " पैसे न भेजें और ओ टी पी, पिन या पासवर्ड न बताएँ।"
        } else report.getString("title") + ". Caller identity is not verified. Voice authenticity: " + verdict.getString("voice_authenticity").replace('_', ' ') + ". " +
            verdict.getJSONObject("action_plan").getJSONArray("steps").let { steps -> (0 until steps.length()).joinToString(" ") { steps.getString(it) } }
        tts = TextToSpeech(this) { result ->
            if (result != TextToSpeech.SUCCESS) { showError("Text-to-speech is unavailable on this phone."); return@TextToSpeech }
            val voice = tts?.voices?.firstOrNull { !it.isNetworkConnectionRequired && it.locale.language == if (hindi) "hi" else "en" }
            if (voice == null) { showError("Add an offline ${if(hindi) "Hindi" else "English"} voice in your phone's text-to-speech settings."); return@TextToSpeech }
            tts?.voice = voice; tts?.speak(words.take(3500), TextToSpeech.QUEUE_FLUSH, null, "audio-review")
        }
    }
    private fun openRoute(url: String) {
        if (url !in setOf("tel:1930", "https://cybercrime.gov.in/", "https://www.sancharsaathi.gov.in/")) return
        runCatching { startActivity(Intent(if (url.startsWith("tel:")) Intent.ACTION_DIAL else Intent.ACTION_VIEW, Uri.parse(url))) }
            .onFailure { showError("Open this route manually: $url") }
    }
    private fun showError(value: String) { Toast.makeText(this, value, Toast.LENGTH_LONG).show(); if (::status.isInitialized) status.text = value }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); if (AudioShareReceiver.isAudioShare(intent)) acceptShare(intent); renderReports() }
    override fun onResume() { super.onResume(); renderReports() }
    override fun onStop() { stopPlayback(); tts?.stop(); tts?.shutdown(); tts = null; if (!isChangingConfigurations) AudioTranscriptPreview.clear(); super.onStop() }
    override fun onSaveInstanceState(outState: Bundle) { outState.putString("selected", selected?.toString()); outState.putString("selectedSource", selectedSource); super.onSaveInstanceState(outState) }
    override fun onDestroy() { generation++; consentDialog?.dismiss(); correction?.cancel(); scope.cancel(); stopPlayback(); tts?.shutdown(); main.removeCallbacksAndMessages(null); super.onDestroy() }
    companion object { const val PICK_AUDIO = 703; const val PICK_MODEL = 705; const val EXPORT = 706; const val MICROPHONE = 702; const val NOTIFICATIONS = 707; const val PHONE_STATE = 704 }
}
