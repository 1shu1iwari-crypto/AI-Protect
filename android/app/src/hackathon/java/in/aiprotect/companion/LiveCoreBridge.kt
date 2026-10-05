package `in`.aiprotect.companion

import android.content.Context
import android.webkit.*
import androidx.webkit.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/** Service-owned WebView keeps the bundled engine alive while the dialer is visible. */
class LiveCoreBridge(
    context: Context, private val id: String, private val direction: String,
    private val onReady: () -> Unit, private val onResult: (JSONObject) -> Unit,
    private val onFailure: () -> Unit
) {
    private val web = WebView(context)
    private val store = ReviewStore(context)
    private var reply: JavaScriptReplyProxy? = null
    private var sequence = 0
    private var awaiting = false
    private var started = false
    private var closed = false
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private val timeout = Runnable { if (!closed) onFailure() }
    init {
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
        val loader = WebViewAssetLoader.Builder().addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(context)).build()
        web.settings.apply {
            javaScriptEnabled = true;domStorageEnabled = false;allowFileAccess = false;allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW;cacheMode = WebSettings.LOAD_NO_CACHE;saveFormData = false
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest) = true
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse {
                if (BridgePolicy.trustedSource(request.url, true)) loader.shouldInterceptRequest(request.url)?.let { return it }
                return WebResourceResponse("text/plain", "UTF-8", 403, "Offline only", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean { onFailure();return true }
        }
        web.webChromeClient = object : WebChromeClient() { override fun onPermissionRequest(request: PermissionRequest) = request.deny() }
        WebViewCompat.addWebMessageListener(web, "LiveReviewMessages", setOf(BridgePolicy.ORIGIN)) { _, message, origin, mainFrame, proxy ->
            if (!closed && BridgePolicy.trustedSource(origin, mainFrame)) {
                try {
                    val raw = message.data ?: ""
                    require(raw.length <= 512_000)
                    val value = JSONObject(raw)
                    when (value.getString("type")) {
                        "ready" -> {
                            check(reply == null);reply = proxy
                            val state = JSONObject(store.read());val reviews = state.optJSONArray("reviews") ?: JSONArray()
                            val saved = (0 until reviews.length()).map { reviews.getJSONObject(it) }.firstOrNull { it.getString("session_id") == id }
                            proxy.postMessage(JSONObject().put("kind", "start").put("id", id).put("direction", direction)
                                .put("userTriggered", true).put("snapshot", saved ?: JSONObject.NULL).toString())
                        }
                        "started" -> {
                            check(!started && value.getString("reviewId") == id);started = true
                            main.removeCallbacks(timeout);onReady()
                        }
                        "liveRisk" -> {
                            check(started && awaiting && value.getString("reviewId") == id && value.getInt("sequence") == sequence)
                            val clean = ReviewSnapshotPolicy.sanitize(JSONObject().put("active", id)
                                .put("reviews", JSONArray().put(value.getJSONObject("snapshot"))).toString()).getJSONArray("reviews").getJSONObject(0)
                            check(clean.getString("session_id") == id)
                            val timeline = clean.getJSONArray("timeline")
                            check(timeline.length() > 0)
                            // Severity and signal labels come from independently sanitized enums only.
                            val latest = timeline.getJSONObject(timeline.length() - 1)
                            val evidence = linkedSetOf<String>()
                            for (i in 0 until timeline.length()) {
                                val signals = timeline.getJSONObject(i).getJSONArray("evidence")
                                for (j in 0 until signals.length()) evidence.add(signals.getString(j))
                            }
                            val state = JSONObject(store.read());val old = state.optJSONArray("reviews") ?: JSONArray()
                            val kept = (0 until old.length()).map { old.getJSONObject(it) }.filter { it.getString("session_id") != id }.takeLast(9)
                            store.write(JSONObject().put("active", id).put("reviews", JSONArray(kept).put(clean)).toString())
                            LiveReviewCoordinator.markSaved()
                            LiveReviewCoordinator.risk(latest.getString("severity"), evidence.toList())
                            awaiting = false;main.removeCallbacks(timeout);onResult(clean)
                        }
                        else -> onFailure()
                    }
                } catch (_: Exception) { onFailure() }
            }
        }
        main.postDelayed(timeout, 15_000)
        web.loadUrl(BridgePolicy.ORIGIN + "/web/live-review.html")
    }
    fun chunk(text: String) {
        check(started && !closed && !awaiting)
        awaiting = true;sequence++
        reply!!.postMessage(JSONObject().put("kind", "liveCallChunk").put("reviewId", id).put("sequence", sequence)
            .put("text", text).put("timestamp", System.currentTimeMillis()).toString())
        main.postDelayed(timeout, 5_000)
    }
    fun close() {
        if (closed) return
        closed = true;reply = null;main.removeCallbacks(timeout)
        WebViewCompat.removeWebMessageListener(web, "LiveReviewMessages");web.stopLoading();web.destroy()
    }
}
