#!/bin/sh
# install.sh - установка LuCI интерфейса B4 на OpenWrt
# Запускать на роутере (предварительно скопировав папку root/* на роутер)

set -e

echo "========================================="
echo "  Установка LuCI интерфейса B4"
echo "========================================="

# Проверяем, что скрипт выполняется на роутере
if [ ! -f /etc/openwrt_release ] && [ ! -f /etc/board.json ]; then
    echo "Ошибка: этот скрипт должен запускаться на роутере OpenWrt."
    echo "Сначала скопируйте папку root/ на роутер: scp -r root/* root@192.168.1.1:/"
    exit 1
fi

# Копируем файлы из папки root/ (если скрипт запущен из корня репозитория)
if [ -d "./root" ]; then
    cp -f root/usr/share/rpcd/acl.d/luci-app-b4.json /usr/share/rpcd/acl.d/
    cp -f root/usr/share/luci/menu.d/luci-app-b4.json /usr/share/luci/menu.d/
    mkdir -p /www/luci-static/resources/view/b4
    cp -f root/www/luci-static/resources/view/b4/overview.js /www/luci-static/resources/view/b4/
    echo "Файлы скопированы."
else
    echo "Ошибка: папка ./root не найдена. Запустите скрипт из корня репозитория."
    exit 1
fi

# Перезапускаем службы
/etc/init.d/rpcd restart
rm -rf /tmp/luci-*
/etc/init.d/uhttpd restart

echo ""
echo "========================================="
echo "  Установка завершена!"
echo "========================================="
echo "Обновите страницу в браузере (Ctrl+F5)"
echo "Перейдите в Services → b4"
