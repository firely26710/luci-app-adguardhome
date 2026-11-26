# OpenWrt Makefile for luci-app-adguardhome
# APK packaging format (OpenWrt 25.12+)
#
# This package provides:
#   - AdGuardHome init script with procd support
#   - fw4/nftables DNS hijack (redirect mode)
#   - dnsmasq upstream / port exchange modes
#   - LuCI JS view (3 tabs: Status, Logs, Config)
#   - Shell CGI backend API
#   - Update script with China mirror acceleration
#   - ACL permissions for rpcd

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-adguardhome
PKG_VERSION:=2.0.0
PKG_RELEASE:=5

PKG_MAINTAINER:=ADH Team
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-adguardhome
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=LuCI Support for AdGuardHome
	URL:=https://github.com/firely26710/luci-app-adguardhome.git
	DEPENDS:=+luci-base +nftables +curl +wget +rpcd
endef

define Package/luci-app-adguardhome/description
	LuCI web interface for AdGuardHome DNS filter.

	Three DNS modes:
	 - dnsmasq-upstream: set AdGuardHome as dnsmasq upstream
	 - redirect: fw4 nftables DNS hijack (LAN only)
	 - exchange: AdGuardHome takes port 53, dnsmasq moves aside

	Features:
	 - Pure JavaScript frontend, Shell CGI backend (zero Lua)
	 - Procd process management with auto-respawn
	 - Online core update with China mirror support
	 - Real-time log viewer with auto-refresh
endef

define Package/luci-app-adguardhome/conffiles
/etc/config/adguardhome
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-adguardhome/install
	# Init script
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./etc/init.d/AdGuardHome $(1)/etc/init.d/AdGuardHome

	# UCI config
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./etc/config/adguardhome $(1)/etc/config/adguardhome

	# Update script
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./usr/bin/agh-update $(1)/usr/bin/agh-update

	# CGI backend API
	$(INSTALL_DIR) $(1)/www/cgi-bin
	$(INSTALL_BIN) ./www/cgi-bin/agh-api $(1)/www/cgi-bin/agh-api

	# LuCI JS view
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/adguardhome
	$(INSTALL_DATA) ./www/luci-static/resources/view/adguardhome/main.js \
		$(1)/www/luci-static/resources/view/adguardhome/main.js

	# LuCI menu entry (JSON-based, no Lua)
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./usr/share/luci/menu.d/luci-app-adguardhome.json \
		$(1)/usr/share/luci/menu.d/luci-app-adguardhome.json

	# ACL permissions
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./usr/share/rpcd/acl.d/luci-app-adguardhome.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-adguardhome.json

	# i18n catalog (zh-cn).  Regenerate with: python3 tools/mklmo.py
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) ./i18n/luci-app-adguardhome.zh-cn.lmo \
		$(1)/usr/lib/lua/luci/i18n/luci-app-adguardhome.zh-cn.lmo

	# Work directory for AdGuardHome configs.  AGH wants 0700 (permcheck).
	$(INSTALL_DIR) $(1)/etc/AdGuardHome
	chmod 0700 $(1)/etc/AdGuardHome

	# Core binary directory
	$(INSTALL_DIR) $(1)/usr/lib/AdGuardHome
endef

define Package/luci-app-adguardhome/postinst
#!/bin/sh
# Image builds run postinst/prerm with IPKG_INSTROOT set; those steps must not
# touch the build host (rootfs.mk enables services itself).  Keep the runtime
# package install path unchanged.
if [ -n "$IPKG_INSTROOT" ]; then
	exit 0
fi
set -e

mkdir -p /var/log
# AGH warns when its work dir is group/world accessible
chmod 700 /etc/AdGuardHome 2>/dev/null || true
chmod 755 /etc/init.d/AdGuardHome 2>/dev/null || true
chmod 755 /usr/bin/agh-update 2>/dev/null || true
chmod 755 /www/cgi-bin/agh-api 2>/dev/null || true
# Only drop a stale pidfile: deleting it while the service is running would
# make the plugin UI report "stopped" until the next restart.
if [ -f /var/run/AdGuardHome.pid ]; then
	pid="$(cat /var/run/AdGuardHome.pid 2>/dev/null)"
	[ -n "$pid" ] && [ -d "/proc/$pid" ] || rm -f /var/run/AdGuardHome.pid
fi

if [ -f /etc/config/adguardhome ]; then
	echo "Existing config found, preserving..."
fi

rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null || true

# The core binary and the service are deliberately not shipped/enabled by
# default: install the core first, then enable AdGuardHome in LuCI.
if [ "$(uci -q get adguardhome.main.enabled)" != "1" ]; then
	/etc/init.d/AdGuardHome disable 2>/dev/null || true
fi

echo ""
echo "AdGuardHome LuCI app installed (service disabled)."
echo "================================="
echo "1) Install the core binary:"
echo "   /usr/bin/agh-update <version>"
echo "2) Finish the first-run wizard on http://<router>:3000"
echo "3) Enable AdGuardHome in LuCI to keep it running:"
echo "   Services -> AdGuardHome"
echo "================================="
echo ""

exit 0
endef

define Package/luci-app-adguardhome/prerm
#!/bin/sh
# Image builds run postinst/prerm with IPKG_INSTROOT set; those steps must not
# touch the build host (rootfs.mk enables services itself).  Keep the runtime
# package install path unchanged.
if [ -n "$IPKG_INSTROOT" ]; then
	exit 0
fi
set -e

if [ -x /etc/init.d/AdGuardHome ]; then
	echo "Stopping AdGuardHome service..."
	/etc/init.d/AdGuardHome stop 2>/dev/null || true
	/etc/init.d/AdGuardHome disable 2>/dev/null || true
fi

# Clean up fw4 nftables include files
rm -f /usr/share/nftables.d/table-post/15-adguardhome.nft
rm -f /usr/share/nftables.d/chain-post/dstnat/15-adguardhome.nft
/etc/init.d/firewall reload 2>/dev/null || true

exit 0
endef

$(eval $(call BuildPackage,luci-app-adguardhome))
