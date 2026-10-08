package `in`.aiprotect.companion

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.io.File
import kotlin.math.sqrt

data class AudioQuality(val status: String, val durationMs: Long, val audibleMs: Long, val clippedFraction: Double)

/** An energy/clip gate, not a learned VAD or a test of voice authenticity. */
object AudioQualityGate {
    suspend fun inspect(pcm: File): AudioQuality {
        require(pcm.length() % 2 == 0L && pcm.length() <= 16000L * 600 * 2) { "Invalid or overlong recording." }
        var samples = 0L; var clipped = 0L; var audible = 0L
        pcm.inputStream().buffered().use { input ->
            val frame = ByteArray(640)
            try {
                while (true) {
                    currentCoroutineContext().ensureActive()
                    var count = 0
                    while (count < frame.size) { val n = input.read(frame, count, frame.size - count); if (n < 0) break; count += n }
                    if (count == 0) break
                    var energy = 0.0
                    for (i in 0 until count / 2) {
                        val value = ((frame[2*i].toInt() and 255) or (frame[2*i+1].toInt() shl 8)).toShort().toInt()
                        energy += value.toDouble() * value; if (kotlin.math.abs(value) >= 32700) clipped++
                    }
                    val size = count / 2; samples += size
                    if (size > 0 && sqrt(energy / size) >= 200) audible += size
                }
            } finally { frame.fill(0) }
        }
        val duration = samples * 1000 / 16000
        val speech = audible * 1000 / 16000
        val fraction = clipped.toDouble() / maxOf(1, samples)
        val status = when { duration < 1000 || speech < 800 -> "insufficient"; fraction > 0.02 || speech < duration / 10 -> "degraded"; else -> "adequate" }
        return AudioQuality(status, duration, speech, fraction)
    }
}
