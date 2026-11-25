'use strict';
'require ui';
'require view';

var API = '/cgi-bin/agh-api';
var authWarned = false;

function api(action, params, cb) {
	var xhr = new XMLHttpRequest(), method = 'GET', url = API + '?action=' + encodeURIComponent(action), body = null;
	if (action === 'get_log' && params) url += '&lines=' + (params.lines || 15) + '&offset=' + (params.offset || 0);
	if (action === 'update' && params) url += '&version=' + encodeURIComponent(params.version || '');
	if (action === 'save_yaml') {
		method = 'POST';
		body = 'action=' + action;
		if (params) for (var k in params) {
			var v = encodeURIComponent(params[k] || '');
			v = v.replace(/%2F/g, '/').replace(/%3A/g, ':');
			body += '&' + k + '=' + v;
		}
	}
	if (action === 'save_config' && params) {
		for (var k in params) {
			var v = encodeURIComponent(params[k] || '');
			v = v.replace(/%2F/g, '/').replace(/%3A/g, ':');
			url += '&' + k + '=' + v;
		}
	}
	xhr.open(method, url, true);
	// uhttpd does not pass custom headers to CGI scripts, so mirror the LuCI
	// session id into a same-origin cookie that the CGI can validate via ubus.
	try {
		if (typeof L !== 'undefined' && L.env && L.env.sessionid) {
			var sid = L.env.sessionid;
			if (document.cookie.indexOf('agh_sid=' + sid) < 0) {
				document.cookie = 'agh_sid=' + sid + '; path=/; SameSite=Strict' +
					(window.location.protocol === 'https:' ? '; Secure' : '');
			}
		}
	} catch (e) {}
	if (method === 'POST') xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.onload = function () {
		if (xhr.status === 403) {
			if (!authWarned && typeof ui !== 'undefined' && ui.addNotification) {
				authWarned = true;
				ui.addNotification('AdGuardHome', _('Session expired, please reload the page'), 'warning');
			}
			if (cb) cb(null);
			return;
		}
		if (xhr.status === 200 && cb) { try { cb(JSON.parse(xhr.responseText)); } catch (e) { cb(null); } }
	};
	xhr.onerror = function () { if (cb) cb(null); };
	xhr.send(body);
}

