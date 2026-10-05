package `in`.aiprotect.companion

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.*
import android.speech.*
import java.util.concurrent.Executor

interface LocalTranscriber {
    fun prepare(onReady: () -> Unit)
    fun transcribe(samples: ShortArray, onFinal: (String) -> Unit)
    fun close()
}

/** API 33+ on-device recognizer. Never uses createSpeechRecognizer or network fallback. */
class AndroidLocalTranscriber(
    private val context: Context, private val language: String, private val onFailure: (String) -> Unit
) : LocalTranscriber {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var pipe: Array<ParcelFileDescriptor>? = null
    private var completion: ((String) -> Unit)? = null
    private var closed = false
    private val timeout = Runnable { fail("Local speech recognition timed out. Review stopped.") }
    private fun request() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
        .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, 16_000)

    override fun prepare(onReady: () -> Unit) {
        check(Looper.myLooper() == Looper.getMainLooper())
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) { fail("On-device speech recognition is unavailable.");return }
        val engine = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        recognizer = engine
        engine.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) { complete(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()) }
            override fun onError(error: Int) {
                if (closed) return
                if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) complete("")
                else fail("On-device recognizer unavailable or audio input unsupported (code $error). Use manual review.")
            }
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) { buffer?.fill(0) }
            override fun onEndOfSpeech() = Unit
            override fun onPartialResults(partialResults: Bundle?) = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        main.postDelayed(timeout, 10_000)
        engine.checkRecognitionSupport(request(), Executor { main.post(it) }, object : RecognitionSupportCallback {
            override fun onSupportResult(support: RecognitionSupport) {
                if (closed) return
                main.removeCallbacks(timeout)
                if (support.installedOnDeviceLanguages.none { it.equals(language, true) }) {
                    fail("Install the $language on-device speech pack in your device settings, then try again. No cloud fallback.");return
                }
                onReady()
            }
            override fun onError(error: Int) { if (!closed) fail("This on-device recognizer cannot confirm offline language support (code $error).") }
        })
    }
    override fun transcribe(samples: ShortArray, onFinal: (String) -> Unit) {
        check(!closed && completion == null)
        completion = onFinal
        val descriptors = ParcelFileDescriptor.createPipe();pipe = descriptors
        main.postDelayed(timeout, 10_000)
        try {
            recognizer!!.startListening(request().putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, descriptors[0]))
            Thread({
                val bytes = ByteArray(640)
                try {
                    ParcelFileDescriptor.AutoCloseOutputStream(descriptors[1]).use { output ->
                        var offset = 0
                        while (offset < samples.size) {
                            val count = minOf(320, samples.size - offset)
                            for (i in 0 until count) { val value = samples[offset+i].toInt();bytes[i*2] = value.toByte();bytes[i*2+1] = (value shr 8).toByte() }
                            output.write(bytes, 0, count * 2);offset += count
                        }
                    }
                } catch (_: Exception) {
                    main.post { if (!closed && pipe === descriptors) fail("Local recognizer could not consume microphone audio.") }
                } finally { samples.fill(0);bytes.fill(0) }
            }, "live-review-asr-pipe").start()
        } catch (_: RuntimeException) { samples.fill(0);fail("Could not start local transcription.") }
    }
    private fun complete(text: String) {
        if (closed) return
        val callback = completion;completion = null
        main.removeCallbacks(timeout);closePipe()
        callback?.invoke(text)
    }
    private fun closePipe() { pipe?.forEach { try { it.close() } catch (_: Exception) {} };pipe = null }
    private fun fail(reason: String) { if (!closed) { close();onFailure(reason) } }
    override fun close() {
        closed = true;completion = null;main.removeCallbacks(timeout);closePipe()
        runCatching { recognizer?.cancel() };runCatching { recognizer?.destroy() };recognizer = null
    }
}
