package `in`.aiprotect.companion

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File

/** Metadata before consent; bounded copy + real decoder validation after consent. */
class AudioImportCoordinator(private val context: Context) {
    data class Details(val bytes: Long?)
    fun details(uri: Uri): Details {
        require(uri.scheme == "content" && !uri.authority.isNullOrBlank()) { "Share an audio attachment from your recorder or Files app." }
        val mime = context.contentResolver.getType(uri)
        require(mime == null || mime.startsWith("audio/") || mime in setOf("application/ogg", "application/octet-stream")) { "Choose an MP3, WAV, M4A or OGG recording." }
        var size: Long? = null
        context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) { val column = cursor.getColumnIndex(OpenableColumns.SIZE); if (column >= 0 && !cursor.isNull(column)) size = cursor.getLong(column).takeIf { it >= 0 } }
        }
        require(size == null || size!! in 1..60L * 1024 * 1024) { "Choose a non-empty recording smaller than 60 MB." }
        return Details(size)
    }
    suspend fun prepare(uri: Uri, imported: File, pcm: File, analyzer: OfflineAudioAnalyzer) {
        details(uri)
        try { analyzer.copyImport(uri, imported); analyzer.decode(imported, pcm) }
        finally { imported.delete() }
    }
}
