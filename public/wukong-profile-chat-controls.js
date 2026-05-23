(function () {
  'use strict';

  var BUILD = 'wukong-profile-chat-controls-v2-i18n-profile-file';
  var observer = null;
  var apiBaseCache = '';
  var textCache = null;

  // Keep only a tiny fallback so the UI still works if the locale JSON fails to load.
  // Main translations live in peipe-xprofile-v19/i18n/<locale>.json.
  var FALLBACK_TEXT = {
    directChat: '私信',
    allowDirectChat: '允许别人给我发私信',
    allowDirectChatDesc: '关闭后，其他用户不能从个人主页打开你的悟空私信；话题聊天室不受影响。',
    directChatOn: '私信已开启',
    directChatOff: '私信已关闭',
    saveFail: '保存失败',
    loading: '加载中...',
    chat: '聊天',
    chatUnavailable: '当前不能发起聊天',
    peerClosed: '对方已关闭私信聊天',
    youClosed: '你已关闭私信聊天',
    directChatBlocked: '你们之间的聊天已被屏蔽',
    openChat: '打开悟空聊天',
    loginRequired: '请先登录',
    networkError: '网络错误'
  };

  function localeFile() {
    var raw = String(
      (window.config && (config.userLang || config.language || config.locale)) ||
      (window.app && app.user && (app.user.language || app.user.locale)) ||
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      'zh-CN'
    );

    if (/^my/i.test(raw) || /^burmese/i.test(raw)) return 'my-MM';
    if (/^en/i.test(raw)) return 'en-GB';
    return 'zh-CN';
  }

  function relativePath() {
    return (window.config && config.relative_path) || '';
  }

  function i18nUrl() {
    return relativePath() + '/plugins/nodebb-theme-peipe-xhs/peipe-xprofile-v19/i18n/' + localeFile() + '.json?v=2';
  }

  async function loadText() {
    if (textCache) return textCache;

    try {
      var res = await fetch(i18nUrl(), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (res.ok) {
        var json = await res.json();
        textCache = Object.assign({}, FALLBACK_TEXT, json || {});
        return textCache;
      }
    } catch (_) {}

    textCache = FALLBACK_TEXT;
    return textCache;
  }

  function t(key) {
    var dict = textCache || FALLBACK_TEXT;
    // saveFailed was used by the old standalone file. Keep it compatible,
    // but prefer the existing profile key saveFail.
    if (key === 'saveFailed') return dict.saveFailed || dict.saveFail || FALLBACK_TEXT.saveFail;
    if (key === 'blocked') return dict.blocked || dict.directChatBlocked || FALLBACK_TEXT.directChatBlocked;
    return dict[key] || FALLBACK_TEXT[key] || key;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[ch];
    });
  }

  function toast(message, isError) {
    var old = document.querySelector('.wkpc-toast');
    if (old) old.remove();

    var el = document.createElement('div');
    el.className = 'wkpc-toast' + (isError ? ' is-error' : '');
    el.textContent = message;
    document.body.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add('show');
    });

    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 220);
    }, 2200);
  }

  function cleanUid(value) {
    return String(value == null ? '' : value).trim().replace(/[^0-9]/g, '');
  }

  function currentUserUid() {
    return cleanUid(
      (window.app && app.user && app.user.uid) ||
      (window.ajaxify && ajaxify.data && ajaxify.data.loggedInUser && ajaxify.data.loggedInUser.uid) ||
      (window.config && config.uid) ||
      ''
    );
  }

  function isProfilePage() {
    return /^\/user\//.test(location.pathname || '') ||
      !!(window.ajaxify && ajaxify.data && (ajaxify.data.uid || ajaxify.data.userslug) && /\/user\//.test(location.pathname || ''));
  }

  function profileUid() {
    var data = (window.ajaxify && ajaxify.data) || {};
    return cleanUid(
      data.uid ||
      data.user && data.user.uid ||
      data.account && data.account.uid ||
      document.querySelector('[data-uid]') && document.querySelector('[data-uid]').getAttribute('data-uid') ||
      ''
    );
  }

  function profileSlug() {
    var data = (window.ajaxify && ajaxify.data) || {};
    var raw =
      data.userslug ||
      data.user && data.user.userslug ||
      data.account && data.account.userslug ||
      data.username ||
      '';

    raw = String(raw || '').trim();
    if (raw && !/^\d+$/.test(raw)) return raw;

    var match = (location.pathname || '').match(/\/user\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function profileDisplayName() {
    var data = (window.ajaxify && ajaxify.data) || {};
    return String(
      data.username ||
      data.displayname ||
      data.user && (data.user.username || data.user.displayname) ||
      profileSlug() ||
      ''
    ).trim();
  }

  async function tryApi(base, path, opts) {
    var url = base.replace(/\/+$/, '') + path;
    var res = await fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    }, opts || {}));

    var data = null;
    try { data = await res.json(); } catch (_) { data = {}; }

    if (!res.ok) {
      var err = new Error(data && (data.message || data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }

    apiBaseCache = base;
    return data;
  }

  async function api(path, opts) {
    var candidates = apiBaseCache ? [apiBaseCache] : ['/api/wukong', '/bridge', ''];
    var lastErr = null;

    for (var i = 0; i < candidates.length; i++) {
      try {
        return await tryApi(candidates[i], path, opts);
      } catch (err) {
        lastErr = err;
        if (err.status !== 404) throw err;
      }
    }

    throw lastErr || new Error('api_not_found');
  }

  function ensureStyle() {
    if (document.getElementById('wkpc-style')) return;

    var style = document.createElement('style');
    style.id = 'wkpc-style';
    style.textContent = `
.wkpc-card {
  margin: 16px 0;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255,255,255,.92);
  border: 1px solid rgba(229,231,235,.9);
  box-shadow: 0 8px 24px rgba(15,23,42,.08);
}
.wkpc-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.wkpc-copy {
  flex: 1;
  min-width: 0;
}
.wkpc-title {
  font-size: 16px;
  font-weight: 750;
  color: #111827;
  line-height: 1.25;
}
.wkpc-desc {
  margin-top: 6px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.35;
}
.wkpc-switch {
  width: 52px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: #d1d5db;
  position: relative;
  flex: 0 0 auto;
  transition: background .18s ease;
}
.wkpc-switch::after {
  content: "";
  width: 26px;
  height: 26px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  box-shadow: 0 2px 8px rgba(15,23,42,.18);
  transition: transform .18s ease;
}
.wkpc-switch.is-on {
  background: #22c55e;
}
.wkpc-switch.is-on::after {
  transform: translateX(22px);
}
.wkpc-profile-chat {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  min-height: 38px !important;
  padding: 0 16px !important;
  border-radius: 999px !important;
  font-weight: 700 !important;
  text-decoration: none !important;
  background: #111827 !important;
  color: #fff !important;
  border: 0 !important;
}
.wkpc-profile-chat.is-disabled {
  opacity: .48 !important;
  pointer-events: auto !important;
  background: #9ca3af !important;
}
.wkpc-toast {
  position: fixed;
  left: 50%;
  bottom: max(28px, env(safe-area-inset-bottom));
  transform: translate(-50%, 18px);
  opacity: 0;
  z-index: 2147483600;
  max-width: min(88vw, 360px);
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(17,24,39,.92);
  color: #fff;
  font-size: 14px;
  line-height: 1.3;
  box-shadow: 0 8px 26px rgba(15,23,42,.25);
  transition: opacity .18s ease, transform .18s ease;
}
.wkpc-toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
.wkpc-toast.is-error {
  background: rgba(220,38,38,.94);
}
@media (max-width: 768px) {
  .wkpc-card {
    margin: 12px 0;
    border-radius: 16px;
  }
}
`;
    document.head.appendChild(style);
  }

  function settingsMountTarget() {
    return document.querySelector('[component="account/settings"]') ||
      document.querySelector('.account-settings') ||
      document.querySelector('.account') ||
      document.querySelector('#content .container') ||
      document.querySelector('#content');
  }

  function isSettingsPage() {
    return /\/settings(?:\/)?$/.test(location.pathname || '') ||
      /\/user\/[^/]+\/settings/.test(location.pathname || '') ||
      document.querySelector('[component="account/settings"], .account-settings');
  }

  async function mountSettings() {
    if (!isSettingsPage()) return;
    await loadText();
    ensureStyle();

    var target = settingsMountTarget();
    if (!target || document.getElementById('wkpc-direct-chat-card')) return;

    var card = document.createElement('section');
    card.id = 'wkpc-direct-chat-card';
    card.className = 'wkpc-card';
    card.innerHTML =
      '<div class="wkpc-row">' +
        '<div class="wkpc-copy">' +
          '<div class="wkpc-title">' + escapeHtml(t('allowDirectChat')) + '</div>' +
          '<div class="wkpc-desc">' + escapeHtml(t('allowDirectChatDesc')) + '</div>' +
        '</div>' +
        '<button type="button" class="wkpc-switch" aria-pressed="true" aria-label="' + escapeHtml(t('allowDirectChat')) + '"></button>' +
      '</div>';

    var button = card.querySelector('.wkpc-switch');

    function setSwitch(enabled) {
      button.classList.toggle('is-on', !!enabled);
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    setSwitch(true);
    target.insertBefore(card, target.firstChild);

    try {
      var state = await api('/chat-controls/settings', { method: 'GET' });
      var enabled = !state.settings || state.settings.direct_chat_enabled !== false;
      setSwitch(enabled);
    } catch (err) {
      toast(t('networkError'), true);
    }

    button.addEventListener('click', async function () {
      var next = !button.classList.contains('is-on');
      setSwitch(next);
      button.disabled = true;

      try {
        await api('/chat-controls/settings', {
          method: 'POST',
          body: JSON.stringify({ direct_chat_enabled: next })
        });
        toast(next ? t('directChatOn') : t('directChatOff'));
      } catch (err) {
        setSwitch(!next);
        toast((err && err.message) || t('saveFail'), true);
      } finally {
        button.disabled = false;
      }
    });
  }

  function buildWukongUrl(uid) {
    return relativePath() + '/wukong/' + encodeURIComponent(String(uid));
  }

  function findChatCandidates() {
    var out = [];

    document.querySelectorAll('a, button').forEach(function (el) {
      var text = String(el.textContent || '').trim().toLowerCase();
      var href = el.getAttribute && String(el.getAttribute('href') || '');
      var cls = String(el.className || '');
      var data = String(el.getAttribute && (el.getAttribute('data-action') || el.getAttribute('data-ajaxify') || '') || '');

      if (
        text === '聊天' ||
        text === 'chat' ||
        text.indexOf('私聊') !== -1 ||
        href.indexOf('/chats') !== -1 ||
        href.indexOf('/wukong/') !== -1 ||
        /chat/i.test(cls) ||
        /chat/i.test(data)
      ) {
        out.push(el);
      }
    });

    return out;
  }

  async function canOpenPeer(uid) {
    try {
      var res = await api('/chat-controls/peer/' + encodeURIComponent(uid), { method: 'GET' });
      if (res && res.can_direct_chat === false) {
        if (res.self_direct_chat_enabled === false) return { ok: false, message: t('youClosed') };
        if (res.peer_direct_chat_enabled === false) return { ok: false, message: t('peerClosed') };
        if (res.blocked) return { ok: false, message: t('blocked') };
        return { ok: false, message: t('chatUnavailable') };
      }
    } catch (err) {
      if (err && err.status === 404) return { ok: true };
      return { ok: false, message: (err && err.message) || t('networkError') };
    }

    return { ok: true };
  }

  async function onProfileChatClick(ev, uid, url) {
    ev.preventDefault();
    ev.stopPropagation();

    if (!currentUserUid()) {
      toast(t('loginRequired'), true);
      return;
    }

    var check = await canOpenPeer(uid);
    if (!check.ok) {
      toast(check.message || t('chatUnavailable'), true);
      return;
    }

    location.href = url;
  }

  async function patchProfileChat() {
    if (!isProfilePage()) return;
    await loadText();
    ensureStyle();

    var uid = profileUid();
    var self = currentUserUid();
    if (!uid || (self && uid === self)) return;

    var url = buildWukongUrl(uid);
    var candidates = findChatCandidates();

    if (!candidates.length) {
      var actionArea =
        document.querySelector('.pxp19-actions') ||
        document.querySelector('.account-stats') ||
        document.querySelector('[component="account/profile"]') ||
        document.querySelector('#content');

      if (actionArea && !document.querySelector('.wkpc-profile-chat')) {
        var a = document.createElement('a');
        a.className = 'wkpc-profile-chat';
        a.href = url;
        a.textContent = t('chat');
        actionArea.appendChild(a);
        candidates.push(a);
      }
    }

    candidates.forEach(function (el) {
      if (el.getAttribute('data-wkpc-patched') === '1') return;

      el.setAttribute('data-wkpc-patched', '1');
      el.classList.add('wkpc-profile-chat');
      if (el.tagName === 'A') el.setAttribute('href', url);
      el.setAttribute('title', t('openChat'));
      el.setAttribute('aria-label', t('openChat'));

      if (!String(el.textContent || '').trim() || /chat|聊天|私聊/i.test(String(el.textContent || ''))) {
        el.textContent = t('chat');
      }

      el.addEventListener('click', function (ev) {
        onProfileChatClick(ev, uid, url);
      }, true);
    });

    try {
      var status = await api('/chat-controls/peer/' + encodeURIComponent(uid), { method: 'GET' });
      var disabled = status && status.can_direct_chat === false;
      candidates.forEach(function (el) {
        el.classList.toggle('is-disabled', !!disabled);
        if (disabled) el.setAttribute('title', t('chatUnavailable'));
      });
    } catch (_) {}
  }

  function run() {
    mountSettings();
    patchProfileChat();
  }

  function boot() {
    loadText().finally(run);

    if (window.ajaxify && typeof ajaxify.on === 'function') {
      ajaxify.on('action:ajaxify.end', function () {
        textCache = null;
        setTimeout(run, 50);
      });
    }

    if (!observer) {
      observer = new MutationObserver(function () {
        clearTimeout(window.__wkpcMutationTimer);
        window.__wkpcMutationTimer = setTimeout(run, 120);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.WukongProfileChatControls = {
    version: BUILD,
    api: api,
    run: run
  };
})();
