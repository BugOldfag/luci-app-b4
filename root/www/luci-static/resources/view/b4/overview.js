'use strict';
'require view';
'require fs';
'require ui';
'require rpc';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

var callSystemBoard = rpc.declare({
    object: 'system',
    method: 'board'
});

function getB4Version() {
    return fs.read('/tmp/b4.ver').then(function(res) {
        var ver = (res || '').trim();
        return ver || '?';
    }).catch(function() {
        return '?';
    });
}

function getAutostartStatus() {
    return fs.stat('/etc/rc.d/S99b4').then(function(stat) {
        return stat !== null;
    }).catch(function() {
        return false;
    });
}

function setAutostart(enable) {
    var cmd = enable ? 'enable' : 'disable';
    return fs.exec_direct('/etc/init.d/b4', [cmd]);
}

function setServiceState(action) {
    return fs.exec_direct('/etc/init.d/b4', [action]);
}

function removeService() {
    return setServiceState('stop')
        .then(function() { return setAutostart(false); })
        .then(function() {
            return fs.exec_direct('/bin/rm', ['-rf', '/opt/bin/b4', '/opt/etc/b4']);
        })
        .then(function() {
            return fs.exec_direct('/bin/rm', ['-f', '/etc/init.d/b4', '/etc/rc.d/K??b4', '/etc/rc.d/S??b4']);
        });
}

function getSyslogState() {
    return fs.read('/opt/etc/b4/b4.json').then(function(data) {
        try {
            var cfg = JSON.parse(data);
            return cfg.system?.logging?.syslog === true;
        } catch (e) {
            return false;
        }
    }).catch(function() {
        return false;
    });
}

function setSyslogState(enable) {
    return fs.read('/opt/etc/b4/b4.json').then(function(data) {
        var cfg = JSON.parse(data);
        if (!cfg.system) cfg.system = {};
        if (!cfg.system.logging) cfg.system.logging = {};
        cfg.system.logging.syslog = enable === true;
        return fs.write('/opt/etc/b4/b4.json', JSON.stringify(cfg, null, 2));
    }).then(function() {
        return setServiceState('restart');
    });
}

function getLog() {
    return getSyslogState().then(function(syslogEnabled) {
        if (!syslogEnabled) return 'Логирование отключено. Включите его, чтобы видеть записи.';
        return fs.exec_direct('/sbin/logread', []).then(function(res) {
            if (!res || typeof res.stdout !== 'string') return 'Лог временно недоступен, автор в курсе, потом будет работать, это Альфа версия приложения.';
            var lines = res.stdout.split('\n').filter(function(l) {
                return l.toLowerCase().indexOf('b4') > -1;
            });
            return lines.slice(-50).join('\n') || 'Нет записей в логе';
        }).catch(function() {
            return 'Лог временно недоступен, автор в курсе, потом будет работать, это Альфа версия приложения.';
        });
    });
}

function findB4Binary() {
    return fs.stat('/opt/bin/b4').then(function(stat) {
        return stat !== null ? '/opt/bin/b4' : null;
    }).catch(function() {
        return null;
    });
}

function runInstallation(updateLog) {
    var steps = [
        { cmd: '/bin/sh', args: ['-c', 'opkg update'], msg: 'Обновление списка пакетов...' },
        { cmd: '/bin/sh', args: ['-c', 'opkg install kmod-nft-queue kmod-nf-conntrack-netlink iptables-mod-nfqueue jq wget-ssl coreutils-nohup'], msg: 'Установка зависимостей...' },
        { cmd: '/bin/sh', args: ['-c', 'wget -O /tmp/b4install.sh https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh'], msg: 'Скачивание установщика...' },
        { cmd: '/bin/chmod', args: ['+x', '/tmp/b4install.sh'], msg: 'Настройка прав...' },
        { cmd: '/bin/sh', args: ['-c', '/tmp/b4install.sh --quiet 2>&1'], msg: 'Запуск установщика B4 (тихий режим)...' }
    ];

    var idx = 0;
    function runNext() {
        if (idx >= steps.length) {
            updateLog('Все шаги выполнены.');
            return findB4Binary().then(function(binPath) {
                if (binPath) updateLog('✅ B4 найден: ' + binPath);
                else updateLog('❌ B4 не найден');
                return Promise.resolve();
            });
        }
        var step = steps[idx];
        updateLog(step.msg);
        idx++;
        return fs.exec_direct(step.cmd, step.args).then(function(res) {
            if (res.stdout) updateLog(res.stdout);
            if (res.stderr) updateLog('STDERR: ' + res.stderr);
            return runNext();
        }).catch(function(err) {
            if (err.message && err.message.indexOf('aborted') === -1) {
                updateLog('Ошибка: ' + err.message);
                return Promise.reject(err);
            }
            updateLog('⚠️ Запрос прерван, проверяем...');
            return findB4Binary().then(function(binPath) {
                if (binPath) {
                    updateLog('✅ B4 успешно установлен.');
                    return Promise.resolve();
                } else {
                    updateLog('❌ B4 не найден');
                    return Promise.reject(new Error('B4 not found'));
                }
            });
        });
    }
    return runNext();
}

