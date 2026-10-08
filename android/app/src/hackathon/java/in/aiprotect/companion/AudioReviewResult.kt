package `in`.aiprotect.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Save derived verdicts and offsets only. Raw speech remains in the transient preview. */
object AudioReviewResult {
    fun save(context: Context, id: String, source: String, response: JSONObject): JSONObject {
        val verdict = response.getJSONObject("verdict")
        require(verdict.getString("financial_risk") in setOf("inconclusive", "high", "watch", "no_strong_signs"))
        val snapshot = response.getJSONObject("snapshot")
        require(snapshot.getString("session_id") == id)
        val hasReview = snapshot.getJSONArray("events").length() > 0
        val store = ReviewStore(context); val state = JSONObject(store.read()); val old = state.optJSONArray("reviews") ?: JSONArray()
        val kept = (0 until old.length()).map { old.getJSONObject(it) }.filter { it.getString("session_id") != id }.takeLast(9).toMutableList()
        while (kept.isNotEmpty() && JSONArray(kept + if(hasReview) listOf(snapshot) else emptyList()).toString().length > 450_000) kept.removeAt(0)
        store.write(JSONObject().put("active", if (hasReview) id else kept.lastOrNull()?.getString("session_id") ?: JSONObject.NULL)
            .put("reviews", if (hasReview) JSONArray(kept).put(snapshot) else JSONArray(kept)).toString())
        val report = JSONObject().put("schema_version", 2).put("id", id).put("created", System.currentTimeMillis())
            .put("title", verdict.getString("headline")).put("severity", verdict.getString("severity"))
            .put("words", verdict.getInt("words")).put("signals", verdict.getJSONArray("signals"))
            .put("hasReview",hasReview).put("source",when(source) { "shared_recording" -> "Shared recording"; "microphone_recording" -> "Microphone recording"; else -> "Imported recording" })
            .put("verdict",verdict).put("authenticity",verdict.getJSONObject("authenticity"))
            .put("media_authenticity",verdict.getString("voice_authenticity"))
            .put("note","Temporary audio deleted. Your original file is unchanged. Full speech is not saved in this report.")
        AudioReportStore(context).save(report)
        return report
    }
    fun updatePlan(context: Context, report: JSONObject, plan: JSONObject) {
        report.getJSONObject("verdict").put("action_plan",plan)
        AudioReportStore(context).save(report)
        val store = ReviewStore(context); val state = JSONObject(store.read()); val reviews = state.optJSONArray("reviews") ?: JSONArray()
        for (i in 0 until reviews.length()) {
            val review = reviews.getJSONObject(i)
            if (review.getString("session_id") == report.getString("id")) review.put("payment_status",plan.getString("payment_status"))
        }
        store.write(state.toString())
    }
}
