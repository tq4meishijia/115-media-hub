const PROVIDER_LABELS = {
    '115': '115',
    quark: '夸克',
    aliyun: '阿里',
    tianyi: '天翼',
    '123pan': '123',
};

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

let overviewState = {
    busy: false,
    data: null,
    timer: null,
};

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function text(value, fallback = '') {
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback;
}

function providerLabel(provider) {
    return PROVIDER_LABELS[String(provider || '').toLowerCase()] || String(provider || '网盘').toUpperCase();
}

function formatSchedule(task) {
    const weekdays = Array.isArray(task?.schedule_weekdays)
        ? task.schedule_weekdays.map((item) => Number(item)).filter((item) => item >= 1 && item <= 7)
        : [];
    const start = text(task?.schedule_start_time, '00:00');
    if (!weekdays.length) return '仅手动';
    const dayText = weekdays.length === 7
        ? '每日'
        : weekdays.map((day) => WEEKDAY_LABELS[day - 1]).join('、');
    const interval = Number(task?.schedule_interval_minutes || 0);
    const intervalText = interval > 0 ? ` · 每 ${interval} 分钟` : '';
    return `${dayText} ${start}${intervalText}`;
}

function formatProgress(task) {
    const total = Number(task?.total_episodes || task?.tmdb_total_episodes || 0);
    if (!total) return '';
    const last = Number(task?.last_episode || task?.current_episode || 0);
    return last > 0 ? `${last}/${total} 集` : `共 ${total} 集`;
}

function statusOf(task, runtime, globalRunning) {
    if (task?.enabled === false) return { cls: 'sp-pill-paused', label: '已暂停' };
    const update = runtime.get(text(task?.name));
    const status = text(update?.status || update?.state).toLowerCase();
    if (status.includes('fail') || status.includes('error')) return { cls: 'sp-pill-error', label: '异常' };
    if (globalRunning && text(globalRunning) === text(task?.name)) return { cls: 'sp-pill-running', label: '运行中' };
    if (status.includes('running')) return { cls: 'sp-pill-running', label: '运行中' };
    if (status.includes('pause')) return { cls: 'sp-pill-paused', label: '已暂停' };
    return { cls: 'sp-pill-idle', label: '定时中' };
}

function renderStats(state) {
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const paused = tasks.filter((task) => task?.enabled === false).length;
    const links = tasks.reduce((sum, task) => {
        const count = Array.isArray(task?.links) ? task.links.length : (task?.share_link_url ? 1 : 0);
        return sum + count;
    }, 0);
    const jobCount = Number(state?.jobs?.stats?.active_job_count || state?.jobs?.job_counts?.active || 0);
    const crossCount = Number(state?.cross?.counts?.active || 0);
    const values = {
        tasks: tasks.length,
        running: state.subscription?.running ? Math.max(1, Number(state?.subscription?.running_count || 1)) : 0,
        paused,
        links,
        jobs: jobCount,
        cross: crossCount,
    };
    document.querySelectorAll('#sp-overview-stats [data-stat]').forEach((el) => {
        const key = el.getAttribute('data-stat');
        if (key in values) el.textContent = String(values[key]);
    });
    if (window.spShell?.syncNavBadge) window.spShell.syncNavBadge(tasks.length);
}

