package `in`.aiprotect.companion

import android.content.Context
import kotlinx.coroutines.*
import org.json.JSONObject

/** Local, origin-scoped bridge to the existing financial engine, with bounded waits. */
object AudioEvidenceBridge {
    suspend fun analyze(context: Context, id: String, transcript: RecordedTranscript, authenticity: JSONObject, paymentStatus: String = "unknown"): JSONObject =
        exchange(context, id) { it.recording(transcript, authenticity, paymentStatus) }

    suspend fun plan(context: Context, id: String, paymentStatus: String): JSONObject =
        exchange(context, id) { it.paymentPlan(paymentStatus) }

    private suspend fun exchange(context: Context, id: String, send: (LiveCoreBridge) -> Unit): JSONObject = withContext(Dispatchers.Main.immediate) {
        val ready = CompletableDeferred<Unit>(); val response = CompletableDeferred<JSONObject>()
        val bridge = LiveCoreBridge(context, id, "unknown", onReady = { ready.complete(Unit) }, onResult = { response.complete(it) },
            onFailure = {
                val error = IllegalStateException("The local review engine could not finish. No safety verdict was saved.")
                ready.completeExceptionally(error); response.completeExceptionally(error)
            }, persistResults = false, updateLiveState = false, evidenceType = "uploaded_call_audio")
        try { withTimeout(20_000) { ready.await() }; send(bridge); withTimeout(25_000) { response.await() } }
        finally { bridge.close() }
    }
}
