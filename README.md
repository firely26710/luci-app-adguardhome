# luci-app-adguardhome

OpenWrt 25.12 AdGuardHome LuCI 插件。纯 JavaScript + Shell CGI，零 Lua。

## 新手必读

这个插件是**用 Claude Code（AI 编程助手）[开源](https://github.com/anthropics/claude-code) 参考官方安装脚本写出来的**，不是官方项目，也不是从旧版 OpenWrt 的 Lua 插件迁移的。

整个过程是一个人 + AI 配合完成的：说需求 → AI 写代码 → 测试验证 → 迭代修复，不懂 Lua、不懂 OpenWrt 插件开发，但靠着 AI 一步一步把功能堆出来了。每行代码都是需求驱动的，没有历史包袱，所以能做到零 Lua、纯 JS + Shell，结构比传统 LuCI 插件简单很多。

> **如果你是新手**：不用担心，按钮点错了不会坏。最差的情况就是在 LuCI 里重启一下服务。碰到问题可以从"系统日志"Tab 看原因。
>
> **如果你想自己改**：代码量很小，init 脚本 ~310 行，JS 前端 ~300 行，Shell CGI ~250 行。看懂一个文件就能改一个功能，不需要学 Lua。

插件的下载更新部分参考了 AdGuard Home 官方安装方式（GitHub Releases 直链、CLI 参数、YAML 配置），但进程管理（procd）、DNS 劫持（nftables）、配置存储（UCI）、Web 界面（LuCI JS）这些 OpenWrt 层的集成完全是自定义的。

---

## 功能概览

在 LuCI 的 `服务 → AdGuardHome` 下提供三个 Tab 页：

| Tab | 能做什么 |
|-----|---------|
| **运行状态** | 查看服务是否在跑、进程 PID、核心版本；启动/停止/重启；一键打开 AdGuardHome 自带的 Web 管理界面（:3000）；在线检测并下载最新版本 |
| **参数配置** | 切换 DNS 工作模式、改端口、改文件路径、配置国内下载镜像 |
| **系统日志** | 实时查看 AdGuardHome 相关的系统日志，3 秒自动刷新 |

### 附带功能

- **在线更新**：在"运行状态"Tab 点击"检测并更新"，自动从 GitHub 下载最新二进制，支持通过镜像加速（国内用户必备）
- **开机自启**：安装后自动注册到 `rc.d`，重启路由器无需手动启动
- **防火墙集成**：redirect 模式下自动生成 fw4 nftables 规则，不干扰既有防火墙

---

## 安装

OpenWrt 25.12.x 默认限制安装非官方 APK 包，需要先解锁（只需执行一次）：

```bash
wget -O toggle.sh https://cafe.cpolar.cn/wkdaily/cool/raw/branch/master/apk-untrusted-toggle.sh && sh toggle.sh
```

解锁后，通过 LuCI 界面安装：**系统 → 软件包 → 上传软件包**，选择 `.apk` 文件上传安装。或使用命令行：

```bash
apk add --allow-untrusted ./luci-app-adguardhome-*.apk
```

> 参考视频：[OpenWrt 25.12.x APK 安装教程](https://www.bilibili.com/video/BV1aKJp6KEDG/)（作者：[悟空的日常](https://github.com/wukongdaily)，[luci-app-run](https://github.com/wukongdaily/luci-app-run)）

> APK 安装会自动处理权限和开机自启；手动安装需要自己执行上面两条命令。

装好插件后还需要下载 AdGuardHome 核心二进制才能运行——在 LuCI 的"运行状态"Tab 点击"检测并更新"即可。

---

## DNS 模式

安装后在 LuCI 的"参数配置"Tab 中选择。**不知道该选哪个就用默认的 `exchange`。**

| UCI 值 | LuCI 显示 | 做了什么 | 适合场景 |
|--------|----------|---------|---------|
| `exchange` | 使用53端口替换dnsmasq | dnsmasq 退到 5353，AdGuardHome 独占 53 | **默认/推荐**，简单直接 |
| `redirect` | 重定向53端口到AdGuardHome | nftables DNAT `br-lan` :53 → `127.0.0.1:5353` | 不想动 dnsmasq 端口时 |
| `dnsmasq-upstream` | 作为dnsmasq的上游服务器 | dnsmasq 保持 :53，设置 `server=127.0.0.1#5353` | 需要 dnsmasq 继续处理 DHCP DNS 时 |
| `none` | （仅在 UCI 中） | 不做任何劫持，AGH 只监听自身端口 | 调试用 |
| `replace` | （旧版，前端自动转为 exchange） | nftables DNAT 全接口 :53 → `127.0.0.1:5353` | 已废弃 |

> **默认值**：`exchange`。在 LuCI 下拉框中只显示前三种，`none` 和 `replace` 是内部值，不需要手动设置。

### 三种模式怎么选

```
exchange（推荐）         redirect                  dnsmasq-upstream
─────────────────      ─────────────────         ──────────────────
 AGH 直接占 :53         nftables 劫持到 :5353     dnsmasq 转发到 :5353
 dnsmasq 退到 :5353     dnsmasq 保持 :53          dnsmasq 保持 :53
 零额外开销              每包多一次 DNAT            每查询多一次转发
 兼容性最好              不改 dnsmasq              兼容性最好
```

---

## UCI 配置参考

文件位置：`/etc/config/adguardhome`

```ini
config adguardhome 'main'
    option enabled '1'              # 1=启用服务, 0=禁用
    option dns_mode 'exchange'      # DNS 模式（见上表）
    option web_port '3000'          # AGH 自带 Web 管理界面端口
    option adh_port '5353'          # AGH DNS 监听端口（exchange/redirect 模式用）
    option dhcp_port '53'           # DHCP/DNS 标准端口（供参考，不直接使用）
    option binary_path '/usr/lib/AdGuardHome/AdGuardHome'   # 二进制路径
    option config_path '/etc/AdGuardHome/AdGuardHome.yaml'  # AGH YAML 配置
    option work_dir '/etc/AdGuardHome'                      # AGH 工作目录（数据存储）
    option log_file '/var/log/AdGuardHome.log'              # 运行日志
    option dl_mirror_prefix 'https://gh-proxy.com/https://github.com'  # 下载镜像前缀
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `1` | 设为 `0` 后即使 init 脚本被调用也不会启动进程 |
| `dns_mode` | `exchange` | 详见上方 DNS 模式章节 |
| `web_port` | `3000` | 访问 `http://路由器IP:3000` 进入 AGH 自带管理界面 |
| `adh_port` | `5353` | AdGuardHome DNS 监听端口，redirect 和 dnsmasq-upstream 模式下使用 |
| `binary_path` | `/usr/lib/AdGuardHome/AdGuardHome` | 下载更新也会安装到这个路径 |
| `dl_mirror_prefix` | 空 | 国内用户建议填 `https://gh-proxy.com/https://github.com`，加速下载 |

---

## 与 OpenClash 共存

AdGuardHome 和 OpenClash 都试图控制 DNS（端口 53 或 nftables 重定向），直接部署会互相抢流量。推荐 **AGH 在前、Clash 在后** 的方案：

```
┌─────────┐ :53 ┌──────────────┐ :7874 ┌──────────────────┐ ┌──────────┐
│ 客户端   │ ──→ │ AdGuardHome  │ ────→ │ OpenClash DNS    │ ──→ │ 上游 DNS │
│         │     │ 广告过滤/日志  │       │ GFW分流/代理      │   │          │
└─────────┘     └──────────────┘       └──────────────────┘   └──────────┘
                  :53 (exchange)          :7874 (Clash DNS)
```

### 操作步骤

**AdGuardHome 侧**（LuCI → 参数配置）：

| 设置项 | 值 |
|--------|-----|
| DNS 模式 | `使用53端口替换dnsmasq`（exchange） |
| 上游 DNS | `127.0.0.1:7874`（在 AdGuardHome Web 界面 `:3000` → 设置 → DNS 设置 中配置） |

**OpenClash 侧**（插件设置 → 全局设置 → DNS 设置）：

| 设置项 | 值 |
|--------|-----|
| 本地 DNS 劫持 | **关闭** |
| 禁止 Dnsmasq 缓存 | 关闭（由 AGH 缓存） |

> **关键**：关闭 OpenClash 的 DNS 劫持，让 AGH 独占 :53，AGH 再把查询转发给 OpenClash DNS（:7874）做 GFW 分流。

### 注意事项

- OpenClash 的 **Fake-IP 模式在此方案下不可用**
- 如需 Fake-IP，改用 Clash 在前（AGH 用 `dnsmasq-upstream` 模式），但会丢失真实客户端 IP
- OpenClash DNS 端口如果不是 7874，在 AGH 上游中填写实际端口

### 关于 redirect 模式与 OpenClash 的冲突

AGH 的 `redirect` 模式会在 `/usr/share/nftables.d/chain-post/dstnat/` 下生成 nftables 规则文件。如果 OpenClash 也开启 DNS 劫持，两条规则在同一个 `dstnat` 链中，**文件名数字小的先匹配**，结果不可预期。

> 共存场景优先用 `exchange` 模式，从根源上避免 nftables 规则冲突。

---

## 文件结构

```
luci-app-adguardhome/
├── Makefile                                      # APK 打包定义
├── README.md
├── etc/
│   ├── config/adguardhome                        # UCI 默认配置
│   └── init.d/AdGuardHome                        # procd 启动脚本（~310 行）
├── usr/
│   ├── bin/agh-update                            # 在线更新脚本
│   └── share/
│       ├── luci/menu.d/luci-app-adguardhome.json # LuCI 菜单注册
│       └── rpcd/acl.d/luci-app-adguardhome.json  # 权限声明
└── www/
    ├── cgi-bin/agh-api                           # CGI 后端 API（~250 行）
    └── luci-static/resources/view/adguardhome/
        └── main.js                               # LuCI 前端 JS（~300 行）
```

### 各文件职责

| 文件 | 语言 | 干什么 |
|------|------|--------|
| `Makefile` | Make | 定义包名、依赖、安装路径、安装后脚本 |
| `etc/init.d/AdGuardHome` | Shell | procd 进程管理、三种 DNS 模式实现、nftables 规则生成 |
| `etc/config/adguardhome` | UCI | 默认配置值 |
| `usr/bin/agh-update` | Shell | 下载 + 解压 + 替换二进制，支持国内镜像 |
| `www/cgi-bin/agh-api` | Shell | LuCI 后端，启停/日志/配置读写/更新进度 |
| `www/.../main.js` | JavaScript | LuCI 前端 UI，三个 Tab 页 |
| `menu.d/*.json` | JSON | 在 LuCI 菜单中注册入口 |
| `acl.d/*.json` | JSON | 声明 CGI 需要的文件/ubus/uci 权限 |

### 数据流

```
浏览器 LuCI 页面
  │ main.js 调用 /cgi-bin/agh-api?action=xxx
  ▼
uhttpd 执行 agh-api (Shell CGI)
  │ 读写 UCI、操作 init.d、调用 agh-update
  ▼
/etc/init.d/AdGuardHome (procd)
  │ 启动/停止 AdGuardHome 进程
  │ 生成 nftables 规则、修改 dnsmasq 配置
  ▼
/usr/lib/AdGuardHome/AdGuardHome (官方二进制)
  │ 实际 DNS 过滤 + Web 管理界面
```

---

## CGI API 参考

用于调试或脚本调用。所有接口返回 JSON。

| `action=` | 方法 | 说明 | 示例 |
|-----------|------|------|------|
| `status` | GET | 服务状态 | `curl /cgi-bin/agh-api?action=status` |
| `start` | GET | 启动服务 | |
| `stop` | GET | 停止服务 | |
| `restart` | GET | 重启服务 | |
| `get_log&lines=N` | GET | 读取日志最后 N 行 | |
| `get_config` | GET | 读取 UCI 配置 | |
| `save_config` | GET | 保存 UCI 配置并重启 | `?action=save_config&enabled=1&dns_mode=exchange` |
| `check_update` | GET | 检查最新版本 | |
| `update&version=vX` | GET | 后台下载指定版本 | `?action=update&version=v0.107.62` |
| `update_progress` | GET | 查询下载进度(0-100) | |

---

## 常见问题

### Q: 安装后 LuCI 菜单没出现？

刷新浏览器缓存，或者在路由器上执行：

```sh
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/*
```

然后重新登录 LuCI。

### Q: 服务显示"已停止"？

先确认二进制文件是否存在且可执行：

```sh
ls -la /usr/lib/AdGuardHome/AdGuardHome
```

如果不存在，参考上方"首次使用"下载核心。

### Q: redirect 模式下 DNS 不生效？

检查 nftables 规则是否正确加载：

```sh
nft list chain inet fw4 dstnat | grep -A5 adguardhome
```

如果没有输出，尝试重启防火墙：`/etc/init.d/firewall reload`

### Q: exchange 模式下 dnsmasq 异常？

检查 dnsmasq 端口是否正确切换到 5353：

```sh
uci get dhcp.@dnsmasq[0].port
# 应该输出 5353
```

### Q: AGH Web 界面(:3000)打不开？

1. 确认服务在运行：`/etc/init.d/AdGuardHome status`
2. 确认端口：`netstat -tlnp | grep AdGuard`
3. 确认防火墙没有拦截 3000 端口

### Q: 国内下载太慢？

在"参数配置"中把下载镜像前缀换成其他 GitHub 加速服务。
