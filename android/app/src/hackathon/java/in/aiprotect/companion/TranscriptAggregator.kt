package `in`.aiprotect.companion

import java.security.MessageDigest
import java.util.Locale

/** ASR partials never enter the engine. Retain only a short-lived digest of a final. */
class TranscriptAggregator {
    private var lastDigest: ByteArray? = null
    private var lastAt = 0L
    fun finalPhrase(text: String, now: Long): String? {
        val phrase = text.trim().replace(Regex("\\s+"), " ").take(2_000)
        if (phrase.isBlank()) return null
        val digest = MessageDigest.getInstance("SHA-256").digest(phrase.lowercase(Locale.ROOT).toByteArray())
        if (now - lastAt in 0..2_000 && lastDigest?.contentEquals(digest) == true) return null
        lastDigest?.fill(0);lastDigest = digest;lastAt = now
        return phrase
    }
    fun clear() { lastDigest?.fill(0);lastDigest = null;lastAt = 0 }
}