function taskCard(task, state) {
    const runtime = new Map();
    (Array.isArray(state?.subscription?.task_updates) ? state.subscription.task_updates : []).forEach((item) => {
        const name = text(item?.name || item?.task_name);
        if (name) runtime.set(name, item);
    });
    const status = statusOf(task, runtime, state?.subscription?.current_task);
    const name = text(task?.name || task?.title, '未命名任务');
    const progressText = formatProgress(task);
    const provider = providerLabel(task?.provider);
    return `
        <article class="sp-task-card" data-task="${escapeHtml(name)}">
            <div class="sp-task-top">
                <span class="sp-task-avatar">${escapeHtml(provider)}</span>
                <div style="min-width:0;flex:1 1 auto;">
                    <p class="sp-task-name" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
                    <div class="sp-task-meta">
                        <span>${escapeHtml(formatSchedule(task))}</span>
                        ${progressText ? `<span>· ${escapeHtml(progressText)}</span>` : ''}
                    </div>
                </div>
                <span class="sp-pill ${status.cls}">${escapeHtml(status.label)}</span>
            </div>
            <div class="sp-task-body">
                <span>${task?.media_type === 'movie' ? '电影' : '剧集'} · ${escapeHtml(task?.savepath || '未设置保存路径')}</span>
                <span>${escapeHtml(text(task?.quality_priority, '自动'))}</span>
            </div>
            <div class="sp-progress"><span style="width:${task?.enabled === false ? 0 : 100}%"></span></div>
            <div class="sp-task-actions">
                <button type="button" class="sp-btn sp-btn-sm" data-sp-action="run" data-task-name="${escapeHtml(name)}">执行</button>
                <button type="button" class="sp-btn sp-btn-sm" data-sp-action="edit" data-task-name="${escapeHtml(name)}">编辑</button>
                <button type="button" class="sp-btn sp-btn-sm sp-btn-ghost" data-sp-action="detail">详情</button>
            </div>
        </article>
    `;
}

function renderTasks(state) {
    const container = document.getElementById('sp-overview-running');
    if (!container) return;
    const tasks = Array.isArray(state?.subscription?.tasks) ? state.subscription.tasks.slice() : [];
    if (!tasks.length) {
        container.innerHTML = `
            <div class="sp-empty" style="grid-column:1 / -1;">
                <strong>还没有追更任务</strong>
                <span>粘贴一个分享链接或磁力，创建第一条自动追更任务。</span>
                <button type="button" class="sp-btn sp-btn-primary sp-btn-sm" onclick="openNewSubscriptionTask()">新建任务</button>
            </div>`;
        return;
    }
    tasks.sort((a, b) => {
        const aPaused = a?.enabled === false ? 1 : 0;
        const bPaused = b?.enabled === false ? 1 : 0;
        return aPaused - bPaused;
    });
    container.innerHTML = tasks.slice(0, 6).map((task) => taskCard(task, state)).join('');
}

