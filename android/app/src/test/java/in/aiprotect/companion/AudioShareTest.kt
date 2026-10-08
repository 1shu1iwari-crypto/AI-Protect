package `in`.aiprotect.companion

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioShareTest {
    @Test fun acceptsAudioAttachmentsFromExtraStreamAndSingleClipData() {
        val uri = Uri.parse("content://recorder/call.m4a")
        val stream = Intent(Intent.ACTION_SEND).setType("audio/mp4").putExtra(Intent.EXTRA_STREAM,uri)
        assertEquals(uri, AudioShareReceiver.uri(stream))
        val clip = Intent(Intent.ACTION_SEND).setType("application/ogg").apply { clipData = ClipData.newRawUri("Recording",uri) }
        assertEquals(uri, AudioShareReceiver.uri(clip))
    }
    @Test fun rejectsBarePathsMultipleAttachmentsAndTextMislabeledAsAudio() {
        assertNull(AudioShareReceiver.uri(Intent(Intent.ACTION_SEND).setType("audio/wav").putExtra(Intent.EXTRA_STREAM,Uri.parse("file:///sdcard/call.wav"))))
        assertNull(AudioShareReceiver.uri(Intent(Intent.ACTION_SEND).setType("audio/wav").putExtra(Intent.EXTRA_TEXT,"recording words")))
        val multiple = Intent(Intent.ACTION_SEND_MULTIPLE).setType("audio/wav").apply { clipData = ClipData.newRawUri("Recording",Uri.parse("content://recordings/1")) }
        assertFalse(AudioShareReceiver.isAudioShare(multiple)); assertNull(AudioShareReceiver.uri(multiple))
        assertFalse(AudioShareReceiver.isAudioShare(Intent(Intent.ACTION_SEND).setType("text/plain")))
    }
}