function getSavedWebUrl() {
    return fs.read('/opt/etc/b4/b4.json').then(function(data) {
        try {
            var cfg = JSON.parse(data);
            var bind = cfg.system?.web_server?.bind_address || '192.168.1.1';
            var port = cfg.system?.web_server?.port || 7000;
            return bind + ':' + port;
        } catch (e) {
            return window.location.hostname + ':7000';
        }
    }).catch(function() {
        return window.location.hostname + ':7000';
    });
}

function saveWebUrl(url) {
    var parts = url.split(':');
    var ip = parts[0] || '192.168.1.1';
    var port = parseInt(parts[1]) || 7000;

    return fs.read('/opt/etc/b4/b4.json').then(function(data) {
        var cfg = JSON.parse(data);
        if (!cfg.system) cfg.system = {};
        if (!cfg.system.web_server) cfg.system.web_server = {};
        cfg.system.web_server.bind_address = ip;
        cfg.system.web_server.port = port;
        return fs.write('/opt/etc/b4/b4.json', JSON.stringify(cfg, null, 2));
    }).then(function() {
        return setServiceState('restart');
    });
}

function normalizeArch(raw) {
    var lower = (raw || '').toLowerCase();
    if (lower.indexOf('armv8') >= 0 || lower.indexOf('aarch64') >= 0) return 'arm64';
    if (lower.indexOf('armv7') >= 0) return 'armv7';
    if (lower.indexOf('armv6') >= 0) return 'armv6';
    if (lower.indexOf('armv5') >= 0) return 'armv5';
    if (lower.indexOf('x86_64') >= 0 || lower.indexOf('amd64') >= 0) return 'amd64';
    if (lower.indexOf('i386') >= 0 || lower.indexOf('i686') >= 0) return '386';
    if (lower.indexOf('mips64el') >= 0) return 'mips64le';
    if (lower.indexOf('mips64') >= 0) return 'mips64';
    if (lower.indexOf('mipsel') >= 0) return 'mipsle';
    if (lower.indexOf('mips') >= 0) return 'mips';
    if (lower.indexOf('ppc64le') >= 0) return 'ppc64le';
    if (lower.indexOf('ppc64') >= 0) return 'ppc64';
    if (lower.indexOf('riscv64') >= 0) return 'riscv64';
    if (lower.indexOf('s390x') >= 0) return 's390x';
    return raw;
}

function getSystemArch() {
    return callSystemBoard().then(function(boardData) {
        var raw = boardData.system || boardData.arch || 'unknown';
        var normalized = normalizeArch(raw);
        return { normalized: normalized, raw: raw };
    }).catch(function() {
        return { normalized: 'unknown', raw: 'unknown' };
    });
}

function getKernelVersion() {
    return fs.read('/proc/version').then(function(content) {
        var match = content.match(/Linux version (\S+)/);
        return match && match[1] ? match[1] : 'unknown';
    }).catch(function() { return 'unknown'; });
}

function checkNetfilter() {
    return fs.read('/proc/modules').then(function(content) {
        if (content && (content.indexOf('xt_NFQUEUE') >= 0 || content.indexOf('nft_queue') >= 0)) {
            return getKernelVersion().then(function(kernel) {
                return { compatible: true, detail: 'Ready (Kernel ' + kernel + ')' };
            });
        }
        return { compatible: false, detail: 'Not supported' };
    }).catch(function() {
        return { compatible: false, detail: 'Not supported (cannot read /proc/modules)' };
    });
}

var SUPPORTED_ARCHS = [
    'amd64', '386', 'arm64', 'armv7', 'armv6', 'armv5',
    'mips', 'mipsle', 'mips64', 'mips64le',
    'ppc64', 'ppc64le', 'riscv64', 's390x'
];