function renderActivity(state) {
    const container = document.getElementById('sp-overview-activity');
    if (!container) return;
    const logs = Array.isArray(state?.subscription?.logs) ? state.subscription.logs : [];
    const rows = logs
        .filter((row) => row && (row.display_text || row.text))
        .slice(-8)
        .reverse();
    if (!rows.length) {
        container.innerHTML = '<div class="sp-empty"><span>暂无订阅日志。</span></div>';
        return;
    }
    container.innerHTML = rows.map((row) => {
        const line = text(row.display_text || row.text);
        const seq = Number(row.seq || 0);
        const level = text(row.level);
        const tone = level.includes('error') ? 'color:#fb7185;' : (level.includes('success') ? 'color:#6ee7b7;' : '');
        return `
            <div class="sp-activity-row">
                <span class="sp-activity-time">${seq ? `#${seq}` : '--'}</span>
                <span class="sp-activity-text" style="${tone}">${escapeHtml(line)}</span>
            </div>`;
    }).join('');
}

function renderHealth(state) {
    const container = document.getElementById('sp-overview-health');
    if (!container) return;
    const health = state?.cookies?.cookie_health || {};
    const entries = Object.entries(health);
    if (!entries.length) {
        container.innerHTML = '<div class="sp-empty"><span>暂无账号状态。</span></div>';
        return;
    }
    container.innerHTML = entries.map(([name, item]) => {
        const configured = Boolean(item?.configured);
        const stateName = text(item?.state, configured ? 'ok' : 'missing');
        const error = stateName.includes('error') || stateName.includes('invalid') || stateName.includes('expired');
        return `
            <div class="sp-health-row">
                <div style="min-width:0;">
                    <div class="sp-health-name">${escapeHtml(providerLabel(name))}</div>
                    <div class="sp-health-meta">${escapeHtml(text(item?.message, configured ? '已配置' : '未配置'))}</div>
                </div>
                <span class="sp-pill ${configured ? (error ? 'sp-pill-error' : 'sp-pill-running') : 'sp-pill-idle'}">${configured ? (error ? '异常' : '正常') : '未配置'}</span>
            </div>`;
    }).join('');
}

function renderToday(state) {
    const container = document.getElementById('sp-overview-today');
    if (!container) return;
    const tasks = Array.isArray(state?.subscription?.tasks) ? state.subscription.tasks : [];
    const weekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
    const todayTasks = tasks
        .filter((task) => Array.isArray(task?.schedule_weekdays) && task.schedule_weekdays.map(Number).includes(weekday))
        .sort((a, b) => text(a?.schedule_start_time).localeCompare(text(b?.schedule_start_time)));
    if (!todayTasks.length) {
        container.innerHTML = '<div class="sp-empty" style="padding:18px 12px;"><span>今天没有排期任务。</span></div>';
        return;
    }
    container.innerHTML = todayTasks.slice(0, 5).map((task) => `
        <div class="sp-health-row">
            <div style="min-width:0;">
                <div class="sp-health-name">${escapeHtml(text(task?.name || task?.title, '未命名'))}</div>
                <div class="sp-health-meta">${escapeHtml(text(task?.savepath, '未设置路径'))}</div>
            </div>
            <span class="sp-mono sp-muted">${escapeHtml(text(task?.schedule_start_time, '--:--'))}</span>
        </div>
    `).join('');
}

function renderAll(state) {
    renderStats(state);
    renderTasks(state);
    renderActivity(state);
    renderHealth(state);
    renderToday(state);
}

async function loadOverviewData(force = false) {
    if (overviewState.busy) return;
    overviewState.busy = true;
    const api = window.MediaHubApi;
    try {
        const results = await Promise.allSettled([
            api.getJson('/subscription/status'),
            api.getJson('/resource/jobs/state?page=1&page_size=1'),
            api.getJson('/cross_copy/jobs'),
            api.getJson('/settings/cookies/status'),
        ]);
        const pick = (index) => (results[index].status === 'fulfilled' ? results[index].value : null);
        const state = {
            subscription: pick(0),
            jobs: pick(1),
            cross: pick(2),
            cookies: pick(3),
        };
        overviewState.data = state;
        renderAll(state);
        if (force === true) window.showToast?.('总览已刷新', { tone: 'success', duration: 1600 });
    } finally {
        overviewState.busy = false;
    }
}

function startAutoRefresh() {
    if (overviewState.timer) return;
    overviewState.timer = window.setInterval(() => {
        const page = document.getElementById('page-overview');
        if (!page || page.classList.contains('hidden') || document.hidden) return;
        loadOverviewData(false);
    }, 30000);
}

function bindTaskActions() {
    const container = document.getElementById('sp-overview-running');
    if (!container || container.dataset.spBound === '1') return;
    container.dataset.spBound = '1';
    container.addEventListener('click', (event) => {
        const button = event.target.closest('[data-sp-action]');
        if (!button) return;
        const action = button.getAttribute('data-sp-action');
        const name = button.getAttribute('data-task-name') || '';
        if (action === 'detail') {
            switchTab('subscription');
            return;
        }
        if (action === 'run' && typeof window.startSubscriptionTask === 'function') {
            window.startSubscriptionTask(name);
            return;
        }
        if (action === 'edit' && typeof window.editSubscriptionTask === 'function') {
            window.editSubscriptionTask(name);
        }
    });
}

export async function ensureTabData() {
    bindTaskActions();
    startAutoRefresh();
    await loadOverviewData(false);
}

window.spOverviewRefresh = () => loadOverviewData(true);
