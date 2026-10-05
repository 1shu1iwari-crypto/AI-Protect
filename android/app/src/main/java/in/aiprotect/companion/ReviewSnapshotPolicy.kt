package `in`.aiprotect.companion

import org.json.JSONArray
import org.json.JSONObject

/** Reconstruct persisted state from derived enums. This does not implement detection. */
object ReviewSnapshotPolicy {
    private val ids = Regex("[a-zA-Z0-9-]{8,64}")
    private val tactics = setOf("authority","urgency","threat","isolation","credentials","remote_access","investment","refund","fee","payment","apk","verification","link_risk")
    private val persuasion = setOf("urgency","threat","isolation","trust","reward","redirection","recovery","coercion")
    private val channels = setOf("message","call","link","qr","payment")
    private val actions = setOf("none","transfer","credentials","remote_access","install_app","open_link")
    private val identities = setOf("none","institution","authority","support","investment_desk")
    private val verification = setOf("verified","unverified","mismatch","unknown")
    private val buckets = setOf("unknown","under_1k","1k_10k","10k_50k","50k_plus")
    private val stages = setOf("Not checked","Normal","Pretext","Pressure","Sensitive action","Payment intent","Transfer prepared")
    private val responses = setOf("reported_paid","reported_not_paid","verify_independently","block_ignore","report_route","export","cancel_simulation","continue_simulation")
    private fun enumValue(raw: JSONObject, key: String, allowed: Set<String>, fallback: String): String {
        if (raw.isNull(key)) return fallback
        val value = raw.get(key)
        require(value is String && value in allowed)
        return value
    }
    private fun bool(raw: JSONObject, key: String, fallback: Boolean = false): Boolean {
        if (raw.isNull(key)) return fallback
        val value = raw.get(key);require(value is Boolean);return value
    }
    private fun number(raw: JSONObject, key: String, fallback: Double, low: Double, high: Double): Double {
        if (raw.isNull(key)) return fallback
        val value = raw.get(key);require(value is Number)
        val result = value.toDouble();require(result.isFinite() && result in low..high);return result
    }
    private fun enums(raw: JSONObject, key: String, allowed: Set<String>, limit: Int): JSONArray {
        if (raw.isNull(key)) return JSONArray()
        val values = raw.getJSONArray(key);require(values.length() <= limit)
        val kept = linkedSetOf<String>()
        for (i in 0 until values.length()) { val value=values.get(i);require(value is String && value in allowed);kept.add(value) }
        return JSONArray(kept.toList())
    }
    private fun event(raw: JSONObject, history: JSONObject): JSONObject {
        val ts = number(raw,"timestamp",0.0,0.0,Double.MAX_VALUE)
        val found = enums(raw,"tactics",tactics,13)
        val foundSet = (0 until found.length()).map { found.getString(it) }.toSet()
        val payment = if (raw.isNull("payment")) null else raw.getJSONObject("payment")
        val bucket = enumValue(raw,"amount_bucket",buckets,payment?.let { enumValue(it,"amountBucket",buckets,"unknown") } ?: "unknown")
        val novelty = enumValue(raw,"beneficiary_novelty",setOf("new","known","unknown"),if(payment==null)"unknown" else if(bool(payment,"newPayee",true))"new" else "known")
        val identityFallback = if("authority" in foundSet)"authority" else if("investment" in foundSet)"investment_desk" else "none"
        val identity = enumValue(raw,"claimed_identity",identities,enumValue(raw,"claimed_identity_category",identities,identityFallback))
        val fallbackAction = if(payment!=null)"transfer" else when {
            "credentials" in foundSet -> "credentials"
            "remote_access" in foundSet -> "remote_access"
            "apk" in foundSet -> "install_app"
            "link_risk" in foundSet -> "open_link"
            else -> "none"
        }
        val historyEvidence = enums(history,"evidence",tactics+persuasion,21)
        val signals = if(raw.isNull("persuasion_signals"))JSONArray((foundSet+(0 until historyEvidence.length()).map { historyEvidence.getString(it) }).filter { it in persuasion }) else enums(raw,"persuasion_signals",persuasion,8)
        return JSONObject().put("channel",enumValue(raw,"channel",channels,"message")).put("timestamp",ts).put("tactics",found)
            .put("requested_action",enumValue(raw,"requested_action",actions,fallbackAction))
            .put("claimed_identity",identity).put("claimed_identity_category",identity).put("persuasion_signals",signals)
            .put("verification_status",enumValue(raw,"verification_status",verification,enumValue(history,"verification",verification,"unknown")))
            .put("amount_bucket",bucket).put("beneficiary_novelty",novelty)
            .put("semantic_confidence",if(raw.isNull("semantic_confidence"))JSONObject.NULL else number(raw,"semantic_confidence",0.0,0.0,1.0))
            .put("semantic_tactics",enums(raw,"semantic_tactics",tactics,13)).put("evidence_sources",enums(raw,"evidence_sources",setOf("rules","semantic"),2))
            .put("model_corroboration",bool(raw,"model_corroboration"))
            .put("modelScores",JSONObject.NULL)
            .put("payment",payment?.let { JSONObject().put("amountBucket",bucket).put("newPayee",novelty=="new").put("direction","outgoing") } ?: JSONObject.NULL)
    }
    private fun timeline(raw: JSONObject, derived: JSONObject): JSONObject = JSONObject()
        .put("timestamp",derived.get("timestamp")).put("channel",derived.getString("channel"))
        .put("evidence_type",enumValue(raw,"evidence_type",channels+setOf("screenshot","user_call_signals","live_call_audio"),derived.getString("channel")))
        .put("verification",enumValue(raw,"verification",verification,derived.getString("verification_status")))
        .put("evidence",enums(raw,"evidence",tactics+persuasion,21)).put("new_evidence",enums(raw,"new_evidence",tactics+persuasion,21))
        .put("requested_action",derived.getString("requested_action"))
        .put("stage",enumValue(raw,"stage",stages,"Not checked")).put("severity",enumValue(raw,"severity",setOf("quiet","watch","warning","high"),"quiet"))
        .put("evidence_strength",number(raw,"evidence_strength",0.0,0.0,99.0))
        .put("workflow_confidence",number(raw,"workflow_confidence",0.0,0.0,99.0)).put("action_risk",number(raw,"action_risk",0.0,0.0,99.0))
        .put("escalating",bool(raw,"escalating"))

