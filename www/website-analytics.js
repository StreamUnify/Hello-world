/* Optional website analytics. No Google requests before consent. */
(() => {
  'use strict';
  const id = window.STREAMUNIFY_ANALYTICS?.measurementId;
  if (!/^G-[A-Z0-9]{5,20}$/.test(id || '')) return;
  if (window.Capacitor?.isNativePlatform?.() || window.STREAMUNIFY_API_BASE) return;

  const preferenceKey = 'su_analytics_consent_v1';
  let loaded = false;
  const readPreference = () => { try { return localStorage.getItem(preferenceKey); } catch { return null; } };
  const remember = value => { try { localStorage.setItem(preferenceKey, value); } catch {} };
  const blocked = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  function gtag() { window.dataLayer = window.dataLayer || []; window.dataLayer.push(arguments); }

  function enable() {
    if (loaded || blocked()) return;
    loaded = true;
    window['ga-disable-' + id] = false;
    window.gtag = gtag;
    gtag('consent', 'default', {analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('consent', 'update', {analytics_storage:'granted'});
    gtag('js', new Date());
    // Do not include search parameters, fragments, account IDs, or watchlists.
    gtag('config', id, {
      page_location: location.origin + location.pathname,
      page_referrer: (() => { try { return new URL(document.referrer).origin; } catch { return ''; } })(),
      page_title: 'StreamUnify',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_flags: 'SameSite=Lax;Secure',
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.append(script);
  }

  function disable() {
    window['ga-disable-' + id] = true;
    if (loaded) gtag('consent', 'update', {analytics_storage:'denied'});
    // Remove this host's Google Analytics cookies when consent is withdrawn.
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
      document.cookie = name + '=; Max-Age=0; Path=/; Secure; SameSite=Lax';
      const parts = location.hostname.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=' + parts.slice(i).join('.') + '; Secure; SameSite=Lax';
      }
    }
  }

  function showPreferences() {
    if (document.getElementById('su-analytics-consent')) return;
    const panel = document.createElement('section');
    panel.id = 'su-analytics-consent';
    panel.setAttribute('aria-label', 'Optional visitor analytics');
    panel.innerHTML = '<p>Allow optional Google Analytics cookies to help us understand website visits? Your choice does not affect search or watchlist access. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google privacy information</a></p><div><button type="button" data-consent="granted">Allow analytics</button><button type="button" data-consent="denied">Decline</button></div>';
    panel.querySelectorAll('[data-consent]').forEach(button => button.addEventListener('click', () => {
      const choice = button.dataset.consent;
      remember(choice);
      if (choice === 'granted') enable(); else disable();
      panel.remove();
    }));
    document.body.append(panel);
  }

  function init() {
    if (blocked()) { disable(); return; }
    const style = document.createElement('style');
    style.textContent = '#su-analytics-consent{position:fixed;bottom:16px;left:16px;right:16px;max-width:650px;margin:auto;padding:18px;background:#17203a;color:#f7f8ff;border:1px solid #6575a0;border-radius:14px;z-index:30;box-shadow:0 8px 30px #0008;font:14px/1.5 system-ui}#su-analytics-consent p{margin:0 0 12px}#su-analytics-consent a{color:#c7d8ff}#su-analytics-consent div{display:flex;gap:12px;flex-wrap:wrap}#su-analytics-consent button,#su-analytics-settings{font:inherit;color:#fff;background:#273554;border:1px solid #7484ac;border-radius:8px;padding:10px 14px;min-height:44px;cursor:pointer}#su-analytics-settings{margin:12px}';
    document.head.append(style);
    const settings = document.createElement('button');
    settings.id = 'su-analytics-settings';
    settings.type = 'button';
    settings.textContent = 'Analytics preferences';
    settings.addEventListener('click', showPreferences);
    (document.querySelector('footer') || document.body).append(settings);
    const choice = readPreference();
    if (choice === 'granted') enable();
    else if (choice !== 'denied') showPreferences();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
