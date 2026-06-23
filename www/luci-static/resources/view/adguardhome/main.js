'use strict';
'require ui';
'require view';

var API = '/cgi-bin/agh-api';

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
	if (method === 'POST') xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.onload = function () { if (xhr.status === 200 && cb) { try { cb(JSON.parse(xhr.responseText)); } catch (e) { cb(null); } } };
	xhr.onerror = function () { if (cb) cb(null); };
	xhr.send(body);
}

// Shared textarea style
// Resizable container style — matches ttyd iframe
var boxStyle = 'width:100%;border:none;border-radius:3px;resize:vertical;overflow-y:auto;scrollbar-gutter:stable;' +
	'background:#1e1e1e;padding:8px;box-sizing:border-box;';
var textStyle = 'margin:0;font-family:monospace;font-size:13px;white-space:pre-wrap;overflow-wrap:break-word;color:#ccc;';

return view.extend({
	_cfg: {}, _timer: null, _logTimer: null,

	load: function () {
		var v = this;
		api('get_config', null, function (cfg) {
			if (cfg) {
				// Normalize: map old mode names to new ones, default to dnsmasq-upstream
				if (!cfg.dns_mode || cfg.dns_mode === 'none') cfg.dns_mode = 'dnsmasq-upstream';
				else if (cfg.dns_mode === 'replace') cfg.dns_mode = 'exchange';
				v._cfg = cfg;
			}
			var el = document.getElementById('view');
			if (el) { el.innerHTML = ''; el.appendChild(v.render()); }
		});
		return E('div', {}, '加载中...');
	},

	render: function () {
		var v = this;
		return E('div', {}, [
			E('h2', {}, 'AdGuardHome'),
			E('p', { class: 'cbi-map-descr' }, 'DNS 广告过滤与域名劫持管理'),
			E('ul', { class: 'cbi-tabmenu' }, [
				E('li', { class: 'cbi-tab active', 'data-tab': 'status', click: function () { v._tab('status'); } },
					E('a', { href: '#' }, '运行状态')),
				E('li', { class: 'cbi-tab', 'data-tab': 'config', click: function () { v._tab('config'); } },
					E('a', { href: '#' }, '参数配置')),
				E('li', { class: 'cbi-tab', 'data-tab': 'logs', click: function () { v._tab('logs'); } },
					E('a', { href: '#' }, '系统日志'))
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
	},

	// =================== 运行状态 ===================
	_statusTab: function () {
		var v = this;
		var badge = E('span', { id: 'agh-badge', style: 'padding:4px 12px;border-radius:4px;color:#fff;background:#666;' }, '检测中...');
		var pidEl = E('span', { id: 'agh-pid' });
		var webEl = E('span', { id: 'agh-web' }, this._cfg.web_port || '3000');
		var dnsEl = E('span', { id: 'agh-dns' }, this._cfg.adh_port || '5353');
		var verEl = E('span', { id: 'agh-ver' }, '-');
		var btn = E('a', { class: 'cbi-button cbi-button-link', id: 'agh-webui', href: '#', target: '_blank' }, '打开 Web 界面');

		setTimeout(function () { v._status(badge, pidEl, webEl, dnsEl, verEl, btn); }, 200);
		v._timer = setInterval(function () { v._status(badge, pidEl, webEl, dnsEl, verEl, btn); }, 5000);

		return E('div', {}, [
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '服务状态'),
				v._row('状态', badge),
				v._row('进程 PID', pidEl, 'agh-pid-row'),
				v._row('Web 管理端口', webEl),
				v._row('DNS 监听端口', dnsEl),
				v._row('核心版本', verEl)
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '服务控制'),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', { class: 'cbi-button cbi-button-apply', click: function () { api('start', null, function(r) { alert(r ? '已启动' : '操作失败'); v._status(badge, pidEl, webEl, dnsEl, verEl, btn); }); } }, '启动'),
					E('button', { class: 'cbi-button cbi-button-reload', click: function () { api('restart', null, function(r) { alert(r ? '已重启' : '操作失败'); v._status(badge, pidEl, webEl, dnsEl, verEl, btn); }); } }, '重启'),
					E('button', { class: 'cbi-button cbi-button-reset', click: function () { api('stop', null, function(r) { alert(r ? '已停止' : '操作失败'); v._status(badge, pidEl, webEl, dnsEl, verEl, btn); }); } }, '停止'),
					btn
				])
			]),
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '核心更新'),
				v._row('最新版本', E('span', { id: 'agh-latest-ver' }, '-')),
				v._row('状态', E('span', { id: 'agh-update-text' }, '点击按钮检测更新')),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', { class: 'cbi-button cbi-button-save', id: 'agh-update-btn', click: function () { v._updateCore(); } }, '检测并更新')
				]),
				v._row('下载日志', E('textarea', { id: 'agh-update-log', readonly: true,
					style: 'width:100%;min-height:250px;border:1px solid #333;border-radius:3px;resize:both;' +
						'font-family:monospace;font-size:12px;white-space:pre-wrap;' +
						'background:transparent;color:#ccc;padding:8px;box-sizing:border-box;' }))
			])
		]);
	},

	_status: function (badge, pidEl, webEl, dnsEl, verEl, btn) {
		api('status', null, function (s) {
			if (!s) return;
			if (s.running) {
				badge.textContent = '运行中'; badge.style.background = 'darkolivegreen';
				document.getElementById('agh-pid-row').style.display = '';
				pidEl.textContent = s.pid || '-';
			} else {
				badge.textContent = '已停止'; badge.style.background = 'darkorange';
				document.getElementById('agh-pid-row').style.display = 'none';
			}
			webEl.textContent = s.web_port || '3000';
			dnsEl.textContent = s.adh_port || '5353';
			verEl.textContent = s.version || '-';
			btn.href = 'http://' + window.location.hostname + ':' + (s.web_port || '3000') + '/';
			btn.style.display = s.running ? '' : 'none';
		});
	},

	// =================== 系统日志 ===================
	_logsTab: function () {
		var v = this;
		var pre = E('pre', { id: 'agh-log-pre',
			style: 'margin:0;font-family:monospace;font-size:13px;white-space:pre-wrap;overflow-wrap:break-word;color:#ccc;' });

		var container = E('div', {
			id: 'agh-log-box',
			style: boxStyle + 'min-height:500px;'
		}, [pre]);

		setTimeout(function () { v._logs(pre); v._logTimer = setInterval(function () { v._logs(pre); }, 3000); }, 200);

		return E('div', {}, [
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, '日志查看'),
				E('div', { class: 'cbi-value' }, [
					E('div', { class: 'cbi-value-field', style: 'width:100%' }, [container])
				]),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', { class: 'cbi-button cbi-button-reload', click: function () { v._logs(pre); } }, '刷新'),
					E('label', { style: 'display:inline-flex;align-items:center;margin-left:10px' }, [
						E('input', { type: 'checkbox', id: 'agh-auto-refresh', checked: true, change: function () {
							if (this.checked) v._logTimer = setInterval(function () { v._logs(pre); }, 3000);
							else { clearInterval(v._logTimer); v._logTimer = null; }
						}}), ' 自动刷新 (3秒)'
					])
				])
			])
		]);
	},

	_logs: function (pre) {
		api('get_log', { lines: 500 }, function (r) {
			if (r) pre.textContent = r.log || '暂无日志记录';
		});
	},

	// =================== 参数配置 ===================
	_configTab: function () {
		var v = this, cfg = this._cfg || {};
		// Safety: normalize dns_mode for display even if API failed
		if (!cfg.dns_mode || cfg.dns_mode === 'none') cfg.dns_mode = 'dnsmasq-upstream';
		if (cfg.dns_mode === 'replace') cfg.dns_mode = 'exchange';

		var s = E('div', {}, [
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, 'UCI 服务配置'),
				v._row('启用服务', E('select', { id: 'cfg-enabled' }, [
					E('option', { value: '0', selected: cfg.enabled !== '1' }, '禁用'),
					E('option', { value: '1', selected: cfg.enabled === '1' }, '启用')
				])),
				v._row('DNS 模式', E('select', { id: 'cfg-dns-mode' }, [
					E('option', { value: 'dnsmasq-upstream' }, '作为dnsmasq的上游服务器'),
					E('option', { value: 'redirect' }, '重定向53端口到AdGuardHome'),
					E('option', { value: 'exchange' }, '使用53端口替换dnsmasq')
				])),
				v._row('Web 端口', E('input', { type: 'text', id: 'cfg-web-port', value: cfg.web_port || '3000', style: 'width:80px' })),
				v._row('执行文件路径', E('input', { type: 'text', id: 'cfg-binary-path', value: cfg.binary_path || '/usr/lib/AdGuardHome/AdGuardHome', style: 'width:100%' })),
				v._row('配置文件路径', E('input', { type: 'text', id: 'cfg-config-path', value: cfg.config_path || '/etc/AdGuardHome/AdGuardHome.yaml', style: 'width:100%' })),
				v._row('工作目录', E('input', { type: 'text', id: 'cfg-work-dir', value: cfg.work_dir || '/etc/AdGuardHome', style: 'width:100%' })),
				v._row('运行日志', E('input', { type: 'text', id: 'cfg-log-file', value: cfg.log_file || '/var/log/AdGuardHome.log', style: 'width:100%' })),
				v._row('下载镜像', E('input', { type: 'text', id: 'cfg-mirror', value: cfg.dl_mirror_prefix || '',
					placeholder: 'https://gh-proxy.com/https://github.com', style: 'width:100%' })),
				E('div', { class: 'cbi-page-actions' }, [
					E('button', { class: 'cbi-button cbi-button-save', click: function () { v._saveCfg(); } }, '保存配置')
				])
			])
		]);

		setTimeout(function () {
			var sel = document.getElementById('cfg-dns-mode');
			if (sel && cfg.dns_mode) sel.value = cfg.dns_mode;
			var en = document.getElementById('cfg-enabled');
			if (en) en.value = cfg.enabled || '0';
		}, 10);

		return s;
	},

	_saveCfg: function () {
		var v = this;
		var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
		var d = {
			enabled: g('cfg-enabled') || '0', dns_mode: g('cfg-dns-mode') || 'dnsmasq-upstream',
			web_port: g('cfg-web-port') || '3000',
			binary_path: g('cfg-binary-path') || '', config_path: g('cfg-config-path') || '',
			work_dir: g('cfg-work-dir') || '', log_file: g('cfg-log-file') || '',
			dl_mirror_prefix: g('cfg-mirror') || ''
		};
		api('save_config', d, function () { v._cfg = d; alert('配置已保存，服务已重启'); });
	},

	_updateCore: function () {
		var v = this;
		var btn = document.getElementById('agh-update-btn');
		var span = document.getElementById('agh-update-text');
		var logTa = document.getElementById('agh-update-log');

		btn.disabled = true;
		span.textContent = '正在检测最新版本...';

		api('check_update', null, function (r) {
			if (!r || r.error) {
				span.textContent = r ? r.error : '检测失败';
				btn.disabled = false;
				return;
			}
			document.getElementById('agh-latest-ver').textContent = r.latest || '-';

			if (r.is_latest) {
				span.textContent = '已是最新版本 (' + r.current + ')，无需更新';
				btn.disabled = false;
				return;
			}

			span.textContent = '发现新版本 ' + r.latest + '，正在下载...';
			logTa.value = '';

			api('update', { version: r.latest }, function () {
				var timer = setInterval(function () {
					api('update_progress', null, function (p) {
						if (!p) return;
						var prog = parseInt(p.progress) || 0;
						if (p.log) logTa.value = p.log;
						logTa.scrollTop = logTa.scrollHeight;
						if (prog >= 100) {
							clearInterval(timer);
							span.textContent = '更新完成！';
							btn.disabled = false;
						}
					});
				}, 1000);
			});
		});
	},

	_row: function (label, field, rowId) {
		var attrs = { class: 'cbi-value' };
		if (rowId) attrs.id = rowId;
		return E('div', attrs, [ E('label', { class: 'cbi-value-title' }, label), E('div', { class: 'cbi-value-field' }, [field]) ]);
	},

	handleSave: null,
	handleSaveApply: null
});
