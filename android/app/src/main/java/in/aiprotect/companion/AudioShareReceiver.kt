package `in`.aiprotect.companion

import android.content.Intent
import android.net.Uri
import android.os.Build

/** Decode only the envelope here. Reading and analyzing require a later user tap. */
object AudioShareReceiver {
    fun isAudioShare(intent: Intent): Boolean = intent.action == Intent.ACTION_SEND &&
        (intent.type?.startsWith("audio/") == true || intent.type == "application/ogg")

    fun uri(intent: Intent): Uri? {
        if (!isAudioShare(intent)) return null
        val stream = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            else @Suppress("DEPRECATION") intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        // Some file apps put their single attachment only in ClipData.
        val candidate = stream ?: intent.clipData?.takeIf { it.itemCount == 1 }?.getItemAt(0)?.uri
        return candidate?.takeIf { it.scheme == "content" && !it.authority.isNullOrBlank() }
    }
}
