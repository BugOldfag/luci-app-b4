# 🚀 LuCI interface for Bye Bye Big Bro (B4) - Alpha

Управляйте службой **B4** прямо из веб‑интерфейса OpenWrt.  
Интерфейс полностью интегрирован в LuCI и предоставляет все необходимые функции для контроля и настройки B4.

---

## ✨ Возможности

-  Открытие Web интерфейса
-  Включение / выключение службы  
-  Перезапуск  
-  Управление автозагрузкой  
-  Отображение версии B4  
-  Настройка адреса веб‑конфигуратора (с сохранением в конфиг B4)  
-  Просмотр логов (Временно не работает)
-  Обновление до последней версии
-  Полное удаление B4 и Установка
-  Проверка совместимости (архитектура, Netfilter)

---

## 📦 Требования

- OpenWrt **21.02** или новее  
- Установленный **B4**
  
---

## 🛠️ Установка

### Способ 1 - через ПК (рекомендуется)

```bash
# Клонируем репозиторий на ПК (или скачиваем архив)
git clone https://github.com/BugOldfag/luci-app-b4.git
cd luci-app-b4

# Копируем файлы на роутер (замените IP при необходимости)
scp -O -r root/* root@192.168.1.1:/

# Перезапускаем службы
ssh root@192.168.1.1 "
    /etc/init.d/rpcd restart
    rm -rf /tmp/luci-*
    /etc/init.d/uhttpd restart
```

### Способ 2 - напрямую на роутере (без git)

Зайдите на роутер по SSH (замените IP при необходимости)
ssh root@192.168.1.1

```bash
wget -O /tmp/luci-b4.tar.gz https://github.com/BugOldfag/luci-app-b4/archive/refs/heads/main.tar.gz
cd /tmp && tar -xzf luci-b4.tar.gz
cp -r luci-app-b4-main/root/* /
rm -rf /tmp/luci-*
/etc/init.d/uhttpd restart
```

## 🗑️ Удаление
На роутере через SSH выполните одну команду:

```bash
luci-b4-remove
```
Если скрипт по какой‑то причине отсутствует, удалите вручную:

```bash
rm -f /www/luci-static/resources/view/b4/overview.js
rm -f /usr/share/luci/menu.d/luci-app-b4.json
rm -f /usr/share/rpcd/acl.d/luci-app-b4.json
rm -rf /tmp/luci-*
/etc/init.d/uhttpd restart
```

## 📄 Лицензия
MIT License
