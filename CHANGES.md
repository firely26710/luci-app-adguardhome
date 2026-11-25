# 改动说明（v2.0.0）

> 记录本轮针对 `luci-app-adguardhome` 的全部改动、原因与验证结果。
> 测试环境：OpenWrt 25.12.5 x86_64（VM），AdGuardHome v1.0.0，路由器地址 192.168.44.131。
> 包版本：`2.0.0-r2`（Makefile 的 PKG_VERSION / PKG_RELEASE）。

## 1. 总览

| 文件 | 类型 | 改动要点 |
|------|------|----------|
| `etc/init.d/AdGuardHome` | 服务脚本 | 修复路径检查、`--config`、端口切换竞态、进程识别；删除死代码 |
| `usr/bin/agh-update` | 更新脚本 | 按官方 `install.sh` 移植架构识别；HTTP 错误处理 |
| `www/cgi-bin/agh-api` | CGI 后端 | JSON 转义加固；更新失败返回 `-1` |
| `www/luci-static/resources/view/adguardhome/main.js` | 前端 | 三个页签全部重做（状态 / 配置 / 日志）+ 英文化 |
| `po/` `i18n/` | i18n | 英文 msgid 的 `.po` 源文件与 zh-cn `.lmo` 编译产物 |
| `tools/mklmo.py` | Python | 不依赖 po2lmo 的 `.lmo` 生成器 |

统计：16 个文件，`2042 insertions(+), 341 deletions(-)`（`git diff --cached --stat`）；
新增本文件、`docs/build-apk.md`、`docs/ui-preview/` 下 4 张预览图、`po/`、`i18n/` 与
`tools/mklmo.py`，版本号从 1.0.1 提升到 2.0.0。

---

## 2. `etc/init.d/AdGuardHome`

### 2.1 修复：自定义 `binary_path` 后服务起不来
`start_service()` 原来先调 `check_binary()` 再 `config_load`。此时 UCI 还没加载，
`config_get` 一律回落到默认路径，用户改了 `binary_path` 也只会检查默认路径，
日志固定输出 `Binary not found: /usr/lib/AdGuardHome/AdGuardHome`，服务不启动。

改动：把 `config_load adguardhome` 提到 `check_binary` 之前。

### 2.2 修复：`config_path` 对 AGH 进程无效
启动命令只传了 `--work-dir`，AGH 固定读取 `<work_dir>/AdGuardHome.yaml`；
而端口替换逻辑改的是 `config_path`。两者不一致时（用户改了其中任一项），
AGH 会按旧端口启动并报 `bind: address already in use`。

改动：启动命令增加 `--config "$config_path"`，并确保配置目录存在。
现在「改哪个文件、AGH 读哪个文件」是同一个。

### 2.3 修复：端口改不回去（无法自愈）
`rm_port53()` 原来在 `dnsmasq` 已经是 53 时直接 `return`，后面的
YAML 端口恢复永远不会执行。一旦出现不一致状态，只能手动改 YAML。

改动：抽出 `set_yaml_dns_port()`，先改 YAML，再判断 dnsmasq 是否需要动。
两个方向（抢占 53 / 让回 53）都变成幂等操作，异常状态在下次启动时自动修正。

### 2.4 修复：模式切换的 YAML 竞态（关键）
AdGuardHome 退出时会重写自己的 YAML，而 procd 的 kill 是异步的：
`restart` 里「写端口 → 旧进程退出时覆盖」会互相打架，导致 AGH 绑错端口
（实测切换后 yaml 显示 53，进程却监听 5353）。

改动：
- `agh_pid()`：用 `/proc/<pid>/exe` 精确识别 AGH 进程。
  **不能用 `pidof AdGuardHome`**——init 脚本自身 basename 也是 AdGuardHome，
  pidof 会匹配到自己，导致每次启动空等 15 秒。
- `wait_agh_exit()`：等待旧进程真正退出。
- 自定义 `restart()`：`stop → 等进程消失 → start`。
  实测 none ↔ exchange 反复切换稳定，单次 0–2 秒。

