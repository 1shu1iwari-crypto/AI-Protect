package `in`.aiprotect.companion

import android.net.Uri
import org.json.JSONObject

/** Only the bundled top-level HTTPS page can request a small set of native actions. */
object BridgePolicy {
    const val ORIGIN = "https://appassets.androidplatform.net"
    const val OBJECT_NAME = "NativeReviewMessages"
    private val methods = setOf("ready", "loadReviews", "saveReviews", "exportReport", "openRoute")
    private val routes = setOf("cybercrime", "chakshu", "helpline")
    data class Request(val id: String, val method: String, val payload: String?)
    fun trustedSource(origin: Uri, isMainFrame: Boolean) = isMainFrame &&
        origin.scheme == "https" && origin.host == "appassets.androidplatform.net" &&
        origin.port in setOf(-1, 443) && origin.userInfo == null

    fun parse(raw: String): Request {
        require(raw.length <= 600_000)
        val value = JSONObject(raw)
        require(value.keys().asSequence().toSet() == setOf("id", "method", "payload"))
        val id = value.getString("id")
        val method = value.getString("method")
        require(id.matches(Regex("[a-zA-Z0-9-]{1,64}")) && method in methods)
        val payload = if (value.isNull("payload")) null else value.get("payload").let { require(it is String); it }
        when (method) {
            "ready", "loadReviews" -> require(payload == null)
            "saveReviews", "exportReport" -> require(payload != null && payload.length <= 512_000)
            "openRoute" -> require(payload in routes)
        }
        return Request(id, method, payload)
    }
}
