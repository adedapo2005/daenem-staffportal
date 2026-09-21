import appHandler from './app-entry';
import { routePasswordAuth } from './password-auth';
import { getSessionContext } from './auth';
import { getEnhancedSessionContext } from './auth-context-v2';
import { routeDirectory } from './directory';
import { routeEmployeeSelfService } from './employee-self-service';
import { routeFinance } from './finance';
import { routeFinanceAdvanced } from './finance-advanced';
import { reconcileFulfilledSalesOrders } from './finance-sales-autopost';
import { routeBakery } from './bakery';
import { routeBakeryAccountability } from './bakery-accountability';
import { routeAutosV3 } from './autos-v3';
import { routeLogisticsV2 } from './logistics-v2';
import { routePropertiesV2 } from './properties-v2';
import { routePropertiesHostel, routePropertiesHostelPublic } from './properties-hostel';
import { routeOwnerIntelligence } from './owner-intelligence';
import { routeAccessControl } from './access-control';
import { routeOwnerSupport } from './owner-support';
import { routeMobileAuthenticated, routeMobilePublic } from './mobile-tracking';
import { runSmartReminders } from './smart-reminders';
import { routeSocial } from './social-engine';
import { routeSocialPublic } from './social-public';
import { routeSocialMediaAuthenticated, routeSocialMediaPublic } from './social-media';
import { routeWhatsAppWebhook } from './social-whatsapp';
import { routeSocialAutomationSettings } from './social-automation-settings';
import { routeSocialErpIntegration } from './social-erp-integration';
import { dispatchDueSocialJobs, processSocialQueue } from './social-dispatch';
import { routeSocialMetaCommunityWebhook, routeSocialProvider, scheduledSocialProviderSync } from './social-provider-sync';
import { routeSocialOAuthAuthenticated, routeSocialOAuthPublic, type SocialOAuthEnv } from './social-oauth';
import { routeSocialCommunity } from './social-community';
import { routeOwnerAuthRecovery } from './owner-auth-recovery';
import { guardOwnerForcedPasswordChange, routeOwnerTemporaryAccess } from './owner-temp-access';
import { routeOwnerTemporaryPasswordRepair } from './owner-temp-repair';
import { guardTemporaryPasswordChange, routeTemporaryPasswordSelf } from './temporary-password';
import { routeThemePreferences } from './theme-preferences';
import { routeNavigationWorkspace } from './navigation-workspace';
import { routeExperiencePreferences } from './experience-preferences';
import { routeHrWorkflows } from './hr-workflows';
import { routeCommunications } from './communications-service';
import { routeAdmin } from './admin';
import { routeCommunicationsWebhook } from './communications-webhook';
import { dispatchDueBroadcasts } from './broadcasts';
import { routeAiGuide } from './ai-guide';
import { routePlatformCenter, routePublicWebsite } from './platform-center';
import { routeOffline } from './offline';
import { routeSpend } from './spend';
import { routeProcurement } from './procurement';

interface Env extends SocialOAuthEnv {
  ASSETS: Fetcher;
  TIMEZONE: string;
  SOCIAL_WEBHOOK_VERIFY_TOKEN?: string;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-permitted-cross-domain-policies', 'none');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(self), geolocation=(self), microphone=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Legacy theme artwork was removed from the Staff Portal release. Block
    // stale Workers Assets copies so an old theme can never be served again.
    if (url.pathname === '/theme-assets' || url.pathname.startsWith('/theme-assets/')) {
      return secure(new Response('Not found', {
        status: 404,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      }));
    }

    if (url.pathname === '/reference-images/signin/theme-01-lagos-sunrise-hero.png') {
      return secure(new Response('Not found', {
        status: 404,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      }));
    }


    if (url.pathname.startsWith('/api/public/properties/hostel/') || url.pathname.startsWith('/properties/hostel/')) {
      const response = await routePropertiesHostelPublic(request, env);
      if (response) return secure(response);
      return secure(json({ error: 'Hostel application route not found.' }, 404));
    }

    // Repair the Owner forced-change endpoint before the legacy break-glass route.
    // This path uses the Worker-safe credential derivation and explicit D1 writes.
    const ownerRepairResponse = await routeOwnerTemporaryPasswordRepair(request.clone() as unknown as Request, env);
    if (ownerRepairResponse) return secure(ownerRepairResponse);

    // Production Owner break-glass access is handled before the standard auth stack.
    const temporaryOwnerResponse = await routeOwnerTemporaryAccess(request.clone() as unknown as Request, env);
    if (temporaryOwnerResponse) return secure(temporaryOwnerResponse);

