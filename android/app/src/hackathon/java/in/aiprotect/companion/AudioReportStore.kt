package `in`.aiprotect.companion

import android.content.Context
import org.json.JSONObject
import java.io.File

/** Derived summaries only. No recording or full transcript is retained. */
class AudioReportStore(context: Context) {
    private val directory = File(context.noBackupFilesDir, "audio-reports").apply { mkdirs() }
    fun list(): List<JSONObject> = directory.listFiles().orEmpty().mapNotNull { file ->
        try {
            require(file.extension == "json")
            val report = JSONObject(file.readText())
            require(System.currentTimeMillis() - report.getLong("created") in 0..86_400_000)
            report
        } catch (_: Exception) { file.delete(); null }
    }.sortedByDescending { it.getLong("created") }
    fun save(report: JSONObject) {
        val id = CallReviewPolicy.safeId(report.getString("id")) ?: error("Invalid report ID")
        list().filter { it.getString("id") != id }.drop(9).forEach { delete(it.getString("id")) }
        val pending = File(directory, "$id.tmp"); pending.writeText(report.toString())
        check(pending.renameTo(File(directory, "$id.json"))) { "Could not save review summary." }
    }
    fun delete(id: String) { CallReviewPolicy.safeId(id)?.let { File(directory, "$it.json").delete() } }
}
