package `in`.aiprotect.companion

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowContentResolver
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioImportTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private val original get() = File(context.cacheDir,"original-recording")
    private val copied get() = File(context.noBackupFilesDir,"import-test")
    @After fun clean() { original.delete(); copied.delete() }
    private fun provider(size: Long?, mime: String = "audio/mpeg"): RecordingProvider {
        val value = RecordingProvider(original,size,mime)
        value.attachInfo(context,ProviderInfo().apply { authority = "test-recordings" })
        ShadowContentResolver.registerProviderInternal("test-recordings",value)
        return value
    }
    @Test fun metadataDoesNotReadOrAnalyzeAudioAndCopyLeavesOriginalUnchanged() = runBlocking {
        original.writeBytes(byteArrayOf(1,2,3,4))
        val value = provider(4)
        val uri = Uri.parse("content://test-recordings/one")
        assertEquals(4L,AudioImportCoordinator(context).details(uri).bytes ?: -1L); assertEquals(0,value.opened)
        OfflineAudioAnalyzer(context).copyImport(uri,copied)
        assertArrayEquals(byteArrayOf(1,2,3,4),copied.readBytes()); assertArrayEquals(byteArrayOf(1,2,3,4),original.readBytes())
        copied.delete(); assertTrue(original.isFile)
    }
    @Test fun oversizedEmptyOrWrongMimeFilesAreRejectedBeforeOpeningMedia() {
        val uri = Uri.parse("content://test-recordings/one")
        for ((size,mime) in listOf(61L*1024*1024 to "audio/mp3",0L to "audio/wav",4L to "image/png")) {
            val value = provider(size,mime)
            assertThrows(IllegalArgumentException::class.java) { AudioImportCoordinator(context).details(uri) }
            assertEquals(0,value.opened)
        }
    }
    @Test fun unknownDeclaredSizeCannotBypassTheBoundedCopy() = runBlocking {
        // Sparse input avoids keeping a 61 MB fixture in memory.
        java.io.RandomAccessFile(original,"rw").use { it.setLength(60L*1024*1024+1) }
        provider(null)
        var rejected = false
        try { OfflineAudioAnalyzer(context).copyImport(Uri.parse("content://test-recordings/one"),copied) }
        catch (_: IllegalArgumentException) { rejected = true }
        assertTrue(rejected); assertEquals(60L*1024*1024+1,original.length())
    }
    class RecordingProvider(private val file: File, private val size: Long?, private val mime: String): ContentProvider() {
        var opened = 0
        override fun onCreate() = true
        override fun getType(uri: Uri) = mime
        override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor =
            MatrixCursor(arrayOf(OpenableColumns.SIZE)).apply { addRow(arrayOf(size)) }
        override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor { opened++; return ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY) }
        override fun insert(uri: Uri, values: ContentValues?): Uri? = null
        override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
        override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
    }
}