    // Admin-issued temporary passwords use the normal employee credential identity,
    // but the account remains restricted until the employee replaces that password.
    const temporaryPasswordSelf = await routeTemporaryPasswordSelf(request.clone() as unknown as Request, env);
    if (temporaryPasswordSelf) return secure(temporaryPasswordSelf);
    const temporaryPasswordGuard = await guardTemporaryPasswordChange(request, env);
    if (temporaryPasswordGuard) return secure(temporaryPasswordGuard);

    const forcedOwnerPasswordGuard = await guardOwnerForcedPasswordChange(request, env);
    if (forcedOwnerPasswordGuard) return secure(forcedOwnerPasswordGuard);

    // Owner/Super Admin recovery is intentionally resolved before the generic
    // password handler so a missing/partial credential can never strand the Owner.
    if (url.pathname === '/api/auth/password/reset' && request.method === 'POST') {
      const ownerRecovery = await routeOwnerAuthRecovery(request, env);
      if (ownerRecovery) return secure(ownerRecovery);
    }

    if (url.pathname.startsWith('/api/public/websites/')) {
      const response = await routePublicWebsite(request, env);
      if (response) return secure(response);
      return secure(json({ error: 'Business website route not found.' }, 404));
    }

    if (url.pathname === '/api/social/webhooks/whatsapp') {
      const response = await routeWhatsAppWebhook(request, env);
      if (response) return secure(response);
      return secure(json({ error: 'WhatsApp webhook route not found.' }, 404));
    }

    if (url.pathname === '/api/communications/webhooks/whatsapp') {
      const response = await routeCommunicationsWebhook(request, env);
      if (response) return secure(response);
      return secure(json({ error: 'Communications webhook route not found.' }, 404));
    }

    if (url.pathname === '/api/social/webhooks/meta' && request.method === 'POST') {
      const providerResponse = await routeSocialMetaCommunityWebhook(request, env);
      if (providerResponse) return secure(providerResponse);
    }

    if (url.pathname.startsWith('/api/social/oauth/callback/')) {
      const oauthResponse = await routeSocialOAuthPublic(request, env);
      if (oauthResponse) return secure(oauthResponse);
      return secure(json({ error: 'Social OAuth callback route not found.' }, 404));
    }

    if (url.pathname === '/api/social/public/event' || url.pathname.startsWith('/api/social/public/media/') || url.pathname.startsWith('/api/social/webhooks/')) {
      const mediaResponse = await routeSocialMediaPublic(request, env);
      if (mediaResponse) return secure(mediaResponse);
      const response = await routeSocialPublic(request, env);
      if (response) return secure(response);
      return secure(json({ error: 'Social public API route not found.' }, 404));
    }

    if (url.pathname.startsWith('/api/mobile/device/')) {
      const response = await routeMobilePublic(request, env);
      if (response) return secure(response);
      return secure(json({ error: 'Mobile device API route not found.' }, 404));
    }

    const specialized =
      url.pathname.startsWith('/api/directory/') ||
      url.pathname.startsWith('/api/ess/') ||
      url.pathname.startsWith('/api/finance/') ||
      url.pathname.startsWith('/api/bakery/') ||
      url.pathname.startsWith('/api/autos/') ||
      url.pathname.startsWith('/api/logistics/') ||
      url.pathname.startsWith('/api/properties/') ||
      url.pathname.startsWith('/api/owner/') ||
      url.pathname.startsWith('/api/social/') ||
      url.pathname.startsWith('/api/access-control/') ||
      url.pathname.startsWith('/api/support/') ||
      url.pathname.startsWith('/api/mobile/') ||
      url.pathname.startsWith('/api/theme/') ||
      url.pathname.startsWith('/api/navigation/') ||
      url.pathname.startsWith('/api/experience/') ||
      url.pathname.startsWith('/api/ai/') ||
      url.pathname.startsWith('/api/platform/') ||
      url.pathname.startsWith('/api/hr/workflows/') ||
      url.pathname.startsWith('/api/communications/') ||
      url.pathname.startsWith('/api/admin/') ||
      url.pathname.startsWith('/api/offline/') ||
      url.pathname.startsWith('/api/procurement/') ||
      url.pathname.startsWith('/api/spend/');

