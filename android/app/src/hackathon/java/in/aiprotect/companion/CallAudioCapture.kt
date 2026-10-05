package `in`.aiprotect.companion

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/** Microphone only. No telecom stream, audio file, audio focus, or speaker routing. */
class CallAudioCapture(private val onChunk: (ShortArray) -> Unit, private val onFailure: () -> Unit) {
    @Volatile private var running = false
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null
    @SuppressLint("MissingPermission") // The activity and foreground service both verify consent/permission.
    fun start() {
        check(!running)
        val minimum = AudioRecord.getMinBufferSize(16_000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0)
        val audio = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC)
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(16_000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
            .setBufferSizeInBytes(maxOf(minimum, 6_400)).build()
        recorder = audio
        check(audio.state == AudioRecord.STATE_INITIALIZED)
        audio.startRecording();check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING)
        running = true
        worker = Thread({
            val frame = ShortArray(320)
            val chunker = SpeechChunker { if (running) onChunk(it) else it.fill(0) }
            var silentSamples = 0
            try {
                while (running) {
                    val count = audio.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                    if (count <= 0) { if (running) onFailure();break }
                    silentSamples = if ((0 until count).all { frame[it] == 0.toShort() }) silentSamples + count else 0
                    if (silentSamples >= 16_000 * 15) { if (running) onFailure();break }
                    chunker.push(frame, count);frame.fill(0)
                }
            } catch (_: RuntimeException) { if (running) onFailure() }
            finally { frame.fill(0);chunker.clear();audio.release() }
        }, "live-review-pcm").also { it.start() }
    }
    fun close() {
        running = false
        try { recorder?.stop() } catch (_: RuntimeException) {}
        // stop() releases the blocking read; the worker owns final release and zeroing.
        if (worker == null) recorder?.release()
        recorder = null;worker = null
    }
}
