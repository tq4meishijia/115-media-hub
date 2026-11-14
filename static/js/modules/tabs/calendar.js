const CAL_PROVIDER_LABELS = {
    '115': '115',
    quark: '夸克',
    aliyun: '阿里',
    tianyi: '天翼',
    '123pan': '123',
};

let calendarState = {
    weekOffset: 0,
    tasks: [],
    loading: false,
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

function startOfWeek(offset = 0) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const day = now.getDay() === 0 ? 7 : now.getDay();
    now.setDate(now.getDate() - (day - 1) + offset * 7);
    return now;
}

function addDays(date, days) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
}

function formatMonthDay(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function scheduleText(task) {
    const weekdays = Array.isArray(task?.schedule_weekdays)
        ? task.schedule_weekdays.map((item) => Number(item)).filter((item) => item >= 1 && item <= 7)
        : [];
    if (!weekdays.length) return '未排期';
    return `${weekdays.length === 7 ? '每日' : weekdays.join(',')} · ${text(task?.schedule_start_time, '00:00')}`;
}

function taskMatchesFilters(task) {
    const typeFilter = text(document.getElementById('sp-cal-filter-type')?.value, 'all');
    const statusFilter = text(document.getElementById('sp-cal-filter-status')?.value, 'all');
    const mediaType = text(task?.media_type, 'tv');
    if (typeFilter !== 'all' && mediaType !== typeFilter) return false;
    const enabled = task?.enabled !== false;
    if (statusFilter === 'enabled' && !enabled) return false;
    if (statusFilter === 'paused' && enabled) return false;
    return true;
}

function buildItem(task, { time, kind = 'schedule' } = {}) {
    const name = text(task?.name || task?.title, '未命名任务');
    const enabled = task?.enabled !== false;
    const provider = CAL_PROVIDER_LABELS[text(task?.provider).toLowerCase()] || text(task?.provider, '网盘');
    const cls = enabled ? '' : 'is-paused';
    const timeLabel = kind === 'air' ? `更新 · ${text(time, '')}` : text(time, '--:--');
    return `
        <button type="button" class="sp-cal-item ${cls}" data-sp-cal-task="${escapeHtml(name)}" title="${escapeHtml(`${name} · ${provider} · ${scheduleText(task)}`)}">
            <span class="sp-cal-item-time">${escapeHtml(timeLabel)} · ${escapeHtml(provider)}</span>
            <span class="sp-cal-item-name">${escapeHtml(name)}</span>
        </button>`;
}

function renderSummary(weekStart, weekTasks) {
    const container = document.getElementById('sp-cal-summary');
    if (!container) return;
    const weekEnd = addDays(weekStart, 6);
    const label = document.getElementById('sp-cal-week-label');
    if (label) label.textContent = `${weekStart.getFullYear()} 年 ${formatMonthDay(weekStart)} - ${formatMonthDay(weekEnd)}`;
    const todayKey = toDateKey(new Date());
    const todayCount = weekTasks.filter((item) => toDateKey(item.date) === todayKey).length;
    const unscheduled = calendarState.tasks.filter((task) => !Array.isArray(task?.schedule_weekdays) || !task.schedule_weekdays.length).length;
    container.innerHTML = `
        <div class="sp-stat"><span class="sp-stat-label">本周排期</span><span class="sp-stat-value">${weekTasks.length}</span></div>
        <div class="sp-stat"><span class="sp-stat-label">今日</span><span class="sp-stat-value is-running">${todayCount}</span></div>
        <div class="sp-stat"><span class="sp-stat-label">追更任务</span><span class="sp-stat-value">${calendarState.tasks.length}</span></div>
        <div class="sp-stat"><span class="sp-stat-label">未排期</span><span class="sp-stat-value is-paused">${unscheduled}</span></div>
    `;
}

function renderUnscheduled() {
    const container = document.getElementById('sp-cal-unscheduled');
    if (!container) return;
    const list = calendarState.tasks.filter((task) => !Array.isArray(task?.schedule_weekdays) || !task.schedule_weekdays.length);
    if (!calendarState.tasks.length) {
        container.textContent = '还没有追更任务，先创建一条再来查看排期。';
        return;
    }
    if (!list.length) {
        container.textContent = '所有任务都已设置每周执行时间。';
        return;
    }
    container.innerHTML = list.map((task) => `
        <span class="sp-pill sp-pill-idle" style="margin:2px 4px 2px 0;cursor:pointer;" data-sp-cal-task="${escapeHtml(text(task?.name || task?.title, '未命名'))}">${escapeHtml(text(task?.name || task?.title, '未命名'))}</span>
    `).join('');
}

export function spCalendarRender() {
    const grid = document.getElementById('sp-cal-grid');
    if (!grid) return;
    const weekStart = startOfWeek(calendarState.weekOffset);
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const todayKey = toDateKey(new Date());
    const tasks = calendarState.tasks.filter(taskMatchesFilters);

    const itemsByDay = new Map(days.map((date) => [toDateKey(date), []]));
    tasks.forEach((task) => {
        const weekdays = Array.isArray(task?.schedule_weekdays)
            ? task.schedule_weekdays.map((item) => Number(item)).filter((item) => item >= 1 && item <= 7)
            : [];
        weekdays.forEach((weekday) => {
            const date = days[weekday - 1];
            const key = toDateKey(date);
            if (itemsByDay.has(key)) {
                itemsByDay.get(key).push({ task, date, kind: 'schedule', time: text(task?.schedule_start_time, '00:00') });
            }
        });
        const airDate = text(task?.tmdb_next_air_date);
        if (airDate) {
            const key = airDate.slice(0, 10);
            if (itemsByDay.has(key)) {
                itemsByDay.get(key).push({ task, date: new Date(`${key}T00:00:00`), kind: 'air', time: airDate.slice(5) });
            }
        }
    });

    const allItems = [];
    grid.innerHTML = days.map((date, index) => {
        const key = toDateKey(date);
        const items = (itemsByDay.get(key) || []).sort((a, b) => String(a.time).localeCompare(String(b.time)));
        allItems.push(...items);
        const dayLabel = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index];
        return `
            <div class="sp-cal-col ${key === todayKey ? 'is-today' : ''}">
                <div class="sp-cal-head">
                    <span class="sp-cal-day">${dayLabel}</span>
                    <span class="sp-cal-date">${formatMonthDay(date)}</span>
                </div>
                ${items.length ? items.map((item) => buildItem(item.task, item)).join('') : '<div class="sp-cal-empty">—</div>'}
            </div>`;
    }).join('');

    renderSummary(weekStart, allItems);
    renderUnscheduled();
}