// UI styling for the whole view.  Theme variables are used with light-theme
// fallbacks so it matches whatever LuCI theme is active.
var AGH_CSS = [
	'.agh-log-shell{position:relative;border:1px solid var(--border-color-low,#cfd4d8);border-radius:8px;overflow:hidden;background:var(--background-color-low,#fff)}',
	'.agh-log-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;background:var(--background-color-high,#f4f5f7);border-bottom:1px solid var(--border-color-low,#cfd4d8)}',
	'.agh-log-meta{margin-right:auto;font-size:12px;color:var(--text-color-low,#6b7280);white-space:nowrap}',
	'.agh-log-meta b{font-weight:600;color:var(--text-color,#2b3440)}',
	'.agh-log-sep{opacity:.5;padding:0 2px}',
	'.agh-log-c-err{color:#d9534f}',
	'.agh-log-c-warn{color:#c98a10}',
	'.agh-log-bar input[type=text]{width:190px;padding:4px 8px;border:1px solid var(--border-color-low,#cfd4d8);border-radius:4px;background:var(--background-color-low,#fff);color:var(--text-color,#2b3440);font-size:12px;outline:none}',
	'.agh-log-bar input[type=text]:focus{border-color:var(--primary,#2b89d6);box-shadow:0 0 0 2px rgba(43,137,214,.15)}',
	'.agh-log-bar select{padding:4px 6px;border:1px solid var(--border-color-low,#cfd4d8);border-radius:4px;background:var(--background-color-low,#fff);color:var(--text-color,#2b3440);font-size:12px}',
	'.agh-log-bar .cbi-button{font-size:12px;padding:3px 10px;line-height:18px;margin:0}',
	'.agh-log-auto{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text-color,#2b3440);cursor:pointer;user-select:none;margin:0}',
	'.agh-log-view{height:560px;min-height:240px;overflow:auto;resize:vertical;padding:6px 0 30px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:12.5px;line-height:1.62;background:var(--background-color-low,#fff);color:var(--text-color,#2b3440);scrollbar-gutter:stable}',
	'.agh-log-line{display:flex;gap:8px;padding:1px 12px;border-left:3px solid transparent;white-space:pre-wrap;overflow-wrap:anywhere}',
	'.agh-log-line:hover{background:rgba(127,127,127,.10)}',
	'.agh-log-time{flex:none;color:var(--text-color-low,#8b95a1);font-variant-numeric:tabular-nums}',
	'.agh-log-lv{flex:none;min-width:46px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding-top:1px;color:var(--text-color-low,#8b95a1)}',
	'.agh-log-tag{flex:none;color:var(--primary,#2b89d6);font-weight:600}',
	'.agh-log-msg{flex:1 1 auto;min-width:0}',
	'.agh-log-line.lv-err{border-left-color:#d9534f}',
	'.agh-log-line.lv-err .agh-log-lv{color:#d9534f}',
	'.agh-log-line.lv-warn{border-left-color:#e0a028}',
	'.agh-log-line.lv-warn .agh-log-lv{color:#c98a10}',
	'.agh-log-line.lv-notice{border-left-color:#2b89d6}',
	'.agh-log-line.lv-notice .agh-log-lv{color:#2b89d6}',
	'.agh-log-empty{padding:28px 16px;text-align:center;color:var(--text-color-low,#8b95a1);font-size:13px}',
	'.agh-log-jump{position:absolute;right:16px;bottom:14px;font-size:12px;padding:4px 12px;border-radius:14px;border:none;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);background:var(--primary,#2b89d6);color:#fff}',
	'.agh-log-jump:hover{filter:brightness(1.08)}',

	// ---- app shell / tabs ----
	'.agh-app h2{margin:0 0 4px;font-size:22px}',
	'.agh-app .agh-lead{margin:0;color:var(--text-color-low,#6b7280);font-size:13px}',
	'.agh-app .cbi-tabmenu{display:flex;flex-wrap:wrap;gap:4px;margin:14px 0 16px;padding:0 0 0 2px;list-style:none;border-bottom:1px solid var(--border-color-low,#e3e7eb);background:none}',
	'.agh-app .cbi-tabmenu>li{margin:0;padding:0;border:0;background:none}',
	'.agh-app .cbi-tabmenu>li>a{display:block;padding:8px 16px;font-size:14px;line-height:1.2;color:var(--text-color-low,#5b6673);text-decoration:none;border-radius:8px 8px 0 0;border-bottom:2px solid transparent;transition:background .15s,color .15s}',
	'.agh-app .cbi-tabmenu>li>a:hover{background:rgba(127,127,127,.08);color:var(--text-color,#2b3440)}',
	'.agh-app .cbi-tabmenu>li.active>a,.agh-app .cbi-tabmenu>li.cbi-tab-active>a{color:var(--primary,#2b89d6);border-bottom-color:var(--primary,#2b89d6);background:rgba(43,137,214,.06);font-weight:600}',

	// ---- cards ----
	'.agh-card{border:1px solid var(--border-color-low,#e3e7eb);border-radius:10px;background:var(--background-color-low,#fff);margin:0 0 14px;overflow:hidden}',
	'.agh-card-h{display:flex;align-items:baseline;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-color-low,#eef1f4);background:var(--background-color-high,#f8f9fb)}',
	'.agh-card-h h3,.agh-card-h h4{margin:0;font-size:14px;font-weight:600}',
	'.agh-card-h .agh-sub{font-size:12px;color:var(--text-color-low,#6b7280)}',
	'.agh-card-b{padding:14px}',

	// ---- status pill / hero / tiles ----
	'.agh-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;background:#8b95a1}',
	'.agh-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.9}',
	'.agh-pill-ok{background:#2e7d32}',
	'.agh-pill-off{background:#c77700}',
	'.agh-pill-wait{background:#8b95a1}',
	'.agh-hero{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;padding:16px 18px;border:1px solid var(--border-color-low,#e3e7eb);border-radius:10px;background:linear-gradient(180deg,var(--background-color-high,#f8f9fb),var(--background-color-low,#fff));margin-bottom:14px}',
	'.agh-hero-title{font-size:18px;font-weight:700;margin:6px 0 2px}',
	'.agh-hero-sub{font-size:12.5px;color:var(--text-color-low,#6b7280)}',
	'.agh-hero-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
	'.agh-hero-actions .cbi-button{margin:0}',
	'.agh-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}',
	'.agh-tile{border:1px solid var(--border-color-low,#e3e7eb);border-radius:10px;background:var(--background-color-low,#fff);padding:12px 14px}',
	'.agh-tile-k{font-size:12px;color:var(--text-color-low,#6b7280);margin-bottom:6px}',
	'.agh-tile-v{font-size:20px;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums;word-break:break-all}',
	'.agh-tile-v.agh-tile-sm{font-size:15px;line-height:1.4}',

	// ---- update card ----
	'.agh-update-row{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center}',
	'.agh-update-row .cbi-button{margin-left:auto}',
	'.agh-kv{font-size:13px;color:var(--text-color-low,#6b7280)}',
	'.agh-kv b{color:var(--text-color,#2b3440);font-weight:600}',
	'#agh-update-text{font-size:13px;color:var(--text-color-low,#6b7280)}',
	'.agh-progress{display:none;height:6px;border-radius:999px;background:rgba(127,127,127,.18);overflow:hidden;margin:12px 0 10px}',
	'.agh-progress-bar{height:100%;width:0;background:var(--primary,#2b89d6);transition:width .3s ease}',
	'.agh-update-log{width:100%;min-height:170px;margin-top:2px;padding:10px;border:1px solid var(--border-color-low,#e3e7eb);border-radius:8px;background:var(--background-color-low,#fff);color:var(--text-color,#2b3440);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;resize:vertical;box-sizing:border-box}',

	// ---- config form ----
	'.agh-field{margin-bottom:15px}',
	'.agh-field>.agh-label{display:block;font-size:12.5px;font-weight:600;color:var(--text-color,#2b3440);margin-bottom:5px}',
	'.agh-field .agh-hint{display:block;font-size:12px;color:var(--text-color-low,#6b7280);margin-top:4px;line-height:1.5}',
	'.agh-field input[type=text],.agh-field input[type=number]{width:100%;max-width:520px;padding:7px 10px;border:1px solid var(--border-color-low,#cfd4d8);border-radius:6px;background:var(--background-color-low,#fff);color:var(--text-color,#2b3440);font-size:13px;box-sizing:border-box;outline:none}',
	'.agh-field input[type=text]:focus,.agh-field input[type=number]:focus{border-color:var(--primary,#2b89d6);box-shadow:0 0 0 3px rgba(43,137,214,.15)}',
	'.agh-field input.agh-input-sm{max-width:180px}',
	'.agh-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 18px}',
	'.agh-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:6px 0 4px}',
	'.agh-mode{position:relative;border:1px solid var(--border-color-low,#cfd4d8);border-radius:8px;padding:10px 12px 10px 36px;cursor:pointer;display:block;background:var(--background-color-low,#fff);transition:border-color .15s,background .15s}',
	'.agh-mode:hover{border-color:var(--primary,#2b89d6)}',
	'.agh-mode input[type=radio]{position:absolute;left:12px;top:12px;width:16px;height:16px;margin:0;padding:0;opacity:0;cursor:pointer}',
	'.agh-mode .agh-radio{position:absolute;left:12px;top:12px;width:16px;height:16px;border:2px solid var(--border-color-high,#9aa3ad);border-radius:50%;box-sizing:border-box;background:var(--background-color-low,#fff);transition:border-color .15s}',
	'.agh-mode.is-checked .agh-radio{border-color:var(--primary,#2b89d6)}',
	'.agh-mode.is-checked .agh-radio::after{content:"";position:absolute;left:3px;top:3px;width:6px;height:6px;border-radius:50%;background:var(--primary,#2b89d6)}',
	'.agh-mode input[type=radio]:focus-visible+.agh-radio{box-shadow:0 0 0 3px rgba(43,137,214,.25)}',
	'.agh-mode b{font-size:13px}',
	'.agh-mode .agh-mode-desc{display:block;font-size:12px;color:var(--text-color-low,#6b7280);margin-top:4px;line-height:1.5}',
	'.agh-mode.is-checked{border-color:var(--primary,#2b89d6);background:rgba(43,137,214,.06);box-shadow:0 0 0 1px var(--primary,#2b89d6) inset}',
	'.agh-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;user-select:none}',
	'.agh-switch input{position:absolute;opacity:0;width:0;height:0}',
	'.agh-switch .agh-track{width:38px;height:22px;border-radius:999px;background:#b7bec7;position:relative;transition:background .15s;flex:none}',
	'.agh-switch .agh-track::after{content:"";position:absolute;left:2px;top:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.25)}',
	'.agh-switch input:checked+.agh-track{background:var(--primary,#2b89d6)}',
	'.agh-switch input:checked+.agh-track::after{transform:translateX(16px)}',
	'.agh-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:2px 0 4px}'
].join('\n');