### 2.5 其他
- `replace` 模式并入 `redirect` 分支（原来 `generate_nft_rules` 支持但
  `apply_dns_mode` 没有分支，UCI 为 replace 时不会做任何劫持）。
- `stop_service` 始终执行清理（不再因 `mode=none` 跳过，避免残留 nft 规则）。
- 删除 `reload_service`：procd 模式下 `/etc/rc.common` 的 `reload()` 实际执行
  `restart`，该函数从未被调用，且参数与 `start_service` 不一致。
- 删除 `service_triggers`：实测 `uci commit` 的 config.change 触发不稳定，
  且 `reload → start` 与端口切换存在竞态。CGI 保存配置时本来就显式 restart，
  功能不受影响；CLI 改配置后需手动 `/etc/init.d/AdGuardHome restart`。

---

### 2.6 修复：redirect 模式默认不生效（关键）
原规则是 `dnat ip to 127.0.0.1:<adh_port>`。Linux 默认
`net.ipv4.conf.<if>.route_localnet=0`，到环回地址的 DNAT 包会在路由阶段被丢弃：
nft 规则看起来存在，客户端却 DNS 超时，AGH 也收不到查询。实测把
`route_localnet` 置 1 后立即恢复，确认了原因。

改动：改用 `redirect to :<adh_port>`（本地重定向）。不依赖 sysctl，且保留客户端
源地址——AGH 查询日志里能看到真实客户端 IP（实测 192.168.44.1）。replace 模式同样处理。

## 3. `usr/bin/agh-update`

### 3.1 架构识别按官方脚本重写
参考官方 `scripts/install.sh`：

- `is_little_endian()`：用 `hexdump -o` 探测字节序（官方注释：OpenWrt 有
  `hexdump` 没有 `od`）。
- `detect_arch()`：`uname -m` → 发布包 CPU 名。支持
  `amd64 / 386 / armv5 / armv6 / armv7（含 armv8l）/ arm64 / riscv64`，
  **mips、mips64 按字节序选择 `mipsle_softfloat` 或 `mips_softfloat`**。
  原实现把 `mips` 一律映射成大端包，mipsel 路由器会下载错架构。

路由器上的映射自测（x86_64 环境，mips 行按本机字节序）：

```
x86_64 → amd64      i686 → 386        armv5l → armv5    armv6l → armv6
armv7l → armv7      armv8l → armv7    aarch64 → arm64   riscv64 → riscv64
mips → mipsle_softfloat              mips64 → mips64le_softfloat
sparc64 → UNSUPPORTED
```

### 3.2 下载与错误处理
- `set -e` 改为 `set -e -f -u`（与官方一致）。
- `curl` 增加 `-f`：HTTP 404 不再被当作成功把错误页交给 `tar`
  （实测会得到 `gzip: invalid magic`）。

### 3.3 只保留最近一份备份
每次更新会把旧二进制备份为 `AdGuardHome.bak-<时间戳>`（约 32 MB）。
原来没有清理逻辑，更新几次就会占满小路由器的 flash。

改动：备份目录改为从 `binary_path` 推导；创建新备份后用 `find` + `sort -r`
删除除最新一份以外的旧备份（`set -f` 下不能用通配符，所以用 `find`）。
实测更新后备份数量保持为 1。

### 3.4 校验和验证
官方 release 的 `checksums.txt` 与 tarball 同目录发布。

改动：
- 下载完 tarball 后，用同一 URL 目录取 `checksums.txt`；
- 用 `sha256sum` 比对文件名对应的一行；
- **不匹配直接中止更新并清理临时目录**；
- 取不到 `checksums.txt` 或没有 `sha256sum` 时只告警继续（兼容不代理该文件的镜像）。

注意：官方 `checksums.txt` 里的文件名带 `./` 前缀（`./AdGuardHome_linux_amd64.tar.gz`），
比对前会先去掉前缀。

单元测试（提取函数后喂入伪造的 checksums）：

```
mismatch  → Error: checksum mismatch ... rc=1
match     → Checksum OK: ...             rc=0
missing   → Warning: not listed ...      rc=0
```

---

