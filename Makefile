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
PKG_VERSION:=1.0.1
PKG_RELEASE:=20260629

PKG_MAINTAINER:=ADH Team
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-adguardhome
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=LuCI Support for AdGuardHome
	URL:=https://github.com/firely26710/luci-app-adguardhome.git
	DEPENDS:=+luci-base +nftables +curl +wget +rpcd
	PKGARCH:=all
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

	# Work directory for AdGuardHome configs
	$(INSTALL_DIR) $(1)/etc/AdGuardHome

	# Core binary directory
	$(INSTALL_DIR) $(1)/usr/lib/AdGuardHome
endef

define Package/luci-app-adguardhome/postinst
#!/bin/sh
set -e

mkdir -p /var/log
chmod 755 /etc/init.d/AdGuardHome 2>/dev/null || true
chmod 755 /usr/bin/agh-update 2>/dev/null || true
chmod 755 /www/cgi-bin/agh-api 2>/dev/null || true
rm -f /var/run/AdGuardHome.pid

if [ -f /etc/config/adguardhome ]; then
	echo "Existing config found, preserving..."
else
	uci -q set adguardhome.main.enabled=1 || true
	uci commit adguardhome || true
	echo "First install: service enabled by default"
fi

rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null || true

# Enable auto-start on boot (creates /etc/rc.d/S95AdGuardHome symlink)
/etc/init.d/AdGuardHome enable 2>/dev/null || true
echo "Auto-start on boot enabled"

echo ""
echo "AdGuardHome LuCI app installed!"
echo "================================="
echo "Download the binary:"
echo "  /usr/bin/agh-update <version>"
echo "Or copy manually to:"
echo "  /usr/lib/AdGuardHome/AdGuardHome"
echo "Configure via LuCI:"
echo "  Services -> AdGuardHome"
echo "================================="
echo ""

exit 0
endef

define Package/luci-app-adguardhome/prerm
#!/bin/sh
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