    if (specialized) {
      const context = await getSessionContext(request, env);
      if (!context) return secure(json({ error: 'Authentication required.' }, 401));

      if (url.pathname.startsWith('/api/offline/')) {
        const response = await routeOffline(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/spend/')) {
        const response = await routeSpend(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/procurement/')) {
        const response = await routeProcurement(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/theme/')) {
        const response = await routeThemePreferences(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/experience/')) {
        const enhanced = await getEnhancedSessionContext(request, env);
        if (!enhanced) return secure(json({ error: 'Authentication required.' }, 401));
        const response = await routeExperiencePreferences(request, env, enhanced);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/hr/workflows/')) {
        const enhanced = await getEnhancedSessionContext(request, env);
        if (!enhanced) return secure(json({ error: 'Authentication required.' }, 401));
        const response = await routeHrWorkflows(request, env, enhanced);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/communications/')) {
        const enhanced = await getEnhancedSessionContext(request, env);
        if (!enhanced) return secure(json({ error: 'Authentication required.' }, 401));
        const response = await routeCommunications(request, env, enhanced);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        const response = await routeAdmin(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/directory/')) {
        const response = await routeDirectory(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/ess/')) {
        const response = await routeEmployeeSelfService(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/ai/')) {
        const response = await routeAiGuide(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/platform/')) {
        const response = await routePlatformCenter(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/finance/')) {
        const advanced = await routeFinanceAdvanced(request, env, context);
        if (advanced) return secure(advanced);
        const response = await routeFinance(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/bakery/')) {
        const accountability = await routeBakeryAccountability(request, env, context);
        if (accountability) return secure(accountability);
        const response = await routeBakery(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/autos/')) {
        const response = await routeAutosV3(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/logistics/')) {
        const response = await routeLogisticsV2(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/properties/')) {
        const hostel = await routePropertiesHostel(request, env, context);
        if (hostel) return secure(hostel);
        const response = await routePropertiesV2(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/owner/')) {
        const response = await routeOwnerIntelligence(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/social/')) {
        const oauthResponse = await routeSocialOAuthAuthenticated(request, env, context);
        if (oauthResponse) return secure(oauthResponse);
        const communityResponse = await routeSocialCommunity(request, env, context);
        if (communityResponse) return secure(communityResponse);
        const providerResponse = await routeSocialProvider(request, env, context);
        if (providerResponse) return secure(providerResponse);
        const integrationResponse = await routeSocialErpIntegration(request, env, context);
        if (integrationResponse) return secure(integrationResponse);
        const automationResponse = await routeSocialAutomationSettings(request, env, context);
        if (automationResponse) return secure(automationResponse);
        const mediaResponse = await routeSocialMediaAuthenticated(request, env, context);
        if (mediaResponse) return secure(mediaResponse);
        const response = await routeSocial(request, env, context);
        if (response) return secure(response);
      }

      if (url.pathname.startsWith('/api/access-control/') || url.pathname.startsWith('/api/mobile/') || url.pathname.startsWith('/api/navigation/')) {
        const enhanced = await getEnhancedSessionContext(request, env);
        if (!enhanced) return secure(json({ error: 'Authentication required.' }, 401));
        if (url.pathname.startsWith('/api/navigation/')) {
          const response = await routeNavigationWorkspace(request, env, enhanced);
          if (response) return secure(response);
        }
        if (url.pathname.startsWith('/api/access-control/')) {
          const response = await routeAccessControl(request, env, enhanced);
          if (response) return secure(response);
        }
        const response = await routeMobileAuthenticated(request, env, enhanced);
        if (response) return secure(response);
      }

      if (url.pathname.startsWith('/api/support/')) {
        const response = await routeOwnerSupport(request, env, context);
        if (response) return secure(response);
      }

      return secure(json({ error: 'API route not found.' }, 404));
    }

    // Keep the production entrypoint explicit for password sign-in. The app
    // handler also supports this route, but this guard prevents a future
    // middleware change from turning a valid login into a silent 404.
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const passwordAuthResponse = await routePasswordAuth(request, env);
      if (passwordAuthResponse) return secure(passwordAuthResponse);
    }

    return appHandler.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        const [socialDispatch, socialProviderSync, broadcastDispatch] = await Promise.all([
          dispatchDueSocialJobs(env),
          scheduledSocialProviderSync(env),
          dispatchDueBroadcasts(env),
        ]);
        const minute = new Date(controller.scheduledTime).getUTCMinutes();
        const hourly = minute === 0;
        const [reminders, financeSales] = hourly
          ? await Promise.all([runSmartReminders(env), reconcileFulfilledSalesOrders(env, 75)])
          : [{ skipped: true, reason: 'hourly_cadence' }, { skipped: true, reason: 'hourly_cadence' }];
        console.log('Daenem Workforce scheduled services', JSON.stringify({ reminders, financeSales, socialDispatch, socialProviderSync, broadcastDispatch }));
      } catch (error) {
        console.error('Daenem Workforce scheduled service failure', error);
      }
    })());
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await processSocialQueue(batch, env);
  },
} satisfies ExportedHandler<Env>;