return view.extend({
	_cfg: {}, _timer: null, _logTimer: null,

	load: function () {
		var v = this;
		api('get_config', null, function (cfg) {
			if (cfg) {
				// Normalize: map old mode names to new ones, default to exchange
				if (!cfg.dns_mode || cfg.dns_mode === 'none') cfg.dns_mode = 'exchange';
				else if (cfg.dns_mode === 'replace') cfg.dns_mode = 'exchange';
				v._cfg = cfg;
			}
			var el = document.getElementById('view');
			if (el) { el.innerHTML = ''; el.appendChild(v.render()); }
		});
		return E('div', {}, _('Loading…'));
	},

	render: function () {
		var v = this;
		return E('div', { class: 'agh-app' }, [
			E('style', {}, AGH_CSS),
			E('h2', {}, 'AdGuardHome'),
			E('p', { class: 'agh-lead' }, _('DNS ad blocking and hijacking control')),
			E('ul', { class: 'cbi-tabmenu' }, [
				E('li', { class: 'cbi-tab active', 'data-tab': 'status', click: function () { v._tab('status'); } },
					E('a', { href: '#' }, _('Status'))),
				E('li', { class: 'cbi-tab', 'data-tab': 'config', click: function () { v._tab('config'); } },
					E('a', { href: '#' }, _('Settings'))),
				E('li', { class: 'cbi-tab', 'data-tab': 'logs', click: function () { v._tab('logs'); } },
					E('a', { href: '#' }, _('Logs')))
			]),
			E('div', { id: 'tab-status' }, this._statusTab()),
			E('div', { id: 'tab-config', style: 'display:none' }, this._configTab()),
			E('div', { id: 'tab-logs', style: 'display:none' }, this._logsTab())
		]);
	},

	_tab: function (name) {
		['status', 'logs', 'config'].forEach(function (t) {
			var el = document.getElementById('tab-' + t);
			if (el) el.style.display = (t === name) ? '' : 'none';
		});
		document.querySelectorAll('.cbi-tabmenu .cbi-tab').forEach(function (li) {
			li.classList.toggle('active', li.getAttribute('data-tab') === name);
		});
		// Timers only run while their tab is visible
		if (name !== 'status' && this._timer) { clearInterval(this._timer); this._timer = null; }
		if (name === 'logs') {
			this._logs();
			this._startLogTimer();
		} else {
			this._stopLogTimer();
		}
	},

	// =================== 运行状态 ===================
	_modeLabel: function (mode) {
		switch (mode) {
			case 'exchange': return _('Replace dnsmasq (53)');
			case 'redirect': return _('Redirect 53');
			case 'dnsmasq-upstream': return _('dnsmasq upstream');
			case 'none': return _('No hijack');
			default: return mode || '-';
		}
	},

	_statusTab: function () {
		var v = this, cfg = this._cfg || {};
		var badge = E('span', { id: 'agh-badge', class: 'agh-pill agh-pill-wait' }, _('Checking…'));
		var pidEl = E('div', { id: 'agh-pid', class: 'agh-tile-v' }, '-');
		var webEl = E('div', { id: 'agh-web', class: 'agh-tile-v' }, cfg.web_port || '3000');
		var dnsEl = E('div', { id: 'agh-dns', class: 'agh-tile-v' }, cfg.adh_port || '5353');
		var verEl = E('span', { id: 'agh-ver' }, '-');
		var btn = E('a', { class: 'cbi-button cbi-button-action', id: 'agh-webui', href: '#', target: '_blank' }, _('Open web UI ↗'));

		var refresh = function () { v._status(badge, pidEl, webEl, dnsEl, verEl, btn); };
		var act = function (action, done) {
			api(action, null, function (r) {
				if (done) ui.addNotification('AdGuardHome', r ? done : _('Action failed'), r ? 'success' : 'warning');
				refresh();
			});
		};

		setTimeout(refresh, 200);
		v._timer = setInterval(refresh, 5000);

		return E('div', {}, [
			E('div', { class: 'agh-hero' }, [
				E('div', {}, [
					badge,
					E('div', { class: 'agh-hero-title' }, 'AdGuardHome'),
					E('div', { class: 'agh-hero-sub' }, [_('Core version') + ' ', verEl])
				]),
				E('div', { class: 'agh-hero-actions' }, [
					E('button', { class: 'cbi-button cbi-button-apply', click: function () { act('start', _('Started')); } }, _('Start')),
					E('button', { class: 'cbi-button cbi-button-reload', click: function () { act('restart', _('Restarted')); } }, _('Restart')),
					E('button', { class: 'cbi-button cbi-button-reset', click: function () { act('stop', _('Stopped')); } }, _('Stop')),
					btn
				])
			]),
			E('div', { class: 'agh-tiles' }, [
				E('div', { class: 'agh-tile' }, [
					E('div', { class: 'agh-tile-k' }, _('Web port')), webEl
				]),
				E('div', { class: 'agh-tile' }, [
					E('div', { class: 'agh-tile-k' }, _('DNS port')), dnsEl
				]),
				E('div', { class: 'agh-tile' }, [
					E('div', { class: 'agh-tile-k' }, _('DNS mode')),
					E('div', { class: 'agh-tile-v agh-tile-sm' }, this._modeLabel(cfg.dns_mode))
				]),
				E('div', { class: 'agh-tile', id: 'agh-pid-row' }, [
					E('div', { class: 'agh-tile-k' }, _('Process PID')), pidEl
				])
			]),
			E('div', { class: 'agh-card' }, [
				E('div', { class: 'agh-card-h' }, [
					E('h3', {}, _('Core update')),
					E('span', { class: 'agh-sub' }, _('GitHub Releases · mirror supported'))
				]),
				E('div', { class: 'agh-card-b' }, [
					E('div', { class: 'agh-update-row' }, [
						E('span', { class: 'agh-kv' }, [_('Latest version') + ' ', E('b', { id: 'agh-latest-ver' }, '-')]),
						E('span', { id: 'agh-update-text' }, _('Click "Check and update" to get the latest version')),
						E('button', { class: 'cbi-button cbi-button-action', id: 'agh-update-btn', click: function () { v._updateCore(); } }, _('Check and update'))
					]),
					E('div', { class: 'agh-progress', id: 'agh-progress' }, [E('div', { id: 'agh-progress-bar', class: 'agh-progress-bar' })]),
					E('textarea', { id: 'agh-update-log', class: 'agh-update-log', readonly: true, placeholder: _('Update log will appear here') })
				])
			])
		]);
	},

	_status: function (badge, pidEl, webEl, dnsEl, verEl, btn) {
		var v = this;
		api('status', null, function (s) {
			if (!s) return;
			if (s.running) {
				badge.textContent = _('Running');
				badge.className = 'agh-pill agh-pill-ok';
				document.getElementById('agh-pid-row').style.display = '';
				pidEl.textContent = s.pid || '-';
			} else {
				badge.textContent = _('Stopped');
				badge.className = 'agh-pill agh-pill-off';
				document.getElementById('agh-pid-row').style.display = 'none';
			}
			webEl.textContent = s.web_port || '3000';
			// In exchange mode AdGuardHome owns port 53 and adh_port belongs to
			// dnsmasq, so show the port AGH actually listens on.
			dnsEl.textContent = (v._cfg.dns_mode === 'exchange') ? '53' : (s.adh_port || '5353');
			verEl.textContent = s.version || '-';
			btn.href = 'http://' + window.location.hostname + ':' + (s.web_port || '3000') + '/';
			btn.style.display = s.running ? '' : 'none';
		});
	},

	// =================== 系统日志 ===================
	_logsTab: function () {
		var v = this;
		v._logLines = v._logLines || [];
		v._logAtBottom = true;

		var meta = E('span', { class: 'agh-log-meta', id: 'agh-log-meta' }, _('Loading…'));
		var view = E('div', { class: 'agh-log-view', id: 'agh-log-view' });
		var jump = E('button', { class: 'agh-log-jump', id: 'agh-log-jump', style: 'display:none',
			click: function () { view.scrollTop = view.scrollHeight; jump.style.display = 'none'; } }, _('↓ Jump to latest'));

		view.addEventListener('scroll', function () {
			var atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 24;
			v._logAtBottom = atBottom;
			jump.style.display = (atBottom || !v._logLines.length) ? 'none' : '';
		});

		var bar = E('div', { class: 'agh-log-bar' }, [
			meta,
			E('select', { id: 'agh-log-level', change: function () { v._renderLog(); } }, [
				E('option', { value: 'all' }, _('All levels')),
				E('option', { value: 'err' }, _('Errors only')),
				E('option', { value: 'warn' }, _('Warnings only')),
				E('option', { value: 'notice' }, _('Notices only'))
			]),
			E('input', { type: 'text', id: 'agh-log-filter', placeholder: _('Filter keyword…'),
				keyup: function () { v._renderLog(); } }),
			E('label', { class: 'agh-log-auto' }, [
				E('input', { type: 'checkbox', id: 'agh-log-auto', checked: true, change: function () {
					if (this.checked) v._startLogTimer(); else v._stopLogTimer();
				} }),
				_('Auto refresh')
			]),
			E('button', { class: 'cbi-button cbi-button-action', click: function () { v._logs(true); } }, _('Refresh')),
			E('button', { class: 'cbi-button', click: function () { v._copyLog(); } }, _('Copy'))
		]);

		return E('div', {}, [
			E('div', { class: 'agh-card' }, [
				E('div', { class: 'agh-card-h' }, [
					E('h3', {}, _('System log')),
					E('span', { class: 'agh-sub' }, _('Refreshes every 3s · only while this tab is open'))
				]),
				E('div', { class: 'agh-card-b' }, [
					E('div', { class: 'agh-log-shell' }, [bar, view, jump])
				])
			])
		]);
	},

	_startLogTimer: function () {
		var v = this, cb = document.getElementById('agh-log-auto');
		v._stopLogTimer();
		if (cb && !cb.checked) return;
		v._logTimer = setInterval(function () { v._logs(); }, 3000);
	},

	_stopLogTimer: function () {
		if (this._logTimer) { clearInterval(this._logTimer); this._logTimer = null; }
	},

	_logs: function (force) {
		var v = this;
		api('get_log', { lines: 500 }, function (r) {
			if (!r) return;
			var text = String(r.log || '').replace(/\s+$/, '');
			if (!force && text === v._logRaw) { v._updateLogMeta(); return; }
			v._logRaw = text;
			v._logLines = text ? text.split('\n') : [];
			v._renderLog();
		});
	},

	_esc: function (s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	},

	_parseLogLine: function (line) {
		var m = line.match(/^(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\.(\w+)\s+([^:]+):\s?(.*)$/);
		var time = '', lv = '', tag = '', msg = line;
		if (m) {
			time = m[1]; lv = m[3].toLowerCase(); tag = m[4].trim(); msg = m[5];
		} else {
			var m2 = line.match(/^(\S+)\.(emerg|alert|crit|err|error|warning|warn|notice|info|debug)\s+([^:]+):\s?(.*)$/);
			if (m2) { lv = m2[2].toLowerCase(); tag = m2[3].trim(); msg = m2[4]; }
		}
		var cat = 'plain';
		if (/^(emerg|alert|crit|err|error)$/.test(lv)) cat = 'err';
		else if (/^(warn|warning)$/.test(lv)) cat = 'warn';
		else if (lv === 'notice') cat = 'notice';
		else if (lv) cat = 'info';
		return { time: time, lv: lv, tag: tag, msg: msg, cat: cat };
	},

	_renderLog: function () {
		var v = this, view = document.getElementById('agh-log-view');
		if (!view) return;
		var levelEl = document.getElementById('agh-log-level');
		var filterEl = document.getElementById('agh-log-filter');
		var lv = (levelEl && levelEl.value) ? levelEl.value : 'all';
		var kw = (filterEl ? filterEl.value : '').trim().toLowerCase();
		var counts = { err: 0, warn: 0, notice: 0, info: 0, plain: 0 };
		var html = [], shown = 0;
		for (var i = 0; i < v._logLines.length; i++) {
			var raw = v._logLines[i];
			if (!raw) continue;
			var p = v._parseLogLine(raw);
			counts[p.cat] = (counts[p.cat] || 0) + 1;
			if (lv !== 'all' && p.cat !== lv) continue;
			if (kw && raw.toLowerCase().indexOf(kw) < 0) continue;
			shown++;
			html.push('<div class="agh-log-line lv-' + p.cat + '">' +
				(p.time ? '<span class="agh-log-time">' + v._esc(p.time) + '</span>' : '') +
				(p.lv ? '<span class="agh-log-lv">' + v._esc(p.lv) + '</span>' : '') +
				(p.tag ? '<span class="agh-log-tag">' + v._esc(p.tag) + '</span>' : '') +
				'<span class="agh-log-msg">' + v._esc(p.msg) + '</span></div>');
		}
		view.innerHTML = html.length ? html.join('') :
			'<div class="agh-log-empty">' + (kw || lv !== 'all' ? _('No matching log lines') : _('No log entries')) + '</div>';
		v._logCounts = counts;
		v._logShown = shown;
		if (v._logAtBottom !== false) view.scrollTop = view.scrollHeight;
		v._updateLogMeta();
	},

	_updateLogMeta: function () {
		var el = document.getElementById('agh-log-meta');
		if (!el) return;
		var c = this._logCounts || {};
		var parts = [ _('Lines: %s').format(this._logLines.length) ];
		if (typeof this._logShown === 'number' && this._logShown !== this._logLines.length) {
			parts.push(_('Matched: %s').format(this._logShown));
		}
		if (c.err) parts.push('<span class="agh-log-c-err">' + _('Errors: %s').format(c.err) + '</span>');
		if (c.warn) parts.push('<span class="agh-log-c-warn">' + _('Warnings: %s').format(c.warn) + '</span>');
		var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
		parts.push(_('Updated %s').format(pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())));
		el.innerHTML = parts.join(' <span class="agh-log-sep">·</span> ');
	},

	_copyLog: function () {
		var text = (this._logLines || []).join('\n');
		if (!text) { ui.addNotification('AdGuardHome', _('Nothing to copy'), 'info'); return; }
		function fallback() {
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand('copy');
				ui.addNotification('AdGuardHome', _('Copied to clipboard'), 'success');
			} catch (e) {
				ui.addNotification('AdGuardHome', _('Copy failed'), 'warning');
			}
			document.body.removeChild(ta);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(
				function () { ui.addNotification('AdGuardHome', _('Copied to clipboard'), 'success'); },
				fallback
			);
		} else {
			fallback();
		}
	},

	// =================== 参数配置 ===================
	_configTab: function () {
		var v = this, cfg = this._cfg || {};
		// Safety: normalize dns_mode for display even if API failed
		if (!cfg.dns_mode || cfg.dns_mode === 'none') cfg.dns_mode = 'exchange';
		if (cfg.dns_mode === 'replace') cfg.dns_mode = 'exchange';

		var MODES = [
			['exchange', _('Replace dnsmasq on port 53'), _('Recommended. AdGuardHome takes 53 and dnsmasq moves to the DNS port below')],
			['redirect', _('Redirect port 53 to AdGuardHome'), _('Keep dnsmasq and DNAT LAN queries to AdGuardHome with nftables')],
			['dnsmasq-upstream', _('Use as dnsmasq upstream'), _('dnsmasq keeps 53 and forwards queries to AdGuardHome')]
		];

		var modeCards = MODES.map(function (m) {
			var on = cfg.dns_mode === m[0];
			return E('label', { class: 'agh-mode' + (on ? ' is-checked' : '') }, [
				E('input', { type: 'radio', name: 'agh-dns-mode', value: m[0], checked: on,
					change: function () { v._syncModeCards(); } }),
				E('span', { class: 'agh-radio' }),
				E('b', {}, m[1]),
				E('span', { class: 'agh-mode-desc' }, m[2])
			]);
		});

		var field = function (label, node, hint) {
			var kids = [E('div', { class: 'agh-label' }, label), node];
			if (hint) kids.push(E('span', { class: 'agh-hint' }, hint));
			return E('div', { class: 'agh-field' }, kids);
		};

		return E('div', {}, [
			E('div', { class: 'agh-card' }, [
				E('div', { class: 'agh-card-h' }, [
					E('h3', {}, _('General')),
					E('span', { class: 'agh-sub' }, _('Saved to UCI and restarts the service'))
				]),
				E('div', { class: 'agh-card-b' }, [
					field(_('Service'), E('label', { class: 'agh-switch' }, [
						E('input', { type: 'checkbox', id: 'cfg-enabled', checked: cfg.enabled === '1' }),
						E('span', { class: 'agh-track' }),
						E('span', {}, _('Enable on boot'))
					])),
					field(_('DNS mode'), E('div', { class: 'agh-modes' }, modeCards),
						_('Switching mode reconfigures dnsmasq / nftables')),
					E('div', { class: 'agh-grid2' }, [
						field(_('Web port'), E('input', { type: 'number', id: 'cfg-web-port', class: 'agh-input-sm',
							min: '1', max: '65535', value: cfg.web_port || '3000' })),
						field(_('DNS port'), E('input', { type: 'number', id: 'cfg-adh-port', class: 'agh-input-sm',
							min: '1', max: '65535', value: cfg.adh_port || '5353' }),
							_('In exchange mode dnsmasq uses this port; otherwise AdGuardHome listens on it'))
					])
				])
			]),
			E('div', { class: 'agh-card' }, [
				E('div', { class: 'agh-card-h' }, [E('h3', {}, _('Paths'))]),
				E('div', { class: 'agh-card-b' }, [
					field(_('Binary'), E('input', { type: 'text', id: 'cfg-binary-path',
						value: cfg.binary_path || '/usr/lib/AdGuardHome/AdGuardHome' }),
						_('Online updates install the new binary here')),
					field(_('Config file'), E('input', { type: 'text', id: 'cfg-config-path',
						value: cfg.config_path || '/etc/AdGuardHome/AdGuardHome.yaml' }),
						_('AdGuardHome YAML config, passed to the process with --config')),
					field(_('Work directory'), E('input', { type: 'text', id: 'cfg-work-dir',
						value: cfg.work_dir || '/etc/AdGuardHome' }),
						_('Runtime data such as statistics and query log')),
					field(_('Log file'), E('input', { type: 'text', id: 'cfg-log-file',
						value: cfg.log_file || '/var/log/AdGuardHome.log' }),
						_('Reserved. The Logs tab reads syslog (logread)'))
				])
			]),
			E('div', { class: 'agh-card' }, [
				E('div', { class: 'agh-card-h' }, [E('h3', {}, _('Downloads'))]),
				E('div', { class: 'agh-card-b' }, [
					field(_('Download mirror prefix'), E('input', { type: 'text', id: 'cfg-mirror',
						value: cfg.dl_mirror_prefix || '',
						placeholder: 'https://gh-proxy.com/https://github.com' }),
						_('Leave empty to use GitHub directly, or set another accelerator prefix')),
					E('div', { class: 'agh-actions' }, [
						E('button', { class: 'cbi-button cbi-button-apply', click: function () { v._saveCfg(); } }, _('Save and restart')),
						E('span', { class: 'agh-hint', style: 'margin:0' }, _('Saves to UCI and restarts AdGuardHome'))
					])
				])
			])
		]);
	},

	_syncModeCards: function () {
		document.querySelectorAll('input[name="agh-dns-mode"]').forEach(function (el) {
			var p = el.parentNode;
			if (p) p.classList.toggle('is-checked', el.checked);
		});
	},

	_saveCfg: function () {
		var v = this;
		var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
		var en = document.getElementById('cfg-enabled');
		var modeEl = document.querySelector('input[name="agh-dns-mode"]:checked');
		var d = {
			enabled: (en && en.checked) ? '1' : '0',
			dns_mode: modeEl ? modeEl.value : 'exchange',
			web_port: g('cfg-web-port') || '3000',
			adh_port: g('cfg-adh-port') || '5353',
			binary_path: g('cfg-binary-path') || '',
			config_path: g('cfg-config-path') || '',
			work_dir: g('cfg-work-dir') || '',
			log_file: g('cfg-log-file') || '',
			dl_mirror_prefix: g('cfg-mirror') || ''
		};
		api('save_config', d, function (r) {
			if (!r || r.success === false) {
				ui.addNotification('AdGuardHome', _('Save failed'), 'warning');
				return;
			}
			v._cfg = d;
			ui.addNotification('AdGuardHome', _('Configuration saved, service restarted'), 'success');
		});
	},

	_updateCore: function () {
		var v = this;
		var btn = document.getElementById('agh-update-btn');
		var span = document.getElementById('agh-update-text');
		var logTa = document.getElementById('agh-update-log');
		var bar = document.getElementById('agh-progress-bar');
		var wrap = document.getElementById('agh-progress');
		var setBar = function (p) { if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%'; };
		var showBar = function (on) { if (wrap) wrap.style.display = on ? '' : 'none'; };
		var updateErrors = {
			latest_version_unavailable: _('Could not fetch the latest version'),
			version_required: _('Version is required'),
			invalid_version: _('Invalid version')
		};

		btn.disabled = true;
		span.textContent = _('Checking for the latest version…');
		setBar(0);
		showBar(false);

		api('check_update', null, function (r) {
			if (!r || r.error) {
				span.textContent = (r && updateErrors[r.error]) || _('Check failed');
				btn.disabled = false;
				return;
			}
			document.getElementById('agh-latest-ver').textContent = r.latest || '-';

			if (r.is_latest) {
				span.textContent = _('Already up to date (%s)').format(r.current || '-');
				showBar(false);
				btn.disabled = false;
				return;
			}

			span.textContent = _('New version %s found, downloading…').format(r.latest);
			if (logTa) logTa.value = '';
			showBar(true);
			setBar(5);

			api('update', { version: r.latest }, function () {
				var retries = 0;
				var timer = setInterval(function () {
					retries++;
					if (retries > 600) {
						clearInterval(timer);
						span.textContent = _('Update timed out, please retry');
						showBar(false);
						btn.disabled = false;
						return;
					}
					api('update_progress', null, function (p) {
						if (!p) return;
						var prog = parseInt(p.progress) || 0;
						if (p.log && logTa) logTa.value = p.log;
						if (logTa) logTa.scrollTop = logTa.scrollHeight;
						setBar(prog);
						if (prog < 0) {
							clearInterval(timer);
							span.textContent = _('Update failed, see the download log');
							showBar(false);
							btn.disabled = false;
						} else if (prog >= 100) {
							clearInterval(timer);
							span.textContent = _('Update complete!');
							showBar(false);
							btn.disabled = false;
							v._statusRefresh();
						}
					});
				}, 1000);
			});
		});
	},

	// after an update the version/PID changed, so refresh the hero card
	_statusRefresh: function () {
		var badge = document.getElementById('agh-badge');
		var pid = document.getElementById('agh-pid');
		var web = document.getElementById('agh-web');
		var dns = document.getElementById('agh-dns');
		var ver = document.getElementById('agh-ver');
		var btn = document.getElementById('agh-webui');
		if (badge && pid && web && dns && ver && btn) this._status(badge, pid, web, dns, ver, btn);
	},

	handleSave: null,
	handleSaveApply: null
});
