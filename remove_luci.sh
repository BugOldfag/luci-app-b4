#!/bin/sh
# remove_luci.sh - удаление LuCI интерфейса B4
# Запускать на роутере

echo "========================================="
echo "  Удаление LuCI интерфейса B4"
echo "========================================="

# Удаляем файлы
rm -f /www/luci-static/resources/view/b4/overview.js
rmdir /www/luci-static/resources/view/b4 2>/dev/null || true
rm -f /usr/share/luci/menu.d/luci-app-b4.json
rm -f /usr/share/rpcd/acl.d/luci-app-b4.json

# Удаляем настройки из UCI (если есть)
uci delete b4.web_url 2>/dev/null || true
uci commit b4 2>/dev/null || true
rm -f /etc/config/b4 2>/dev/null || true

# Очищаем кэш и перезапускаем
rm -rf /tmp/luci-*
/etc/init.d/uhttpd restart

echo ""
echo "========================================="
echo "  Удаление завершено!"
echo "========================================="
echo "Обновите страницу в браузере (Ctrl+F5)"
