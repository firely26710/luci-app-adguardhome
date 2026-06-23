# luci-app-adguardhome

OpenWrt 25.12 AdGuardHome LuCI 插件。纯 JavaScript + Shell CGI，零 Lua。

## 编译

```sh
cp -r luci-app-adguardhome $OPENWRT_DIR/package/
cd $OPENWRT_DIR
make menuconfig   # LuCI → Applications → luci-app-adguardhome
make package/luci-app-adguardhome/compile
```

## 依赖

`luci-base` `nftables` `curl` `wget` `rpcd`

## 功能

| Tab | 说明 |
|-----|------|
| **运行状态** | 启停控制、版本/PID、Web UI 跳转、在线更新（检测+下载+实时日志） |
| **系统日志** | 500 行实时日志、自动刷新 3s、滚动条 |
| **参数配置** | 启用/禁用、DNS 模式、端口、路径、镜像，保存自动重启 |

## DNS 模式

| UCI 值 | 说明 | 系统行为 |
|--------|------|----------|
| `dnsmasq-upstream` | 作为 dnsmasq 上游 | dnsmasq `server=127.0.0.1#5353` `noresolv=1` |
| `redirect` | 重定向 53 端口 | fw4 nftables `br-lan` :53→:5353 |
| `exchange` | 替换 dnsmasq | dnsmasq→5353, AdGuardHome 接管 :53 |

## 架构

```
main.js (LuCI JS View) → agh-api (Shell CGI) → AdGuardHome init (procd)
```

## 文件

```
luci-app-adguardhome/
├── Makefile
├── etc/
│   ├── config/adguardhome                  # UCI 默认配置
│   └── init.d/AdGuardHome                  # procd 启动脚本
├── usr/
│   ├── bin/agh-update                      # 核心更新
│   └── share/
│       ├── luci/menu.d/luci-app-adguardhome.json
│       └── rpcd/acl.d/luci-app-adguardhome.json
└── www/
    ├── cgi-bin/agh-api                     # CGI 后端
    └── luci-static/resources/view/adguardhome/main.js
```

## UCI 配置

```ini
config adguardhome 'main'
    option enabled '1'
    option dns_mode 'dnsmasq-upstream'
    option web_port '3000'
    option adh_port '5353'
    option binary_path '/usr/lib/AdGuardHome/AdGuardHome'
    option config_path '/etc/AdGuardHome/AdGuardHome.yaml'
    option work_dir '/etc/AdGuardHome'
    option log_file '/var/log/AdGuardHome.log'
    option dl_mirror_prefix 'https://gh-proxy.com/https://github.com'
```

## API

| `action=` | 说明 |
|-----------|------|
| `status` | 服务状态 (JSON) |
| `start` / `stop` / `restart` | 启停控制 |
| `get_log&lines=N` | 获取日志 |
| `get_config` / `save_config` | 读写 UCI |
| `check_update` | 检查最新版本 |
| `update&version=vX` | 后台下载 |
| `update_progress` | 下载进度 |
