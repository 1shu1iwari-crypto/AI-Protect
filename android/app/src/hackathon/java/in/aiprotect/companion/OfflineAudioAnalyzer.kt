package `in`.aiprotect.companion

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.SystemClock
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject
import java.io.File
import java.nio.ByteOrder

/** Streaming averaging converter keeps memory bounded across arbitrary decoder buffers. */
class Mono16k(private val rate: Int, private val emit: (Short) -> Unit) {
    private var phase = 0L; private var sum = 0L; private var samples = 0
    init { require(rate in 8000..192000) }
    fun sample(value: Short) {
        sum += value; samples++; phase += 16000
        if (phase >= rate) {
            val average = (sum / samples).toShort()
            while (phase >= rate) { emit(average); phase -= rate }
            sum = 0; samples = 0
        }
    }
}

class OfflineAudioAnalyzer(private val context: Context) {
    suspend fun installModel(language: String): File {
        require(language in setOf("en", "hi"))
        val target = File(context.noBackupFilesDir, "speech-model-$language-v1")
        if (File(target, ".ready").exists()) return target
        target.deleteRecursively(); target.mkdirs()
        suspend fun copy(asset: String, dest: File) {
            currentCoroutineContext().ensureActive()
            val children = context.assets.list(asset) ?: emptyArray()
            if (children.isNotEmpty()) { dest.mkdirs(); for (child in children) copy("$asset/$child", File(dest, child)) }
            else { dest.parentFile?.mkdirs(); context.assets.open(asset).use { src -> dest.outputStream().use { src.copyTo(it) } } }
        }
        copy("models/$language", target)
        File(target, ".ready").writeText("1")
        return target
    }
    suspend fun copyImport(uri: Uri, target: File) {
        require(uri.scheme == "content") { "Choose audio from the Android file picker." }
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { out ->
                val buffer = ByteArray(32768); var total = 0L
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val count = input.read(buffer); if (count < 0) break
                    total += count; require(total <= 60L * 1024 * 1024) { "Choose a recording smaller than 60 MB." }
                    out.write(buffer, 0, count)
                }
                require(total > 0) { "The selected recording is empty." }; buffer.fill(0)
            }
        } ?: throw IllegalArgumentException("Cannot read this recording. Choose a local audio file.")
    }
    suspend fun decode(source: File, target: File) {
        val extractor = MediaExtractor(); var codec: MediaCodec? = null
        try {
            extractor.setDataSource(source.absolutePath)
            val track = (0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
                ?: throw IllegalArgumentException("This file does not contain supported audio.")
            extractor.selectTrack(track)
            val format = extractor.getTrackFormat(track)
            require(!format.containsKey(MediaFormat.KEY_DURATION) || format.getLong(MediaFormat.KEY_DURATION) <= 600_000_000L) { "Choose audio no longer than ten minutes." }
            format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!); codec = decoder
            decoder.configure(format, null, null, 0); decoder.start()
            target.outputStream().buffered().use { out ->
                var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                require(channels in 1..8)
                var count = 0L
                val write: (Short) -> Unit = { value ->
                    count++; require(count <= 16000L * 600) { "Choose audio no longer than ten minutes." }
                    out.write(value.toInt() and 255); out.write((value.toInt() shr 8) and 255)
                }
                var converter = Mono16k(rate, write)
                var inputDone = false; var outputDone = false
                val info = MediaCodec.BufferInfo(); var lastOutput = SystemClock.elapsedRealtime()
                while (!outputDone) {
                    currentCoroutineContext().ensureActive()
                    check(SystemClock.elapsedRealtime() - lastOutput < 15_000) { "Audio decoder stalled. Try an MP3, WAV or M4A recording." }
                    if (!inputDone) {
                        val index = decoder.dequeueInputBuffer(10_000)
                        if (index >= 0) {
                            val buffer = decoder.getInputBuffer(index)!!
                            val size = extractor.readSampleData(buffer, 0)
                            if (size < 0) { decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true }
                            else { decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0); extractor.advance() }
                        }
                    }
                    val index = decoder.dequeueOutputBuffer(info, 10_000)
                    if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        val actual = decoder.outputFormat
                        channels = actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT); rate = actual.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        require(channels in 1..8)
                        require(!actual.containsKey(MediaFormat.KEY_PCM_ENCODING) || actual.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_16BIT) { "Unsupported decoded audio format." }
                        converter = Mono16k(rate, write)
                    } else if (index >= 0) {
                        lastOutput = SystemClock.elapsedRealtime()
                        val buffer = decoder.getOutputBuffer(index)!!.order(ByteOrder.LITTLE_ENDIAN)
                        buffer.position(info.offset); buffer.limit(info.offset + info.size)
                        while (buffer.remaining() >= channels * 2) {
                            var sum = 0; repeat(channels) { sum += buffer.short }; converter.sample((sum / channels).toShort())
                        }
                        outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        decoder.releaseOutputBuffer(index, false)
                    }
                }
                require(count >= 16000) { "Recording is too short to review." }
            }
        } finally { runCatching { codec?.stop() }; codec?.release(); extractor.release() }
    }
    /** No network transport exists in the default audio path. */
    suspend fun analyzeAuthenticity(pcm: File): JSONObject {
        val quality = AudioQualityGate.inspect(pcm)
        return JSONObject().put("schema_version", 1).put("media_type", "audio")
            .put("analysis_status", "model_unavailable").put("validation_status", "not_evaluated")
            .put("authenticity_assessment", "inconclusive").put("raw_model_score", JSONObject.NULL)
            .put("calibration_status", "uncalibrated").put("audio_quality", quality.status)
            .put("model_id", "none").put("model_version", "none")
            .put("limitations", org.json.JSONArray(listOf("No validated on-device voice-authenticity model is installed.")))
    }
}
