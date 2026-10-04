package `in`.aiprotect.companion

import android.Manifest
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telecom.Call
import android.telecom.CallScreeningService
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34])
class CompanionTest {
    @Test fun callbackPolicyNeverAnalyzesAndNeverBlocks(){
        assertTrue(CallReviewPolicy.decide("incoming").respondAllow)
        assertFalse(CallReviewPolicy.decide("outgoing").respondAllow)
        for(d in listOf("incoming","outgoing","unknown"))assertFalse(CallReviewPolicy.decide(d).analyze)
        assertFalse(CallReviewPolicy.decide("unknown").offerReview)
    }
    @Test fun incomingCallbackRespondsAllowBeforeOfferingNotification(){
        val service=spy(Robolectric.buildService(ReviewCallScreeningService::class.java).create().get())
        val details=mock(Call.Details::class.java)
        `when`(details.callDirection).thenReturn(Call.Details.DIRECTION_INCOMING)
        service.onScreenCall(details)
        val response=org.mockito.ArgumentCaptor.forClass(CallScreeningService.CallResponse::class.java)
        verify(service).respondToCall(eq(details),response.capture())
        assertFalse(response.value.disallowCall);assertFalse(response.value.rejectCall);assertFalse(response.value.silenceCall)
        verify(details,never()).handle
    }
    @Test fun outgoingCallbackDoesNotSendAnIncomingResponse(){
        val service=spy(Robolectric.buildService(ReviewCallScreeningService::class.java).create().get())
        val details=mock(Call.Details::class.java)
        `when`(details.callDirection).thenReturn(Call.Details.DIRECTION_OUTGOING)
        service.onScreenCall(details)
        verify(service,never()).respondToCall(any(),any())
        verify(details,never()).handle
    }
    @Test fun notificationHasReviewActionAndNoStoredReviewBeforeTap(){
        val context=RuntimeEnvironment.getApplication()
        shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val id=ReviewNotifications.offer(context,"incoming",true)
        val manager=context.getSystemService(NotificationManager::class.java)
        val note=shadowOf(manager).getNotification(41)
        assertNotNull(note);assertEquals("Review this call",note.actions[0].title.toString())
        val intent=shadowOf(note.contentIntent).savedIntent
        assertEquals(id,intent.data?.lastPathSegment)
        assertEquals("incoming",intent.data?.getQueryParameter("direction"))
        assertEquals("{}",ReviewStore(context).read())
    }
    @Test fun roleRequestUsesPlatformScreeningRole(){
        val activity=Robolectric.buildActivity(MainActivity::class.java).create().get()
        val roles=activity.getSystemService(RoleManager::class.java)
        shadowOf(roles).addAvailableRole(RoleManager.ROLE_CALL_SCREENING)
        activity.requestCallRole()
        val request=shadowOf(activity).nextStartedActivityForResult.intent
        assertEquals("android.app.role.action.REQUEST_ROLE",request.action)
        assertEquals(RoleManager.ROLE_CALL_SCREENING,request.getStringExtra("android.intent.extra.ROLE_NAME"))
    }
    @Test fun shareAndDeepLinkDoNotPersistOrAnalyzeBeforeUserCheck(){
        val activity=Robolectric.buildActivity(MainActivity::class.java).create().get()
        activity.acceptIntent(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"share OTP 9876543210"))
        assertEquals("{}",ReviewStore(activity).read())
        assertFalse(activity.intent.hasExtra(Intent.EXTRA_TEXT))
        activity.acceptIntent(Intent(Intent.ACTION_VIEW,Uri.parse("aiprotect://review/12345678-abcd?direction=outgoing")))
        assertEquals("{}",ReviewStore(activity).read())
        assertNull(CallReviewPolicy.safeId("../../etc"))
    }
    @Test fun manifestExposesShareTargetAndProtectedScreeningService(){
        val context=RuntimeEnvironment.getApplication()
        val resolved=context.packageManager.queryIntentActivities(Intent(Intent.ACTION_SEND).setType("image/png"),0)
        assertTrue(resolved.any{it.activityInfo.name.endsWith("MainActivity")})
        val service=context.packageManager.getServiceInfo(android.content.ComponentName(context,ReviewCallScreeningService::class.java),0)
        assertEquals("android.permission.BIND_SCREENING_SERVICE",service.permission)
    }
    @Test fun bridgeAcceptsOnlyTheBundledTopLevelHttpsOrigin(){
        assertTrue(BridgePolicy.trustedSource(Uri.parse(BridgePolicy.ORIGIN),true))
        assertTrue(BridgePolicy.trustedSource(Uri.parse(BridgePolicy.ORIGIN+":443"),true))
        for(origin in listOf("http://appassets.androidplatform.net","https://appassets.androidplatform.net.evil.invalid","https://appassets.androidplatform.net:8443","https://user@appassets.androidplatform.net","file:///android_asset/web/index.html")) {
            assertFalse(BridgePolicy.trustedSource(Uri.parse(origin),true))
        }
        assertFalse(BridgePolicy.trustedSource(Uri.parse(BridgePolicy.ORIGIN),false))
    }
    @Test fun bridgeMessageSchemaRejectsUnknownActionsAndArbitraryRoutes(){
        val valid=BridgePolicy.parse("""{"id":"request-1","method":"loadReviews","payload":null}""")
        assertEquals("loadReviews",valid.method);assertNull(valid.payload)
        assertEquals("helpline",BridgePolicy.parse("""{"id":"request-2","method":"openRoute","payload":"helpline"}""").payload)
        for(raw in listOf(
            """{"id":"request-1","method":"listen","payload":null}""",
            """{"id":"request-1","method":"openRoute","payload":"https://evil.invalid"}""",
            """{"id":"request-1","method":"loadReviews","payload":"raw text"}""",
            """{"id":"request-1","method":"saveReviews","payload":{"raw_text":"secret"}}""",
            """{"id":"request-1","method":"ready","payload":null,"extra":"private"}"""
        )) {
            try { BridgePolicy.parse(raw);fail("Should reject invalid native request") }
            catch(_: IllegalArgumentException) {} catch(_: org.json.JSONException) {}
        }
    }
    @Test fun nativeStoragePreservesSemanticEvidenceAndDiscardsSourceData(){
        val now=System.currentTimeMillis()
        val state="""{"active":"review-12345678","raw_text":"secret source","reviews":[{
            "schema":1,"session_id":"review-12345678","started":$now,"updated":$now,
            "direction":"incoming","user_flagged":true,"claimed_org":"hdfc","consent":true,
            "events":[{"channel":"message","timestamp":$now,"tactics":["authority","payment"],
                "requested_action":"transfer","claimed_identity":"authority","persuasion_signals":["trust","coercion"],
                "verification_status":"mismatch","semantic_confidence":0.91,"semantic_tactics":["authority","payment"],
                "evidence_sources":["semantic"],"amount_bucket":"10k_50k","beneficiary_novelty":"new",
                "payment":{"amountBucket":"10k_50k","newPayee":true,"payee":"secret@bank","amount":12345},
                "raw_text":"secret source","model_corroboration":true,"modelScores":{"private":"secret source"}}],
            "timeline":[{"evidence_type":"screenshot","verification":"mismatch","evidence":["authority","trust","coercion"],
                "new_evidence":["coercion"],"stage":"Payment intent","severity":"high","evidence_strength":89,
                "workflow_confidence":89,"action_risk":94,"escalating":true,"reason":"secret source","change":"secret source"}],
            "workflow_state":"Payment intent","payment_status":"not_sent","actions_taken":[]
        }]}"""
        val context=RuntimeEnvironment.getApplication();val store=ReviewStore(context)
        store.write(state)
        val saved=org.json.JSONObject(store.read());val review=saved.getJSONArray("reviews").getJSONObject(0)
        val event=review.getJSONArray("events").getJSONObject(0)
        assertEquals("coercion",event.getJSONArray("persuasion_signals").getString(1))
        assertEquals("semantic",event.getJSONArray("evidence_sources").getString(0))
        assertEquals(0.91,event.getDouble("semantic_confidence"),0.0001)
        assertTrue(event.getBoolean("model_corroboration"));assertTrue(event.isNull("modelScores"))
        assertEquals("10k_50k",event.getJSONObject("payment").getString("amountBucket"))
        assertFalse(saved.toString().contains("secret"));assertFalse(review.has("consent"))
        assertFalse(review.getJSONArray("timeline").getJSONObject(0).has("reason"))
        context.noBackupFilesDir.resolve("reviews.json").delete()
    }
    @Test fun nativeSnapshotPolicyAcceptsLegacyEvidenceAndRejectsInvalidDerivedValues(){
        val now=System.currentTimeMillis()
        val legacy="""{"reviews":[{"schema":1,"session_id":"legacy-12345678","started":$now,
            "events":[{"channel":"call","timestamp":$now,"tactics":["credentials"],"payment":null}],
            "timeline":[{"evidence":["credentials","trust"],"verification":"mismatch","stage":"Sensitive action","severity":"warning"}]}]}"""
        val event=ReviewSnapshotPolicy.sanitize(legacy).getJSONArray("reviews").getJSONObject(0).getJSONArray("events").getJSONObject(0)
        assertEquals("credentials",event.getString("requested_action"));assertTrue(event.isNull("semantic_confidence"))
        assertEquals("mismatch",event.getString("verification_status"));assertEquals("trust",event.getJSONArray("persuasion_signals").getString(0))
        for(raw in listOf(legacy.replace("\"credentials\"","\"private message\""),legacy.replace("\"payment\":null","\"payment\":null,\"semantic_confidence\":\"private message\""),legacy.replace("\"payment\":null","\"payment\":null,\"model_corroboration\":\"private message\""))) {
            try { ReviewSnapshotPolicy.sanitize(raw);fail("Should reject invalid derived snapshot") }
            catch(_: IllegalArgumentException) {} catch(_: org.json.JSONException) {}
        }
    }
}
