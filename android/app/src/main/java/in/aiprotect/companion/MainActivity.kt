package `in`.aiprotect.companion

import android.Manifest
import android.app.*
import android.app.role.RoleManager
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.util.Base64
import android.webkit.*
import android.widget.*
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import java.io.ByteArrayInputStream

/** Native role/call/share shell around the SAME offline web review and core engine. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var status: TextView
    private lateinit var store: ReviewStore
    private var ready = false
    private var nativeReply: JavaScriptReplyProxy? = null
    private var messageBridge = false
    private var pending: JSONObject? = null
    private var report: String? = null
    private var filePicker: ValueCallback<Array<Uri>>? = null
    private var shareGeneration = 0
    private val main = Handler(Looper.getMainLooper())
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = ReviewStore(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.rgb(246,245,239)) }
        root.setOnApplyWindowInsetsListener { v, insets -> v.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom); insets }
        status = TextView(this).apply { textSize = 12f; setPadding(24,12,24,4) }
        root.addView(status)
        val controls = LinearLayout(this)
        fun button(title: String, action: () -> Unit) { controls.addView(Button(this).apply { text=title; textSize=11f; setOnClickListener { action() } }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)) }
        button("Call setup") { showSetup() }
        button("Demo call") { demoCall() }
        button("After call") { deliver(JSONObject().put("kind","postcall")) }
        root.addView(controls)
        LiveReviewFeature.installControls(this, root)
        web = WebView(this)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.settings.apply {
            javaScriptEnabled=true; domStorageEnabled=false
            allowFileAccess=false; allowContentAccess=false
            mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false); javaScriptCanOpenWindowsAutomatically=false
            cacheMode=WebSettings.LOAD_NO_CACHE
            saveFormData=false
        }
        CookieManager.getInstance().setAcceptCookie(false)
        val supportsMessages = try { WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) }
            catch (_: RuntimeException) { false }
        if (supportsMessages) {
            messageBridge = true
            WebViewCompat.addWebMessageListener(web, BridgePolicy.OBJECT_NAME, setOf(BridgePolicy.ORIGIN)) { _, message, origin, isMainFrame, reply ->
                if (BridgePolicy.trustedSource(origin, isMainFrame)) {
                    try { handleBridgeMessage(message.data ?: "", reply) }
                    catch (_: Exception) { /* Reject unsupported message types. */ }
                }
            }
        } else {
            message("Update Android System WebView to enable native review storage and sharing. Local manual checks remain available.")
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                ready=false;nativeReply=null
            }
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse {
                val u=request.url
                if(BridgePolicy.trustedSource(u, true)) {
                    loader.shouldInterceptRequest(u)?.let { return it }
                }
                return WebResourceResponse("text/plain","UTF-8",403,"Offline only",emptyMap(),ByteArrayInputStream("Network disabled in Android PoC".toByteArray()))
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean = true
        }
        web.webChromeClient=object: WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>, params: FileChooserParams?): Boolean {
                filePicker?.onReceiveValue(null);filePicker=callback
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="image/*";addCategory(Intent.CATEGORY_OPENABLE) },104)
                return true
            }
        }
        root.addView(web,LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,0,1f))
        setContentView(root)
        web.loadUrl("https://appassets.androidplatform.net/web/index.html")
        acceptIntent(intent)
    }
    override fun onResume(){
        super.onResume()
        // Opening the full review ends capture before reloading derived state.
        // This keeps one writer per review and lets subsequent shares continue it.
        syncLiveReview()
        updateStatus()
    }
    private fun syncLiveReview() { if (LiveReviewFeature.openReview()) { ready=false;nativeReply=null;web.reload() } }
    override fun onNewIntent(intent: Intent){super.onNewIntent(intent);syncLiveReview();setIntent(intent);acceptIntent(intent)}
    private fun updateStatus(){
        val roles=getSystemService(RoleManager::class.java)
        val role=roles.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)&&roles.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        status.text="AI-Protect · ${if(role) "Call role enabled" else "Call role not enabled"} · offline reviews"
    }
    internal fun requestCallRole(){
        val roles=getSystemService(RoleManager::class.java)
        if(!roles.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)){message("This device does not offer the call screening role. Use Demo call or manual Review Call.");return}
        if(!roles.isRoleHeld(RoleManager.ROLE_CALL_SCREENING))startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING),101)
        else message("AI-Protect already holds the call screening role.")
    }
    private fun showSetup(){AlertDialog.Builder(this).setTitle("Call review setup")
        .setMessage("Choose AI-Protect as the call screening app, then enable notifications. This replaces another screening app if selected. This call-screening role does not start recording, block calls, or read contacts or call logs. Eligible calls only; Demo call always works.")
        .setPositiveButton("Choose call role"){_,_->requestCallRole()}
        .setNeutralButton("Notifications"){_,_->if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),102) else startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,packageName))}
        .setNegativeButton("Close",null).show()}
    private fun demoCall(){AlertDialog.Builder(this).setTitle("Simulate a call")
        .setItems(arrayOf("Incoming call","Outgoing call")){_,which->
            val direction=if(which==0)"incoming" else "outgoing"
            val id=ReviewNotifications.offer(this,direction,true)
            AlertDialog.Builder(this).setTitle("Demo $direction call")
                .setMessage("No analysis has run. Open the notification or tap Review this call. No real call is placed.")
                .setPositiveButton("Review this call"){_,_->deliver(JSONObject().put("kind","call").put("id",id).put("direction",direction))}
                .setNegativeButton("Dismiss",null).show()
        }.show()}
    internal fun acceptIntent(incoming: Intent){
        if (AudioShareReceiver.isAudioShare(incoming)) { LiveReviewFeature.handleAudioShare(this, incoming); return }
        shareGeneration++
        val generation=shareGeneration
        if(incoming.action==Intent.ACTION_VIEW){val u=incoming.data
            if(u?.scheme=="aiprotect"&&u.host=="review") {val id=CallReviewPolicy.safeId(u.lastPathSegment)?:return
                deliver(JSONObject().put("kind","call").put("id",id).put("direction",CallReviewPolicy.safeDirection(u.getQueryParameter("direction"))))
            }
        }else if(incoming.action==Intent.ACTION_SEND){
            val text=incoming.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.take(10000)?:""
            val mime=incoming.type?:""
            val uri=if(Build.VERSION.SDK_INT>=33)incoming.getParcelableExtra(Intent.EXTRA_STREAM,Uri::class.java) else @Suppress("DEPRECATION") incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if(mime.startsWith("image/")&&uri?.scheme=="content"){
                Thread { try {
                    val bytes=contentResolver.openInputStream(uri)?.use { input -> val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(out.size()<=6*1024*1024){val n=input.read(buffer);if(n<0)break;out.write(buffer,0,n)};out.toByteArray() }?:throw IllegalArgumentException()
                    require(bytes.size<=6*1024*1024)
                    main.post { if(generation==shareGeneration)deliver(JSONObject().put("kind","share").put("text",text).put("image",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("mime",mime)) }
                }catch(_:Exception){main.post { message("Image could not be read or is over 6 MB. Paste text or use a smaller QR screenshot.") }} }.start()
            }else if(text.isNotEmpty())deliver(JSONObject().put("kind","share").put("text",text))
        }
        // Remove raw payloads from our retained Intent; no URI permission is persisted.
        setIntent(Intent(this,MainActivity::class.java))
    }
    private fun deliver(payload: JSONObject){
        if(!messageBridge){pending=null;return}
        if(!ready){pending=payload;return}
        nativeReply?.postMessage(JSONObject().put("type","native").put("payload",payload).toString())
    }
    private fun message(text: String){Toast.makeText(this,text,Toast.LENGTH_LONG).show()}
    private fun handleBridgeMessage(raw: String, reply: JavaScriptReplyProxy) {
        var id: String? = null
        try {
            val request = BridgePolicy.parse(raw)
            id = request.id
            val result: Any = when (request.method) {
                "ready" -> { nativeReply=reply;ready=true;true }
                "loadReviews" -> store.read()
                "saveReviews" -> { check(ready && LiveReviewFeature.canSaveReviews());store.write(request.payload!!);true }
                "exportReport" -> {
                    report=request.payload
                    try {
                        startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            type="application/json";addCategory(Intent.CATEGORY_OPENABLE)
                            putExtra(Intent.EXTRA_TITLE,"AI-Protect-redacted-review.json")
                        },103)
                    } catch (_: ActivityNotFoundException) {
                        report=null;throw IllegalStateException("No document picker available")
                    }
                    true
                }
                "openRoute" -> {
                    val route=when(request.payload){"cybercrime"->"https://cybercrime.gov.in/";"chakshu"->"https://www.sancharsaathi.gov.in/";else->"tel:1930"}
                    try { startActivity(Intent(if(request.payload=="helpline")Intent.ACTION_DIAL else Intent.ACTION_VIEW,Uri.parse(route))) }
                    catch(_:ActivityNotFoundException) { message("Open this official route independently: $route") }
                    true
                }
                else -> throw IllegalArgumentException()
            }
            reply.postMessage(JSONObject().put("id",id).put("result",result).toString())
            if(request.method=="ready"){pending?.let { deliver(it) };pending=null}
        } catch (_: Exception) {
            if(id==null&&raw.length<=600_000)id=try { JSONObject(raw).optString("id").takeIf { it.matches(Regex("[a-zA-Z0-9-]{1,64}")) } }catch(_:Exception){null}
            if(id!=null)reply.postMessage(JSONObject().put("id",id).put("error","Invalid native request.").toString())
        }
    }
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data)
        if(requestCode==103){val value=report;report=null;if(resultCode==RESULT_OK&&data?.data!=null&&value!=null){try{contentResolver.openOutputStream(data.data!!)?.use{it.write(value.toByteArray())}}catch(_:Exception){message("Export failed. Choose a writable location.")}}}
        if(requestCode==104){filePicker?.onReceiveValue(if(resultCode==RESULT_OK&&data?.data!=null) arrayOf(data.data!!) else null);filePicker=null}
        updateStatus()
    }
    override fun onDestroy(){shareGeneration++;pending=null;report=null;nativeReply=null;ready=false;filePicker?.onReceiveValue(null);if(messageBridge)WebViewCompat.removeWebMessageListener(web,BridgePolicy.OBJECT_NAME);web.destroy();super.onDestroy()}
}
