# 本地打包 .apk

OpenWrt 25.12 的包是 apk-tools v3 的 ADB 容器（文件头 `ADBd`），**不能**用 tar/gzip
手工拼。OpenWrt 自己在 `include/package-pack.mk` 里调用 `apk mkpkg` 生成，所以有两条路：

- **A（推荐）**：借用一台已经编译过 OpenWrt 的机器，用它 `staging_dir/host/bin/apk`
  直接 `mkpkg`，并用树里的 `private-key.pem` 签名；
- **B（无 OpenWrt 树）**：Alpine minirootfs（musl x86_64）chroot 后用它的 `apk mkpkg`，
  只能出未签名包。

两条路都不需要 285 MB 的 OpenWrt SDK。

> 没有现成的签名密钥？先生成一对，并把公钥装进路由器，见
> [signing.md](signing.md)。私钥务必留在仓库之外。

---

## A. 用现成 OpenWrt 构建树（可签名）

前提：树里已经有 `staging_dir/host/bin/apk`（带 `mkpkg`）和 `private-key.pem`。
本次用的是 `192.168.44.137` 上的 `openwrt-25.12`（v25.12.6，已编译）。

```sh
T=/home/xjm/openwrt/openwrt-25.12
P=$T/package/luci-app-adguardhome          # 本仓库源码放这里

# 1. 搭 staging（内容与 Makefile 的 install 段一致）
W=/tmp/agh-apk; R=$W/root
rm -rf "$W"; mkdir -p "$R"/{etc/init.d,etc/config,usr/bin,usr/share/luci/menu.d}
mkdir -p "$R"/{usr/share/rpcd/acl.d,www/cgi-bin,www/luci-static/resources/view/adguardhome}
mkdir -p "$R"/{usr/lib/lua/luci/i18n,etc/AdGuardHome,usr/lib/AdGuardHome,lib/apk/packages}
cp -a "$P"/etc/init.d/AdGuardHome "$R/etc/init.d/"
cp -a "$P"/etc/config/adguardhome "$R/etc/config/"
cp -a "$P"/usr/bin/agh-update "$R/usr/bin/"
cp -a "$P"/usr/share/luci/menu.d/luci-app-adguardhome.json "$R/usr/share/luci/menu.d/"
cp -a "$P"/usr/share/rpcd/acl.d/luci-app-adguardhome.json "$R/usr/share/rpcd/acl.d/"
cp -a "$P"/www/cgi-bin/agh-api "$R/www/cgi-bin/"
cp -a "$P"/www/luci-static/resources/view/adguardhome/main.js "$R/www/luci-static/resources/view/adguardhome/"
cp -a "$P"/i18n/luci-app-adguardhome.zh-cn.lmo "$R/usr/lib/lua/luci/i18n/"
chmod 755 "$R/etc/init.d/AdGuardHome" "$R/usr/bin/agh-update" "$R/www/cgi-bin/agh-api"

# 2. conffiles 元数据（mkpkg 不接受 conffiles 参数）
echo "/etc/config/adguardhome" > "$R/lib/apk/packages/luci-app-adguardhome.conffiles"
sha=$(sha256sum "$R/etc/config/adguardhome" | cut -d' ' -f1)
echo "/etc/config/adguardhome $sha" > "$R/lib/apk/packages/luci-app-adguardhome.conffiles_static"

# 3. 安装脚本（Makefile 的 postinst / prerm）
mkdir -p "$W/scripts"   # post-install / pre-deinstall

# 4. 打包 + 签名
"$T/staging_dir/host/bin/apk" mkpkg \
  --info "name:luci-app-adguardhome" \
  --info "version:2.0.0-r2" \
  --info "arch:noarch" \
  --info "description:LuCI web interface for AdGuardHome DNS filter" \
  --info "license:Apache-2.0" \
  --info "origin:luci-app-adguardhome" \
  --info "url:https://github.com/firely26710/luci-app-adguardhome" \
  --info "maintainer:ADH Team" \
  --info "depends:luci-base nftables curl wget rpcd" \
  --script "post-install:$W/scripts/post-install" \
  --script "pre-deinstall:$W/scripts/pre-deinstall" \
  --files "$R" \
  --sign "$T/private-key.pem" \
  --output "$W/luci-app-adguardhome-2.0.0-r2.apk"
```

