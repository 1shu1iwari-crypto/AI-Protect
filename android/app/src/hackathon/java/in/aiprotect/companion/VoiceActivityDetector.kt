package `in`.aiprotect.companion

/** Energy gate for PCM16/16 kHz; not a language or scam classifier. */
class VoiceActivityDetector(private val threshold: Int = 400) {
    fun isSpeech(samples: ShortArray, count: Int = samples.size): Boolean {
        if (count == 0) return false
        var energy = 0.0
        for (i in 0 until count) energy += samples[i].toDouble() * samples[i]
        return energy / count >= threshold.toDouble() * threshold
    }
}

/** At most six seconds in RAM, 160 ms pre-roll and 600 ms trailing silence. */
class SpeechChunker(private val emit: (ShortArray) -> Unit) {
    private val vad = VoiceActivityDetector()
    private val buffer = ShortArray(96_000)
    private val preRoll = ShortArray(2_560)
    private var preCount = 0
    private var size = 0
    private var silence = 0
    fun push(frame: ShortArray, count: Int) {
        require(count in 0..frame.size && count <= 320)
        val speech = vad.isSpeech(frame, count)
        if (size == 0 && !speech) {
            if (preCount + count > preRoll.size) {
                val drop = preCount + count - preRoll.size
                preRoll.copyInto(preRoll, 0, drop, preCount);preCount -= drop
            }
            frame.copyInto(preRoll, preCount, 0, count);preCount += count;return
        }
        if (size == 0) { preRoll.copyInto(buffer, 0, 0, preCount);size = preCount;preRoll.fill(0);preCount = 0 }
        // Frames are 320 samples. A segment boundary never exceeds the RAM cap.
        if (size + count > buffer.size) flush()
        frame.copyInto(buffer, size, 0, count);size += count
        silence = if (speech) 0 else silence + count
        if (size >= buffer.size || silence >= 9_600) flush()
    }
    private fun flush() {
        if (size > 0) emit(buffer.copyOf(size))
        buffer.fill(0);size = 0;silence = 0
    }
    fun clear() { buffer.fill(0);preRoll.fill(0);size = 0;preCount = 0;silence = 0 }
}
