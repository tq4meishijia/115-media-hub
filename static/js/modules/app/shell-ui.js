(function (global) {
    'use strict';

    const TITLES = {
        overview: '总览',
        subscription: '自动追更',
        calendar: '追剧日历',
        scraper: '文件浏览',
        resource: '资源搜索',
        recommendation: '发现页',
        monitor: '链接监控',
        tools: '批量工具',
        task: '目录树生成',
        accounts: '账号管理',
        settings: '设置',
        about: '关于与版本',
    };

    const state = {
        statusTimer: null,
        statusBusy: false,
        contextLoaded: false,
        lastStatus: null,
    };

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || fallback;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value == null ? '' : value);
    }

    function syncTitle(tab) {
        const normalized = text(tab, 'overview');
        setText('shell-current-title', TITLES[normalized] || TITLES.overview);
        document.title = `${TITLES[normalized] || TITLES.overview} · 115 Media Hub`;
    }

    function syncNavBadge(count) {
        const badge = document.getElementById('sp-nav-subscription-count');
        if (!badge) return;
        const total = Number(count || 0);
        if (!Number.isFinite(total) || total <= 0) {
            badge.classList.add('hidden');
            badge.textContent = '0';
            return;
        }
        badge.textContent = String(total);
        badge.classList.remove('hidden');
    }

    function syncStatusBar(running, totalTasks, runningLabel) {
        const bar = document.getElementById('sp-statusbar');
        const label = document.getElementById('sp-statusbar-text');
        if (!bar || !label) return;
        const runningCount = Number(running || 0);
        const total = Number(totalTasks || 0);
        if (runningCount > 0) {
            bar.classList.remove('is-idle');
            label.textContent = runningLabel || `${runningCount} 个任务运行中`;
        } else {
            bar.classList.add('is-idle');
            label.textContent = total > 0 ? `空闲 · 共 ${total} 个追踪任务` : '空闲';
        }
    }

    async function refreshStatus() {
        if (state.statusBusy || document.hidden) return;
        if (typeof global.MediaHubApi?.getJson !== 'function') return;
        state.statusBusy = true;
        try {
            const data = await global.MediaHubApi.getJson('/subscription/status?compact=1');
            const running = Boolean(data?.running);
            const tasks = Array.isArray(data?.tasks) ? data.tasks : null;
            const taskCount = tasks ? tasks.length : Number(data?.task_count || 0);
            const runningLabel = running
                ? `运行中：${text(data?.current_task, '任务')}`
                : '';
            syncStatusBar(running ? 1 : 0, taskCount, runningLabel);
            if (tasks) syncNavBadge(tasks.length);
            state.lastStatus = data || null;
        } catch (e) {
            // 未登录或后端暂不可用时保持静默，状态栏维持原状。
        } finally {
            state.statusBusy = false;
        }
    }

    async function refreshContext() {
        if (typeof global.MediaHubApi?.getJson !== 'function') return;
        try {
            const data = await global.MediaHubApi.getJson('/settings/cookies/status');
            const health = data?.cookie_health?.['115'] || {};
            const wrap = document.getElementById('sp-topbar-context');
            const value = document.getElementById('sp-topbar-context-value');
            if (wrap && value) {
                wrap.classList.remove('hidden');
                const configured = Boolean(health.configured);
                value.textContent = configured
                    ? (health.state === 'ok' || health.state === 'valid' ? '已登录' : '待检测')
                    : '未登录';
            }
            state.contextLoaded = true;
        } catch (e) {}
    }

    function startPolling() {
        if (state.statusTimer) return;
        refreshStatus();
        refreshContext();
        state.statusTimer = global.setInterval(refreshStatus, 30000);
    }

    function mirrorVersion() {
        const source = document.getElementById('version-text');
        const target = document.getElementById('sp-statusbar-version');
        if (!source || !target) return;
        const apply = () => {
            const value = text(source.textContent, '--');
            if (value && value !== '--') target.textContent = value;
        };
        apply();
        if (typeof MutationObserver === 'function') {
            new MutationObserver(apply).observe(source, { childList: true, characterData: true, subtree: true });
        }
    }

    function init() {
        mirrorVersion();
        startPolling();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshStatus();
        });
        syncTitle(global.currentTab || 'overview');
    }

    global.spShell = {
        syncTitle,
        refreshStatus,
        refreshContext,
        syncNavBadge,
        TITLES,
    };
    global.spShellSetTab = syncTitle;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