var sectionTitleStyle = 'background: #f5ad18; color: #000; padding: 8px 12px; border-radius: 30px; font-weight: bold; font-size: 1.2em; margin: 0 0 10px 0; width: 100%; box-sizing: border-box;';
var darkPanelStyle = 'background: #1f1218; color: #fff; border-radius: 12px; padding: 12px; margin-bottom: 15px;';
var darkPanelLabelStyle = 'color: #fff; font-weight: bold; width: 30%; font-size: 1em;';
var darkPanelFieldStyle = 'color: #fff; font-size: 1em;';
var disabledButtonStyle = 'background: #6c757d; border-color: #6c757d; color: white; cursor: not-allowed;';
var inputStyle = 'background: #381426; color: #df9d18; border: 1px solid #df9d18; padding: 6px 10px; border-radius: 4px; font-family: monospace;';

return view.extend({
    title: 'Bye Bye Big Bro (B4)',

    load: function() {
        console.log('B4: загрузка данных');
        return Promise.all([
            callServiceList({ name: 'b4' }).catch(function() { return null; }),
            getAutostartStatus(),
            getSyslogState(),
            findB4Binary().then(function(p) { return p !== null; }).catch(function() { return false; }),
            getB4Version(),
            getSavedWebUrl(),
            getSystemArch(),
            checkNetfilter()
        ]).then(function(results) {
            var serviceInfo = results[0] ? results[0].b4 : null;
            var running = !!(serviceInfo && serviceInfo.instances && Object.keys(serviceInfo.instances).length > 0);
            var arch = results[6];
            var archCompatible = SUPPORTED_ARCHS.indexOf(arch.normalized) !== -1;
            var netfilter = results[7];
            return {
                running: running,
                autostart: results[1],
                syslogEnabled: results[2],
                installed: results[3],
                version: results[4],
                webUrl: results[5],
                arch: arch,
                archCompatible: archCompatible,
                netfilter: netfilter
            };
        });
    },

    render: function(data) {
        var running = data.running;
        var autostart = data.autostart;
        var syslogEnabled = data.syslogEnabled;
        var installed = data.installed;
        var version = data.version;
        var initialWebUrl = data.webUrl;
        var arch = data.arch;
        var archCompatible = data.archCompatible;
        var netfilter = data.netfilter;

        var urlInput = E('input', {
            type: 'text',
            id: 'b4_web_url_input',
            style: inputStyle + ' flex: 1; min-width: 200px;',
            value: initialWebUrl
        });

        var saveButton = E('button', {
            class: 'cbi-button cbi-button-apply',
            style: 'background: #007bff; border-color: #0069d9; color: white;',
            click: function(ev) {
                ev.preventDefault();
                var newUrl = document.getElementById('b4_web_url_input').value;
                saveWebUrl(newUrl).then(function() {
                    ui.addNotification(null, E('p', 'Новые параметры сохранены: ' + newUrl));
                }).catch(function(err) {
                    ui.addNotification(null, E('p', { class: 'error' }, 'Ошибка сохранения: ' + err.message));
                });
            }
        }, 'Сохранить');

        var resetButton = E('button', {
            class: 'cbi-button',
            style: 'background: #6c757d; border-color: #6c757d; color: white;',
            click: function(ev) {
                ev.preventDefault();
                var defaultUrl = window.location.hostname + ':7000';
                document.getElementById('b4_web_url_input').value = defaultUrl;
                saveWebUrl(defaultUrl).then(function() {
                    ui.addNotification(null, E('p', 'Адрес сброшен к значению по умолчанию: ' + defaultUrl));
                }).catch(function(err) {
                    ui.addNotification(null, E('p', { class: 'error' }, 'Ошибка сброса: ' + err.message));
                });
            }
        }, 'Сброс по умолчанию');

        var openButton = E('button', {
            class: 'cbi-button cbi-button-apply',
            style: 'background: #007bff; border-color: #0069d9; color: white;',
            click: function(ev) {
                ev.preventDefault();
                var url = document.getElementById('b4_web_url_input').value;
                if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
                window.open(url, '_blank');
            }
        }, 'Веб Конфигуратор');

        var configuratorSection = E('div', { class: 'cbi-section' }, [
            E('div', { style: sectionTitleStyle }, 'Веб-конфигуратор'),
            E('div', { style: darkPanelStyle }, [
                E('div', { style: 'display: flex; align-items: center; gap: 10px; flex-wrap: wrap;' }, [
                    openButton, urlInput, saveButton, resetButton
                ])
            ])
        ]);

        var archDisplayText = archCompatible ? 'Совместима' : 'Не совместима';
        var archDisplayColor = archCompatible ? '#28a745' : '#dc3545';
        var archDetail = arch.raw !== 'unknown' ? ' - ' + arch.raw : '';

        var netfilterText = netfilter.compatible ? 'Совместим' : 'Не совместим';
        var netfilterColor = netfilter.compatible ? '#28a745' : '#dc3545';
        var netfilterDetail = netfilter.detail ? ' - ' + netfilter.detail : '';
        var netfilterHint = 'Требуется NFQUEUE. Если вы установили чистую сборку с openwrt.org, то нужно до установить NFQUEUE.\n\nКоманда для SSH:\nopkg update\nopkg install kmod-nft-queue kmod-nf-conntrack-netlink iptables-mod-nfqueue jq wget-ssl coreutils-nohup';

        var compatibilitySection = E('div', { class: 'cbi-section' }, [
            E('div', { style: sectionTitleStyle }, 'Совместимость системы'),
            E('div', { style: darkPanelStyle + ' padding: 15px;' }, [
                E('div', { style: 'margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;' }, [
                    E('div', { style: 'font-weight: bold; font-size: 1.1em; margin-bottom: 8px; color: #fff;' }, 'Архитектура'),
                    E('div', { style: 'font-size: 1em; margin-bottom: 8px;' }, [
                        E('span', { style: 'color: ' + archDisplayColor + '; font-weight: bold;' }, archDisplayText),
                        E('span', { style: 'margin-left: 10px; color: #aaa;' }, '(' + arch.normalized + ')' + archDetail)
                    ]),
                    E('div', { style: 'color: #888; font-size: 0.85em; margin-top: 5px;' }, 'Поддерживаемые: amd64, arm64, armv7, armv6, armv5, mips, mipsle, mips64, mips64le, ppc64, ppc64le, riscv64, s390x')
                ]),
                E('div', { style: 'margin-bottom: 10px;' }, [
                    E('div', { style: 'font-weight: bold; font-size: 1.1em; margin-bottom: 8px; color: #fff;' }, 'Netfilter'),
                    E('div', { style: 'font-size: 1em; margin-bottom: 8px;' }, [
                        E('span', { style: 'color: ' + netfilterColor + '; font-weight: bold;' }, netfilterText),
                        E('span', { style: 'margin-left: 10px; color: #aaa;' }, netfilterDetail)
                    ]),
                    E('div', { style: 'color: #888; font-size: 0.85em; margin-top: 5px; white-space: pre-wrap;' }, netfilterHint)
                ])
            ])
        ]);

        function toggleService(ev) {
            ev.preventDefault();
            if (!installed) return;
            var action = running ? 'stop' : 'start';
            setServiceState(action).finally(function() { window.location.reload(); });
        }

        function restartService(ev) {
            ev.preventDefault();
            if (!installed) return;
            setServiceState('restart').finally(function() { window.location.reload(); });
        }

        function toggleAutostart(ev) {
            ev.preventDefault();
            if (!installed) return;
            var newState = !autostart;
            setAutostart(newState).finally(function() { window.location.reload(); });
        }

        function updateService(ev) {
            ev.preventDefault();
            console.log('B4: начало обновления');
            var modal = ui.showModal('Обновление B4', [
                E('p', 'Выполняется обновление. Пожалуйста, подождите...'),
                E('pre', { id: 'update-log', style: 'max-height:400px; overflow:auto; background:#000; color:#fff; padding:5px; white-space:pre-wrap;' })
            ]);
            var logEl = document.getElementById('update-log');
            function updateLog(msg) {
                if (logEl) logEl.textContent += msg + '\n';
            }
            updateLog('Начинаем обновление B4...');
            runInstallation(updateLog).then(function() {
                updateLog('Обновление завершено успешно.');
                setServiceState('restart').then(function() {
                    updateLog('B4 перезапущен. Открываем веб-интерфейс...');
                    setTimeout(function() {
                        window.open('http://' + window.location.hostname + ':7000', '_blank');
                    }, 1000);
                    setTimeout(function() {
                        ui.hideModal();
                        window.location.reload();
                    }, 2000);
                }).catch(function(err) {
                    updateLog('Ошибка перезапуска: ' + err.message);
                    setTimeout(function() { window.location.reload(); }, 2000);
                });
            }).catch(function(err) {
                updateLog('❌ Обновление не удалось: ' + err.message);
                var modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    var closeButton = E('button', {
                        class: 'cbi-button cbi-button-neutral',
                        style: 'background: #6c757d; border-color: #6c757d; color: white; margin-top: 20px;',
                        click: function(ev) {
                            ev.preventDefault();
                            ui.hideModal();
                        }
                    }, 'Закрыть');
                    modalContent.appendChild(closeButton);
                }
            });
        }

        function removeServiceHandler(ev) {
            ev.preventDefault();
            if (!installed) return;
            if (confirm('Вы уверены, что хотите полностью удалить Bye Bye Big Bro (B4)?')) {
                console.log('B4: удаление');
                removeService().finally(function() {
                    ui.addNotification(null, E('p', 'Bye Bye Big Bro (B4) был удален с вашего устройства'));
                    setTimeout(function() { window.location.reload(); }, 2000);
                });
            }
        }

        function installService(ev) {
            ev.preventDefault();
            if (installed) return;
            console.log('B4: начало установки');

            var modal = ui.showModal('Установка B4', [
                E('p', 'Выполняется установка. Пожалуйста, подождите...'),
                E('pre', { id: 'install-log', style: 'max-height:400px; overflow:auto; background:#000; color:#fff; padding:5px; white-space:pre-wrap;' })
            ]);
            var logEl = document.getElementById('install-log');
            function updateLog(msg) {
                if (logEl) logEl.textContent += msg + '\n';
            }
            updateLog('Начинаем установку B4...');
            runInstallation(updateLog).then(function() {
                updateLog('Установка завершена успешно.');
                setServiceState('restart').then(function() {
                    updateLog('B4 запущен. Открываем веб-интерфейс...');
                    setTimeout(function() {
                        window.open('http://' + window.location.hostname + ':7000', '_blank');
                    }, 1000);
                    setTimeout(function() {
                        ui.hideModal();
                        window.location.reload();
                    }, 2000);
                }).catch(function(err) {
                    updateLog('Ошибка запуска: ' + err.message);
                    setTimeout(function() { window.location.reload(); }, 2000);
                });
            }).catch(function(err) {
                updateLog('❌ Установка не удалась: ' + err.message);
                var modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    var closeButton = E('button', {
                        class: 'cbi-button cbi-button-neutral',
                        style: 'background: #6c757d; border-color: #6c757d; color: white; margin-top: 20px;',
                        click: function(ev) {
                            ev.preventDefault();
                            ui.hideModal();
                        }
                    }, 'Закрыть');
                    modalContent.appendChild(closeButton);
                }
            });
        }

        function toggleLogging(ev) {
            ev.preventDefault();
            if (!installed) return;
            var newState = !syslogEnabled;
            setSyslogState(newState).then(function() {
                ui.addNotification(null, E('p', 'Настройка логирования изменена. Перезагрузка страницы...'));
                window.location.reload();
            }).catch(function(err) {
                ui.addNotification(null, E('p', { class: 'error' }, 'Ошибка изменения логирования: ' + err.message));
            });
        }

        function refreshLog() {
            if (!installed) return;
            getLog().then(function(logText) {
                document.getElementById('log-content').value = logText;
            });
        }

        var titleElement;
        function animateTitle(ev) {
            if (titleElement && !titleElement._animating) {
                titleElement._animating = true;
                var originalText = titleElement.textContent;
                var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
                var iterations = 10;
                var i = 0;
                var interval = setInterval(function() {
                    if (i >= iterations) {
                        clearInterval(interval);
                        titleElement.textContent = originalText;
                        titleElement._animating = false;
                        return;
                    }
                    var newText = '';
                    for (var j = 0; j < originalText.length; j++) {
                        if (Math.random() > 0.7) {
                            newText += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
                        } else {
                            newText += originalText.charAt(j);
                        }
                    }
                    titleElement.textContent = newText;
                    i++;
                }, 50);
            }
        }

        var linksSection = E('div', {
            style: 'background: #1f1218; padding: 12px; margin: 15px 0; border-radius: 0;'
        }, [
            E('p', { style: 'color: #fff; margin: 5px 0; font-weight: bold; font-size: 0.9em;' }, [
                'Документация: ',
                E('a', { href: 'https://daniellavrushin.github.io/b4/', target: '_blank', style: 'color: #f5ad18; font-weight: bold;' }, 'https://daniellavrushin.github.io/b4/')
            ]),
            E('p', { style: 'color: #fff; margin: 5px 0; font-weight: bold; font-size: 0.9em;' }, [
                'GitHub: ',
                E('a', { href: 'https://github.com/DanielLavrushin/b4/', target: '_blank', style: 'color: #f5ad18; font-weight: bold;' }, 'https://github.com/DanielLavrushin/b4/')
            ]),
            E('p', { style: 'color: #fff; margin: 5px 0; font-weight: bold; font-size: 0.9em;' }, [
                'Telegram-канал: ',
                E('a', { href: 'https://t.me/byebyebigbro/', target: '_blank', style: 'color: #f5ad18; font-weight: bold;' }, 'https://t.me/byebyebigbro/')
            ]),
            E('p', { style: 'color: #fff; margin: 5px 0; font-weight: bold; font-size: 0.9em;' }, [
                'Автор LuCi интерфейса: ',
                E('span', { style: 'color: #f5ad18; font-weight: bold;' }, 'BugOldfag')
            ])
        ]);

        var titleSection = E('h2', {
            style: 'background: linear-gradient(135deg, #591631 0%, #591631 70%, #efa919 100%); color: white; padding: 8px; border-radius: 4px; cursor: pointer;',
            onmouseenter: function(ev) { animateTitle(ev); }
        }, [
            'Bye Bye Big Bro (',
            E('span', { style: 'color: #f5ad18;' }, 'B4'),
            ')'
        ]);
        titleElement = titleSection;

        var statusText = installed ? 'Установлен' : 'Отсутствует';
        var statusColor = installed ? '#28a745' : '#dc3545';
        var versionButton = installed ?
            E('button', {
                id: 'b4_version_button',
                class: 'cbi-button cbi-button-neutral',
                style: 'background: #000; border-color: #000; color: #fff; margin-left: 20px; cursor: default;',
            }, version) :
            E('button', {
                class: 'cbi-button cbi-button-apply',
                style: 'background: #007bff; border-color: #0069d9; color: white;',
                click: installService
            }, 'Установить');

        var installStatusSection = E('div', { class: 'cbi-section' }, [
            E('div', { style: sectionTitleStyle }, 'Статус установки'),
            E('div', { style: darkPanelStyle }, [
                E('div', { style: 'display: flex; align-items: center;' }, [
                    E('span', { style: 'color: ' + statusColor + '; font-weight: bold; font-size: 1.2em;' }, statusText),
                    versionButton
                ])
            ])
        ]);

        var controlSection = E('div', { class: 'cbi-section' }, [
            E('div', { style: sectionTitleStyle }, 'Управление службой'),
            E('div', { style: darkPanelStyle }, [
                E('div', { class: 'cbi-value', style: 'margin-bottom: 10px; display: flex; align-items: center;' }, [
                    E('label', { class: 'cbi-value-title', style: darkPanelLabelStyle }, 'Состояние'),
                    E('div', { class: 'cbi-value-field', style: darkPanelFieldStyle }, [
                        E('button', {
                            class: 'cbi-button',
                            style: installed ? (running ? 'background: #d9534f; border-color: #d43f3a; color: white;' : 'background: #28a745; border-color: #28a745; color: white;') : disabledButtonStyle,
                            click: toggleService
                        }, running ? 'Выключить' : 'Включить'),
                        E('span', { style: 'margin-left: 20px;' }, running ? 'Служба запущена' : 'Служба остановлена')
                    ])
                ]),
                E('div', { class: 'cbi-value', style: 'margin-bottom: 10px; display: flex; align-items: center;' }, [
                    E('label', { class: 'cbi-value-title', style: darkPanelLabelStyle }, 'Автозагрузка'),
                    E('div', { class: 'cbi-value-field', style: darkPanelFieldStyle }, [
                        E('button', {
                            class: 'cbi-button',
                            style: installed ? (autostart ? 'background: #d9534f; border-color: #d43f3a; color: white;' : 'background: #28a745; border-color: #28a745; color: white;') : disabledButtonStyle,
                            click: toggleAutostart
                        }, autostart ? 'Отключить' : 'Включить'),
                        E('span', { style: 'margin-left: 20px;' }, autostart ? 'Включена' : 'Отключена')
                    ])
                ]),
                E('div', { class: 'cbi-value', style: 'margin-bottom: 10px; display: flex; align-items: center;' }, [
                    E('label', { class: 'cbi-value-title', style: darkPanelLabelStyle }, 'Перезапуск B4'),
                    E('div', { class: 'cbi-value-field', style: darkPanelFieldStyle }, [
                        E('button', {
                            class: 'cbi-button cbi-button-action',
                            style: installed ? 'background: #6c757d; border-color: #6c757d; color: white;' : disabledButtonStyle,
                            click: restartService
                        }, 'Перезагрузить')
                    ])
                ]),
                E('div', { class: 'cbi-value', style: 'margin-bottom: 10px; display: flex; align-items: center;' }, [
                    E('label', { class: 'cbi-value-title', style: darkPanelLabelStyle }, 'Обновление'),
                    E('div', { class: 'cbi-value-field', style: darkPanelFieldStyle }, [
                        E('button', {
                            class: 'cbi-button cbi-button-apply',
                            style: installed ? 'background: #007bff; border-color: #0069d9; color: white;' : disabledButtonStyle,
                            click: updateService
                        }, 'Обновить до последней версии')
                    ])
                ]),
                E('div', { class: 'cbi-value', style: 'margin-bottom: 10px; display: flex; align-items: center;' }, [
                    E('label', { class: 'cbi-value-title', style: darkPanelLabelStyle }, 'Удаление'),
                    E('div', { class: 'cbi-value-field', style: darkPanelFieldStyle }, [
                        E('button', {
                            class: 'cbi-button cbi-button-negative',
                            style: installed ? 'background: #d9534f; border-color: #d43f3a; color: white;' : disabledButtonStyle,
                            click: removeServiceHandler
                        }, 'Удалить B4')
                    ])
                ])
            ])
        ]);

        var logControl = E('div', { style: 'margin-bottom: 10px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;' }, [
            E('button', {
                class: 'cbi-button cbi-button-reload',
                style: installed ? '' : disabledButtonStyle,
                click: refreshLog
            }, 'Обновить лог'),
            E('button', {
                class: 'cbi-button cbi-button-' + (syslogEnabled ? 'action' : 'neutral'),
                style: installed ? '' : disabledButtonStyle,
                click: toggleLogging
            }, syslogEnabled ? 'Выключить логирование' : 'Включить логирование')
        ]);

        var logSection = E('div', { class: 'cbi-section' }, [
            E('div', { style: sectionTitleStyle }, 'Лог службы'),
            E('div', { style: darkPanelStyle }, [
                logControl,
                E('textarea', {
                    class: 'cbi-input-textarea',
                    style: 'width: 100%; height: 300px; font-family: monospace; background: #000; color: #fff; border: 1px solid #333;',
                    readonly: 'readonly',
                    id: 'log-content'
                }, 'Нажмите «Обновить лог»')
            ])
        ]);

        var tabNames = ['Основное', 'Совместимость'];
        var activeTab = 0;
        var tabContents = [
            E('div', [configuratorSection, installStatusSection, controlSection, logSection]),
            E('div', [compatibilitySection])
        ];

        function createTabs() {
            var tabs = E('div', { style: 'margin-bottom: 15px; display: flex; gap: 5px;' });
            var contents = E('div');
            for (var i = 0; i < tabNames.length; i++) {
                (function(idx) {
                    var tabButton = E('button', {
                        class: 'cbi-button cbi-button-' + (idx === activeTab ? 'action' : 'neutral'),
                        style: idx === activeTab ? 'background: #f5ad18; border-color: #f5ad18; color: #000;' : '',
                        click: function(ev) {
                            ev.preventDefault();
                            activeTab = idx;
                            var newTabs = createTabs();
                            var oldTabs = document.getElementById('tabs-container');
                            if (oldTabs) oldTabs.parentNode.replaceChild(newTabs, oldTabs);
                        }
                    }, tabNames[idx]);
                    tabs.appendChild(tabButton);
                })(i);
            }
            contents.appendChild(tabContents[activeTab]);
            return E('div', { id: 'tabs-container' }, [tabs, contents]);
        }

        var tabsContainer = createTabs();

        return E([titleSection, linksSection, tabsContainer]);
    }
});