验证签名：

```sh
mkdir -p /tmp/keys && cp "$T/public-key.pem" /tmp/keys/
"$T/staging_dir/host/bin/apk" verify --keys-dir /tmp/keys "$W"/*.apk
# 输出：...: OK
```

关键点：**构建树的 `public-key.pem` 与目标路由器 `/etc/apk/keys/public-key.pem`
相同**（本次 sha256 都是 `bbd6fe58…`），所以签出来的包可以直接 `apk add`，
不需要 `--allow-untrusted`。换树时先比对这两个文件。

安装：

```sh
apk add --force-reinstall /tmp/luci-app-adguardhome-2.0.0-r2.apk
apk list --installed | grep adguardhome
```

实测：`Replacing luci-app-adguardhome (2.0.0-r2 -> 2.0.0-r2)`，
服务不中断（post-install 只清理失效 pidfile），页面和 DNS 正常。

> 不建议直接 `make package/luci-app-adguardhome/compile`：树里 kernel/依赖的构建状态
> 不完整时，它会把整条依赖链（openssl 等）拉起来重编，耗时且容易失败；打包这一步本质
> 就是 `apk mkpkg`，单独调用更快也更可控。

---

## B. 没有 OpenWrt 树：Alpine chroot（未签名）

路由器自带的 apk 没有 `mkpkg`，但 Alpine 3.23 的 minirootfs 里有：

```sh
cd /tmp
curl -fL -o alpine.tar.gz \
  https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.23/releases/x86_64/alpine-minirootfs-3.23.8-x86_64.tar.gz
sha256sum alpine.tar.gz   # 56e2810205c17a5dff78cdd7b2c2af4ccdef16f18d765d5bb0f527438b136676
mkdir -p /tmp/alpine && tar xzf alpine.tar.gz -C /tmp/alpine
chroot /tmp/alpine /sbin/apk --version   # apk-tools 3.0.9
```

把 staging 和脚本放到 `chroot` 可见的路径（例如 `/tmp/alpine/work/root`），然后：

```sh
chroot /tmp/alpine /sbin/apk mkpkg \
  --info "name:luci-app-adguardhome" --info "version:2.0.0-r2" \
  --info "arch:noarch" --info "description:..." --info "license:Apache-2.0" \
  --info "depends:luci-base nftables curl wget rpcd" \
  --script "post-install:/work/scripts/post-install" \
  --script "pre-deinstall:/work/scripts/pre-deinstall" \
  --files /work/root --output /work/agh.apk
```

产物未签名，目标机安装要 `--allow-untrusted`。适合没有构建树的临时验证。

---

## 已知限制

- 未签名包必须 `apk add --allow-untrusted`（README 里的 APK 解锁步骤）。
- `apk del` 会连同 `/etc/config/adguardhome` 一起删除，重装恢复默认配置；
  升级场景下的 conffiles 合并尚未实测。
- postinst 已改为只清理**失效** pidfile：原来无条件 `rm`，升级时服务还在跑会让
  UI 误报“已停止”。
- 需要 root（chroot 路线）或可用的已编译 OpenWrt 树（签名路线）。

## 附：官方 SDK

需要完整构建/签名流程时：

```sh
wget https://downloads.openwrt.org/releases/25.12.5/targets/x86/64/openwrt-sdk-25.12.5-x86-64_gcc-14.3.0_musl.Linux-x86_64.tar.zst
tar --zstd -xf openwrt-sdk-*.tar.zst
cd openwrt-sdk-*
make defconfig
make package/luci-app-adguardhome/compile V=s
```

SDK 解压约 1 GB，且需要 glibc 的 x86_64 Linux（路由器是 musl，跑不了）。