## 4. `www/cgi-bin/agh-api`

### 4.1 `json_escape` 加固
原实现只转义反斜杠和引号。日志里出现 tab 等控制字符时，整个 JSON 会失效，
前端页面直接空白。

改动：删除除 TAB/LF 以外的控制字符，并把 TAB 转义为 `\t`。
验证：`{"log":"a\tb\"c\\d\n"}` 可被 `json.load` 正常解析。

### 4.2 更新失败不再报成功
原来后台任务无论如何都写 `100`，下载失败前端也显示「更新完成」。

改动：按真实退出码写 `100` / `-1`；前端把负数识别为失败。

### 4.3 接口鉴权
原来 `/cgi-bin/agh-api` 没有任何鉴权，局域网内不带登录态即可：
读配置、启停服务、修改镜像前缀并触发下载执行。

实现上有两个坑：
1. LuCI 的 `sysauth_http` cookie 作用域是 `/cgi-bin/luci`，浏览器不会把它发给
   本 CGI；
2. uhttpd **不会把自定义请求头传给 CGI**（实测只传 `HTTP_ACCEPT`/`HTTP_HOST`/
   `HTTP_USER_AGENT`），所以不能用 `X-Luci-Session` 这类头。

最终方案：
- 前端从 `L.env.sessionid` 取当前会话 id，写入同源 cookie
  `agh_sid=<sid>; path=/; SameSite=Strict`（HTTPS 下加 `Secure`）；
- CGI 从 `HTTP_COOKIE` 读取 `agh_sid`（兼容 `sysauth_http` 作为手工测试回退），
  调用 `ubus call session get '{"ubus_rpc_session":"<sid>"}'` 校验，
  失败返回 `403` + JSON；
- 前端遇到 `403` 时提示「登录状态已失效」。

实测：无 cookie / 伪造 cookie → `403`；`agh_sid` 或 `sysauth_http` 携带有效
会话 → `200`；未登录触发 `update` → `403`。

---

## 5. `main.js`（三个页签全部重做）

### 5.1 全局
- 所有配色改用 LuCI 主题变量（`--background-color-*`、`--text-color-*`、
  `--border-color-low`、`--primary`），带浅色主题兜底值，明暗主题都协调。
- 自定义标签页样式（下划线胶囊），卡片式布局，统一样式常量 `AGH_CSS`
  在 `render()` 里注入一次。

### 5.2 运行状态
- 顶部 hero：状态胶囊（运行中/已停止，带颜色）、核心版本、启动/重启/停止、
  打开 Web 界面（仅在运行时显示）。
- 四个信息卡：Web 管理端口、DNS 监听端口、DNS 工作模式、进程 PID
  （停止时自动隐藏 PID 卡）。
- 核心更新卡：最新版本、状态文案、右侧「检测并更新」按钮、进度条
  （空闲时隐藏，更新时显示 0–100%，失败时变 −1 文案）、下载日志。
- 更新完成后自动刷新状态卡（版本 / PID）。
- 操作结果用 `ui.addNotification` 提示，不再用 `alert` 打断。

### 5.3 参数配置
- 「启用服务」改为开关控件。
- DNS 模式改为三选一卡片（带一句话说明），选中项高亮。
- 单选框改为自绘圆点：Argon 主题对 `input:focus` 的阴影会让原生 radio
  出现一大圈椭圆光晕（已在本地用主题 CSS 复现），自绘后不受主题影响；
  输入框的焦点样式也收窄到 `text/number`，不再误伤 radio。
- **补充了「DNS 端口」输入框**：原来 UI 没有 `adh_port` 字段，
  只能改 UCI 文件；现在和 `web_port` 并排显示，并注明 exchange 模式下的含义。
- 路径（执行文件 / 配置文件 / 工作目录 / 日志文件）与下载镜像分组到卡片，
  每项带说明文字。
- 保存按钮改为「保存并重启」，成功/失败用通知提示。

### 5.4 系统日志
- 工具栏：行数与错误/警告统计、更新时间、级别筛选、关键字过滤、
  自动刷新开关、刷新、复制。