    fun sanitize(raw: String): JSONObject {
        require(raw.length <= 512_000)
        val state=JSONObject(raw);val source=if(state.isNull("reviews"))JSONArray() else state.getJSONArray("reviews")
        require(source.length() <= 10)
        val reviews=JSONArray();val acceptedIds=mutableSetOf<String>()
        for(i in 0 until source.length()) {
            val review=source.getJSONObject(i);val id=review.getString("session_id")
            require(ids.matches(id)&&acceptedIds.add(id)&&review.get("schema") is Number&&review.getDouble("schema")==1.0)
            val started=number(review,"started",0.0,1.0,Double.MAX_VALUE)
            val events=review.getJSONArray("events");val entries=review.getJSONArray("timeline")
            require(events.length() <= 64&&entries.length()==events.length())
            val safeEvents=JSONArray();val safeTimeline=JSONArray();var previous=0.0
            for(j in 0 until events.length()) {
                val history=entries.getJSONObject(j)
                val e=event(events.getJSONObject(j),history);val timestamp=e.getDouble("timestamp")
                require(timestamp>=previous);previous=timestamp
                safeEvents.put(e);safeTimeline.put(timeline(history,e))
            }
            val safeActions=JSONArray();val recorded=if(review.isNull("actions_taken"))JSONArray() else review.getJSONArray("actions_taken")
            require(recorded.length() <= 32)
            for(j in 0 until recorded.length()) { val action=recorded.getJSONObject(j);safeActions.put(JSONObject().put("action",enumValue(action,"action",responses,"verify_independently")).put("timestamp",number(action,"timestamp",started,0.0,Double.MAX_VALUE))) }
            reviews.put(JSONObject().put("schema",1).put("session_id",id).put("started",started)
                .put("updated",number(review,"updated",started,0.0,Double.MAX_VALUE))
                .put("direction",enumValue(review,"direction",setOf("incoming","outgoing","unknown"),"unknown"))
                .put("user_flagged",bool(review,"user_flagged"))
                // Unknown institution IDs are dropped without discarding behavioral evidence.
                .put("claimed_org",review.opt("claimed_org").takeIf { it in setOf("hdfc","icici") } ?: JSONObject.NULL)
                .put("events",safeEvents).put("timeline",safeTimeline)
                .put("workflow_state",enumValue(review,"workflow_state",stages,"Not checked"))
                .put("payment_status",enumValue(review,"payment_status",setOf("sent","not_sent","unknown"),"unknown"))
                .put("actions_taken",safeActions))
        }
        val active=state.opt("active")
        require(active==null||active==JSONObject.NULL||active is String&&ids.matches(active))
        return JSONObject().put("active",active ?: JSONObject.NULL).put("reviews",reviews)
    }
}
