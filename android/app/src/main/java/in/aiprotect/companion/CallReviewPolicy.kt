package `in`.aiprotect.companion

/** Pure callback policy. Neither direction grants consent to analyze. */
object CallReviewPolicy {
    data class Decision(val respondAllow: Boolean, val offerReview: Boolean, val analyze: Boolean = false)
    fun decide(direction: String, eligible: Boolean = true) = Decision(
        respondAllow = direction == "incoming", offerReview = eligible && direction in setOf("incoming", "outgoing")
    )
    fun safeId(value: String?) = value?.takeIf { it.matches(Regex("[a-zA-Z0-9-]{8,64}")) }
    fun safeDirection(value: String?) = value?.takeIf { it in setOf("incoming", "outgoing") } ?: "unknown"
}