- 日志按「时间 | 级别 | 进程 | 消息」四列对齐；错误/警告/通知有颜色与左边框。
- 自动滚动到底部；向上翻时出现「↓ 回到最新」。
- 内容未变化时只更新时间，不重建 DOM。
- **只在本页签打开时轮询**（原来页面一加载就每 3 秒拉 500 行）。
- 一键复制全部日志（带失败回退）。

---

## 6. 国际化（i18n）

采用 LuCI 原生 gettext 机制：源码用英文 msgid + `_()`，`.po` 目录编译成 `.lmo`，
由 `/cgi-bin/luci/admin/translations/<lang>` 合并成 `window.TR`；前端的 `_()`
用 msgid 的 32 位 sfh 哈希查表。

改动：
- `main.js` 全部界面文案改为英文 msgid 并用 `_()` 包裹（共 90 条，含带 `%s` 的模板）；
- 新增 `po/zh-cn/luci-app-adguardhome.po`（英文 msgid → 中文）；
- 新增 `i18n/luci-app-adguardhome.zh-cn.lmo`（编译产物，Makefile 直接安装到
  `/usr/lib/lua/luci/i18n/`）；
- 新增 `tools/mklmo.py`：不依赖 `po2lmo`，纯 Python 生成 LuCI 兼容的 `.lmo`
  （值区 + 按 key 排序的索引 + 索引偏移；key 使用与前端一致的 sfh 哈希）；
- CGI 不再返回中文文案，改为稳定错误码（`unauthorized` / `version_required` /
  `invalid_version` / `latest_version_unavailable`），由前端用 `_()` 映射；
- 顺带修复：`update` 的 `version=` 解析原来在缺参数时会把整个 query string
  当成版本号（实测会触发一次无效下载），现在严格解析并校验版本格式。

验证：
- 切到 `zh-cn`：`window.TR["6f951ca9"]="系统日志"`、`TR["20a2f699"]="运行中"`；
- 切到 `en`：翻译包里没有我们的 key，界面回退为英文 msgid；
- 90 条 msgid 与 po 条目一一对应；未登录触发 `update` 仍返回 403。

注意：`_()` 的 key 是 `sfh(trimws(msgid))`，修改文案必须同步修改 po，并重新
生成 `.lmo`（`python3 tools/mklmo.py po/zh-cn/luci-app-adguardhome.po i18n/luci-app-adguardhome.zh-cn.lmo`）。

## 7. 验证记录（路由器实测）

| 项目 | 结果 |
|------|------|
| 自定义 `binary_path` 启动 | 通过（修复前必失败） |
| `config_path` 与实际读取一致 | 通过（`ps` 可见 `--config`） |
| none ↔ exchange 反复切换 | 通过，0–2 秒，YAML 与监听端口一致 |
| 更新成功（v1.0.0） | `progress=100`，二进制替换、服务重启、DNS 正常 |
| 更新失败（v9.9.9） | `progress=-1`，日志显示 curl/wget 均失败，前端显示失败 |
| 校验和 | 真实更新日志出现 `Checksum OK`；伪造 checksum 时中止（rc=1） |
| 备份清理 | 连续更新后 `/usr/lib/AdGuardHome` 只有 1 个 `.bak-*` |
| 鉴权 | 无/伪造会话 → 403；有效会话 → 200；未登录触发更新 → 403 |
| 翻译 | zh-cn 包命中 `系统日志` / `运行中`；en 回退英文；90 条 msgid 全覆盖 |
| 版本参数 | 缺参数 → `version_required`；非法值 → `invalid_version`，不再误触发下载 |
| `get_log` JSON（含 tab/引号） | `json.load` 解析通过 |
| LuCI 页面 | HTTP 200，`main.js` 31 KB 正常返回、语法检查通过 |
| 架构映射 | 见 3.1 的表 |
| 前端筛选 | err 7 / warn 1 / 关键字 2，与样本一致 |

---

### 7.1 DNS 模式实测（OpenWrt 25.12.5，客户端从 LAN 发起）