export function spCalendarShift(delta) {
    calendarState.weekOffset += Number(delta || 0);
    spCalendarRender();
}

export function spCalendarToday() {
    calendarState.weekOffset = 0;
    spCalendarRender();
}

export async function spCalendarRefresh(showToast = true) {
    if (calendarState.loading) return;
    calendarState.loading = true;
    try {
        const data = await window.MediaHubApi.getJson('/subscription/status');
        calendarState.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
        spCalendarRender();
        if (showToast) window.showToast?.('日历已刷新', { tone: 'success', duration: 1500 });
    } catch (error) {
        window.showToast?.(`日历加载失败：${error?.message || '未知错误'}`, { tone: 'error', duration: 3000 });
    } finally {
        calendarState.loading = false;
    }
}

function bindCalendarActions() {
    const grid = document.getElementById('sp-cal-grid');
    if (grid && grid.dataset.spBound !== '1') {
        grid.dataset.spBound = '1';
        grid.addEventListener('click', (event) => {
            const item = event.target.closest('[data-sp-cal-task]');
            if (!item) return;
            const name = item.getAttribute('data-sp-cal-task') || '';
            if (name && typeof window.editSubscriptionTask === 'function') {
                window.editSubscriptionTask(name);
            }
        });
    }
    const unscheduled = document.getElementById('sp-cal-unscheduled');
    if (unscheduled && unscheduled.dataset.spBound !== '1') {
        unscheduled.dataset.spBound = '1';
        unscheduled.addEventListener('click', (event) => {
            const item = event.target.closest('[data-sp-cal-task]');
            if (!item) return;
            const name = item.getAttribute('data-sp-cal-task') || '';
            if (name && typeof window.editSubscriptionTask === 'function') {
                window.editSubscriptionTask(name);
            }
        });
    }
}

export async function ensureTabData() {
    bindCalendarActions();
    await spCalendarRefresh(false);
}

window.spCalendarRender = spCalendarRender;
window.spCalendarShift = spCalendarShift;
window.spCalendarToday = spCalendarToday;
window.spCalendarRefresh = () => spCalendarRefresh(true);
