package `in`.aiprotect.companion

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.File

/** Capture only; no ASR or risk engine runs while the microphone is open. */
class DeferredRecorder(private val file: File, private val onFailure: (String) -> Unit) {
    @Volatile private var running = false
    private var audio: AudioRecord? = null
    private var worker: Thread? = null
    @SuppressLint("MissingPermission")
    fun start() {
        val recorder = AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, maxOf(6400, AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)))
        audio = recorder
        check(recorder.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable. Import a phone recording instead." }
        recorder.startRecording()
        check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Android could not start the microphone." }
        running = true
        worker = Thread({
            val bytes = ByteArray(3200)
            try {
                file.outputStream().use { out ->
                    var total = 0L; var nonzero = false
                    while (running) {
                        val count = recorder.read(bytes, 0, bytes.size)
                        if (!running) break
                        check(count > 0) { "Microphone capture failed. Import a phone recording instead." }
                        check(recorder.activeRecordingConfiguration?.isClientSilenced != true) { "Android silenced the microphone during this call. Import the phone's own recording instead." }
                        for (i in 0 until count) if (bytes[i].toInt() != 0) nonzero = true
                        total += count
                        check(total <= 16000L * 2 * 600) { "Recording reached the ten-minute limit." }
                        check(nonzero || total < 16000L * 2 * 15) { "No microphone signal. Import a phone recording instead." }
                        out.write(bytes, 0, count)
                    }
                }
            } catch (e: Exception) {
                if (running) onFailure(e.message ?: "Recording failed.")
            } finally { bytes.fill(0); recorder.release() }
        }, "deferred-audio-capture").also { it.start() }
    }
    /** Call on IO dispatcher; wait for writer before reading or deleting the file. */
    fun close() {
        running = false
        runCatching { audio?.stop() }
        worker?.join()
        if (worker == null) runCatching { audio?.release() }
        worker = null; audio = null
    }
}
