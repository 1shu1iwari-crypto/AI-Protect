package `in`.aiprotect.companion

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import java.util.concurrent.ArrayBlockingQueue

/** Non-restarting microphone FGS. Raw data stays in bounded RAM and anonymous pipes. */
class LiveReviewService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val queue = ArrayBlockingQueue<ShortArray>(2)
    private val aggregator = TranscriptAggregator()
    private var capture: CallAudioCapture? = null
    private var transcriber: LocalTranscriber? = null
    private var core: LiveCoreBridge? = null
    private var busy = false
    @Volatile private var closed = true
    private val safetyTimeout = Runnable { stopReview("10-minute limit reached. Microphone off.") }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { stopReview();return START_NOT_STICKY }
        if (!closed) return START_NOT_STICKY
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
            !LiveReviewCoordinator.begin(intent?.getStringExtra("consent")) { shutdown() }) {
            stopSelf();return START_NOT_STICKY
        }
        closed = false
        try {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Live microphone review", NotificationManager.IMPORTANCE_LOW))
            check(manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL).importance != NotificationManager.IMPORTANCE_NONE)
            startForeground(42, notification(LiveReviewCoordinator.state.value), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            main.postDelayed(safetyTimeout, 600_000)
            scope.launch { LiveReviewCoordinator.state.collect { if (!closed) manager.notify(42, notification(it)) } }
            val state = LiveReviewCoordinator.state.value
            core = LiveCoreBridge(this, state.id, state.direction,
                onReady = { prepareAudio(intent?.getStringExtra("language") ?: "en-IN") },
                onResult = { busy = false;pump() },
                onFailure = { stopReview("Local review engine unavailable. Microphone off.") })
        } catch (_: Exception) { stopReview("Could not start local microphone review. Use manual signals.") }
        return START_NOT_STICKY
    }
    private fun prepareAudio(language: String) {
        if (closed) return
        try {
            val local = AndroidLocalTranscriber(this, if (language == "hi-IN") "hi-IN" else "en-IN") { stopReview(it) }
            transcriber = local
            local.prepare {
                if (!closed) try {
                    capture = CallAudioCapture(onChunk = { pcm ->
                        if (closed) pcm.fill(0)
                        else if (!queue.offer(pcm)) { pcm.fill(0);main.post { stopReview("Local transcription could not keep up. Review stopped.") } }
                        else main.post { if (closed) clearQueue() else pump() }
                    }, onFailure = { main.post { stopReview("Microphone unavailable or silenced by this device. Use manual review.") } })
                    capture!!.start();LiveReviewCoordinator.listening()
                } catch (_: Exception) { stopReview("Microphone capture unavailable. Use manual review.") }
            }
        } catch (_: Exception) { stopReview("On-device speech recognition unavailable. Use manual review.") }
    }
    private fun pump() {
        if (closed || busy) return
        val pcm = queue.poll() ?: return
        busy = true
        try {
            transcriber!!.transcribe(pcm) { text ->
                if (!closed) {
                    val phrase = aggregator.finalPhrase(text, SystemClock.elapsedRealtime())
                    if (phrase == null) { busy = false;pump() }
                    else try { core!!.chunk(phrase) } catch (_: Exception) { stopReview("Could not review speech locally. Microphone off.") }
                }
            }
        } catch (_: Exception) { pcm.fill(0);stopReview("Could not transcribe speech locally. Microphone off.") }
    }
    private fun notification(state: LiveReviewCoordinator.State): Notification {
        val open = PendingIntent.getActivity(this, 42, Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 43, Intent(this, LiveReviewService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        val title = when (state.severity) { "high" -> "STOP & VERIFY";"warning" -> "Suspicious pattern forming";"watch" -> "Be careful";else -> "Live review active" }
        return Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_shield).setContentTitle(title)
            .setContentText("Microphone review · no audio saved · tap to stop and open review")
            .setContentIntent(open).addAction(Notification.Action.Builder(null, "Stop Review", stop).build())
            .setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).build()
    }
    private fun stopReview(reason: String = "Review stopped. Microphone off.") { LiveReviewCoordinator.stop(reason);shutdown() }
    private fun clearQueue() { while (true) (queue.poll() ?: break).fill(0) }
    private fun shutdown() {
        if (closed) return
        closed = true;main.removeCallbacks(safetyTimeout)
        runCatching { capture?.close() };capture = null
        runCatching { transcriber?.close() };transcriber = null
        clearQueue();aggregator.clear();runCatching { core?.close() };core = null;scope.cancel()
        stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()
    }
    override fun onTaskRemoved(rootIntent: Intent?) { stopReview("App closed. Microphone off.");super.onTaskRemoved(rootIntent) }
    override fun onDestroy() { stopReview();super.onDestroy() }
    companion object { const val CHANNEL = "live_microphone_review" }
}
