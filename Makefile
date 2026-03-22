include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-b4
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI interface for Bye Bye Big Bro (B4)
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

$(eval $(call BuildPackage,luci-app-b4))