| 模式/场景 | 结果 |
|---|---|
| `none` | AGH 5353、dnsmasq 53、无 nft；客户端查询由 dnsmasq 处理，AGH 日志无记录 |
| `exchange` | AGH 53、dnsmasq 5353、yaml 53；客户端查询命中 AGH，客户端 IP 保留 |
| `exchange` + `adh_port=5354` | dnsmasq 5354，切换与解析正常 |
| `redirect` | AGH 5353、dnsmasq 53、nft 规则 2 个；客户端查询命中 AGH（客户端 IP 保留）；`fw4 reload` 后规则仍在 |
| `redirect` + 停止服务 | nft 规则撤回、dnsmasq 回到 53，客户端仍可解析；启动后规则恢复 |
| `dnsmasq-upstream` | `server=127.0.0.1#5353`、`noresolv=1`；客户端经 dnsmasq 命中 AGH（源 127.0.0.1）；切回 none 后 server/noresolv 清空、resolvfile 恢复 |
| `replace`（废弃） | 全接口重定向，客户端命中 AGH |
| 互切矩阵 | exchange→redirect→upstream→none→exchange，无残留 |
| 重启 | exchange 模式重启后 AGH 53 / dnsmasq 5353，客户端解析正常 |
| 开机初期 | 模式与端口保持；WAN 未就绪时 AGH 上游短暂报 `network is unreachable`，网络起来后自动恢复 |

## 8. UI 预览（离线渲染，非路由器截图）

用与页面相同的 CSS / 标记 + 样本数据渲染，仅用于查看布局：

- `docs/ui-preview/status.png` — 运行状态
- `docs/ui-preview/config.png` — 参数配置
- `docs/ui-preview/logs.png` — 系统日志
- `docs/ui-preview/dns-modes.png` — DNS 模式卡片（修复后的单选框）

---

## 9. 本地打包 .apk（签名版）

apk-tools v3 的包是 ADB 容器（`ADBd`），只能由 `apk mkpkg` 生成。本次在
`192.168.44.137`（Ubuntu 26.04，OpenWrt 25.12.6 已编译树）上用树里的
`staging_dir/host/bin/apk mkpkg` 打包，并用 `private-key.pem` 签名：

- 树里的 `public-key.pem` 与路由器 `/etc/apk/keys/public-key.pem` **完全相同**
  （sha256 `bbd6fe58…`），所以签出的包可以直接安装，无需 `--allow-untrusted`；
- 产物 21.6 KB，`apk verify` 通过；`apk add --force-reinstall` 覆盖旧包时服务不中断，
  post-install 只清理失效 pidfile（本次修复），页面和 DNS 正常；
- 直接 `make package/.../compile` 会因树内 kernel/依赖状态不完整而拉起整条依赖链
  （openssl 等），改用 `mkpkg` 单独打包，快且可控。

无 OpenWrt 树时的备选：Alpine minirootfs chroot + 其 `apk mkpkg`（未签名，
需 `--allow-untrusted`）。完整步骤见 `docs/build-apk.md`，产物在 `dist/`
（被 `.gitignore` 忽略）。

## 10. 尚未完成 / 已知问题

1. `log_file` 选项仍未传给进程（日志走 syslog，日志页读取 logread）。
2. 前端登录态过期后只提示一次，不自动跳转登录页。
3. 更新脚本没有回滚命令（备份保留一份，可手动 `cp` 回去）。
4. AGH 向导默认上游是 Cloudflare DoH，在部分网络不可达（本次测试网络 DoH 超时）；
   安装后需要在 AGH 界面改成可用上游（测试环境改为 223.5.5.5 / 119.29.29.29）。
5. `redirect` 规则中的 LAN 接口写死 `br-lan`，接口命名不同的固件需要手动调整。

已处理（本轮）：
- ~~CGI 无鉴权~~ → 见 4.3
- ~~备份每次 32 MB 不清理~~ → 见 3.3
- ~~未校验 checksums.txt~~ → 见 3.4
- ~~`AdGuardHome_linux_amd64/` 未跟踪~~ → 已删除
- ~~README 描述过时~~ → 已同步
- ~~redirect 模式不生效~~ → 见 2.6
