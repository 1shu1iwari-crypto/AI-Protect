package `in`.aiprotect.companion

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Non-restarting, explicitly consented recording/import followed by local analysis. */
class AudioReviewService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var job: Job? = null
    private var finishRecording = CompletableDeferred<String?>()
    private var phone: TelephonyManager? = null
    private var callback: TelephonyCallback? = null
    private var core: LiveCoreBridge? = null
    private var reply: CompletableDeferred<JSONObject>? = null
    private val manager get() = getSystemService(NotificationManager::class.java)
    override fun onCreate() {
        super.onCreate()
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Recording and offline analysis", NotificationManager.IMPORTANCE_LOW))
        manager.createNotificationChannel(NotificationChannel(REPORTS, "Call review reports", NotificationManager.IMPORTANCE_DEFAULT))
    }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            FINISH -> { finishRecording.complete(null); if (job == null) stopSelf(); return START_NOT_STICKY }
            CANCEL -> { job?.cancel(); if (job == null) stopSelf(); return START_NOT_STICKY }
        }
        if (job?.isActive == true) return START_NOT_STICKY
        val request = AudioReviewState.claim(intent?.getStringExtra("consent")) ?: run { stopSelf(); return START_NOT_STICKY }
        finishRecording = CompletableDeferred()
        job = scope.launch { runReview(request) }
        return START_NOT_STICKY
    }
    private fun foreground(recording: Boolean, text: String) {
        val type = if (recording) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            else if (Build.VERSION.SDK_INT >= 35) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING
            else ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        startForeground(FOREGROUND_ID, progressNotification(recording, text), type)
    }
    private suspend fun runReview(request: AudioReviewState.Request) {
        val work = File(noBackupFilesDir, "audio-work").apply { mkdirs() }
        val pcm = File(work, "${request.id}.pcm"); val imported = File(work, "${request.id}.input")
        val marker = File(noBackupFilesDir, "audio-job.json")
        var recorder: DeferredRecorder? = null
        var completedTitle: String? = null
        var failureText = "Review cancelled. Temporary audio deleted."
        try {
            check(manager.areNotificationsEnabled() && listOf(CHANNEL, REPORTS).all { manager.getNotificationChannel(it).importance != NotificationManager.IMPORTANCE_NONE }) { "Enable recording and report notifications in app settings." }
            foreground(request.uri == null, "Preparing review…")
            withContext(Dispatchers.IO) { work.listFiles().orEmpty().forEach { it.delete() }; marker.writeText(JSONObject().put("id", request.id).toString()) }
            val analyzer = OfflineAudioAnalyzer(this)
            if (request.uri == null) {
                check(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Allow microphone access first." }
                check(LiveReviewCoordinator.accessibilityConnected) { "Enable the floating review shield first." }
                val capture = DeferredRecorder(pcm) { finishRecording.complete(it) }; recorder = capture
                capture.start()
                AudioReviewState.update(AudioReviewState.Phase.RECORDING, "Recording · analysis starts afterward · use speakerphone")
                if (request.autoFinish) watchCallEnd()
                val reason = withTimeoutOrNull(590_000) { finishRecording.await() }
                unwatchCallEnd()
                withContext(Dispatchers.IO) { capture.close() }; recorder = null
                check(reason == null) { reason ?: "Recording failed." }
                require(pcm.length() >= 32000) { "Recording is too short. Record at least one second." }
            }
            AudioReviewState.update(AudioReviewState.Phase.ANALYZING, "Preparing offline analysis… Microphone off.")
            foreground(false, "Preparing offline analysis…")
            if (request.uri != null) withContext(Dispatchers.IO) { analyzer.copyImport(request.uri, imported); analyzer.decode(imported, pcm); imported.delete() }
            val ready = CompletableDeferred<Unit>()
            var snapshot: JSONObject? = null; var engineFailed = false
            var severity = "quiet"; val evidence = linkedSetOf<String>()
            val rank = listOf("quiet", "watch", "warning", "high")
            core = LiveCoreBridge(this, request.id, "unknown", onReady = { ready.complete(Unit) },
                onResult = { reply?.complete(it) }, onFailure = {
                    engineFailed = true
                    val error = IllegalStateException("Offline review engine could not complete. No verdict was saved.")
                    ready.completeExceptionally(error); reply?.completeExceptionally(error)
                }, persistResults = false, updateLiveState = false,
                evidenceType = if (request.uri == null) "recorded_call_audio" else "uploaded_call_audio")
            withTimeout(20_000) { ready.await() }
            val words = withContext(Dispatchers.IO) {
                analyzer.analyze(pcm, request.language, progress = { percent ->
                    if (percent % 5 == 0) scope.launch {
                        if (AudioReviewState.state.value.phase == AudioReviewState.Phase.ANALYZING) {
                            val message = "Analyzing recording: $percent% · microphone off"
                            AudioReviewState.update(AudioReviewState.Phase.ANALYZING, message)
                            manager.notify(FOREGROUND_ID, progressNotification(false, message))
                        }
                    }
                }) { phrase ->
                    withContext(Dispatchers.Main.immediate) {
                        check(!engineFailed)
                        val response = CompletableDeferred<JSONObject>(); reply = response
                        core!!.chunk(phrase)
                        val clean = withTimeout(10_000) { response.await() }; snapshot = clean
                        val timeline = clean.getJSONArray("timeline")
                        for (i in 0 until timeline.length()) {
                            val entry = timeline.getJSONObject(i); val level = entry.getString("severity")
                            if (rank.indexOf(level) > rank.indexOf(severity)) severity = level
                            val signals = entry.getJSONArray("evidence")
                            for (j in 0 until signals.length()) evidence.add(signals.getString(j))
                        }
                        reply = null
                    }
                }
            }
            val authenticity = analyzer.analyzeAuthenticity(pcm)
            currentCoroutineContext().ensureActive(); check(!engineFailed)
            withContext(Dispatchers.IO) { pcm.delete(); imported.delete() }
            val hasReview = words >= 5 && snapshot != null
            if (hasReview) {
                val store = ReviewStore(this); val old = JSONObject(store.read()).optJSONArray("reviews") ?: JSONArray()
                val kept = (0 until old.length()).map { old.getJSONObject(it) }.filter { it.getString("session_id") != request.id }.takeLast(9)
                store.write(JSONObject().put("active", request.id).put("reviews", JSONArray(kept).put(snapshot)).toString())
            }
            val authAssessment = authenticity?.optString("authenticity_assessment", "inconclusive") ?: "not_performed"
            val title = AudioVerdict.title(words, severity)
            val report = JSONObject().put("id", request.id).put("created", System.currentTimeMillis()).put("title", title)
                .put("severity", if (words < 5) "insufficient" else severity).put("words", words).put("signals", JSONArray(evidence.toList()))
                .put("hasReview", hasReview).put("source", if (request.uri == null) "Microphone recording" else "Imported recording")
                .put("authenticity", authenticity)
                .put("media_authenticity", authAssessment)
                .put("note", "Automated assessment of speech and acoustic authenticity. Speech recognition can miss or change words. No strong signs does not prove a call is safe. Temporary audio deleted; original imported file unchanged.")
            AudioReportStore(this).save(report)
            completedTitle = title
            notifyResult(request.id, title, "Tap to open the report. Temporary audio deleted.")
        } catch (_: CancellationException) {
            // User cancellation intentionally produces no scam verdict.
        } catch (error: Throwable) {
            failureText = if (error is IllegalArgumentException || error is IllegalStateException) error.message ?: "Audio review failed. Try another recording."
                else "Audio review could not finish. Try another recording or manual review."
            runCatching { notifyResult(request.id, "Audio review could not finish", failureText) }
        } finally {
            unwatchCallEnd(); runCatching { core?.close() }; core = null; reply = null
            withContext(NonCancellable + Dispatchers.IO) {
                try { recorder?.close() } finally { pcm.delete(); imported.delete(); marker.delete() }
            }
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
            if (completedTitle != null) AudioReviewState.complete(completedTitle) else AudioReviewState.fail(failureText)
        }
    }
    private fun watchCallEnd() {
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return
        try {
            val gate = CallEndGate()
            val listener = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) { if (gate.accept(state)) finishRecording.complete(null) }
            }
            phone = getSystemService(TelephonyManager::class.java); callback = listener
            phone?.registerTelephonyCallback(mainExecutor, listener)
        } catch (_: Exception) { unwatchCallEnd(); AudioReviewState.update(AudioReviewState.Phase.RECORDING, "Recording · tap Stop & analyze when the call ends") }
    }
    private fun unwatchCallEnd() { callback?.let { runCatching { phone?.unregisterTelephonyCallback(it) } }; callback = null; phone = null }
    private fun openIntent(id: String = "") = PendingIntent.getActivity(this, id.hashCode(), Intent(this, AudioReviewActivity::class.java)
        .putExtra("report", id).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun progressNotification(recording: Boolean, text: String): Notification {
        val builder = Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(if (recording) "Recording for post-call review" else "Analyzing recording offline")
            .setContentText(text).setContentIntent(openIntent()).setOngoing(true).setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE).setVisibility(Notification.VISIBILITY_PRIVATE)
        if (recording) builder.addAction(Notification.Action.Builder(null, "Stop & analyze", PendingIntent.getService(this, 45,
            Intent(this, AudioReviewService::class.java).setAction(FINISH), PendingIntent.FLAG_IMMUTABLE)).build())
        builder.addAction(Notification.Action.Builder(null, "Cancel & delete", PendingIntent.getService(this, 46,
            Intent(this, AudioReviewService::class.java).setAction(CANCEL), PendingIntent.FLAG_IMMUTABLE)).build())
        return builder.build()
    }
    private fun notifyResult(id: String, title: String, text: String) {
        manager.notify(id.hashCode(), Notification.Builder(this, REPORTS).setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(title).setContentText(text).setContentIntent(openIntent(id)).setAutoCancel(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).build())
    }
    override fun onTaskRemoved(rootIntent: Intent?) { if (AudioReviewState.state.value.phase == AudioReviewState.Phase.RECORDING) job?.cancel(); super.onTaskRemoved(rootIntent) }
    override fun onTimeout(startId: Int, fgsType: Int) { job?.cancel(); stopSelf() }
    override fun onDestroy() { job?.cancel(); scope.cancel(); unwatchCallEnd(); super.onDestroy() }
    companion object {
        const val FINISH = "finish-recording"; const val CANCEL = "cancel-audio-review"
        const val CHANNEL = "deferred_audio_progress"; const val REPORTS = "deferred_audio_reports"; const val FOREGROUND_ID = 44
    }
}
