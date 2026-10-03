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
}
