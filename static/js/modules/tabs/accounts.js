const ACCOUNT_PROVIDER_ORDER = ['115', 'quark', 'aliyun', 'tianyi', '123pan'];

const ACCOUNT_PROVIDER_LABELS = {
    '115': '115 网盘',
    quark: '夸克网盘',
    aliyun: '阿里云盘',
    tianyi: '天翼云盘',
    '123pan': '123 云盘',
};

let accountsState = {
    providers: [],
    health: {},
    loading: false,
    qr: {
        timer: null,
        uid: '',
        time: '',
        sign: '',
        app: '',
        busy: false,
    },
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

function providerLabel(name) {
    return ACCOUNT_PROVIDER_LABELS[String(name || '').toLowerCase()] || String(name || '平台');
}

function providerInitial(name) {
    const normalized = String(name || '').toLowerCase();
    if (normalized === '115') return '115';
    if (normalized === '123pan') return '123';
    return normalized.slice(0, 2).toUpperCase();
}

function healthStatus(item) {
    if (!item) return { cls: 'sp-pill-idle', label: '未配置' };
    if (item.configured === false) return { cls: 'sp-pill-idle', label: '未配置' };
    const stateName = text(item.state, 'ok').toLowerCase();
    if (stateName.includes('check')) return { cls: 'sp-pill-info', label: '检测中' };
    if (stateName.includes('error') || stateName.includes('invalid') || stateName.includes('expire') || stateName.includes('fail')) {
        return { cls: 'sp-pill-error', label: '异常' };
    }
    return { cls: 'sp-pill-running', label: '正常' };
}

function renderStats() {
    const providers = accountsState.providers;
    const healthList = providers.map((provider) => accountsState.health[provider.name] || {});
    const configured = healthList.filter((item) => item.configured).length;
    const enabled = providers.filter((provider) => provider.enabled !== false).length;
    const error = healthList.filter((item) => healthStatus(item).label === '异常').length;
    const values = {
        total: providers.length,
        configured,
        enabled,
        error,
    };
    document.querySelectorAll('#sp-account-stats [data-account-stat]').forEach((el) => {
        const key = el.getAttribute('data-account-stat');
        if (key in values) el.textContent = String(values[key]);
    });
}

function renderAccounts() {
    const container = document.getElementById('sp-accounts-grid');
    if (!container) return;
    const providers = accountsState.providers;
    if (!providers.length) {
        container.innerHTML = '<div class="sp-empty" style="grid-column:1 / -1;"><strong>没有可用平台</strong><span>检查后端 /api/providers 是否正常。</span></div>';
        return;
    }
    container.innerHTML = providers.map((provider) => {
        const name = text(provider?.name);
        const health = accountsState.health[name] || {};
        const status = healthStatus(health);
        const configured = Boolean(health.configured);
        return `
            <article class="sp-account-card" data-provider="${escapeHtml(name)}">
                <div class="sp-account-top">
                    <span class="sp-account-logo">${escapeHtml(providerInitial(name))}</span>
                    <div style="min-width:0;flex:1 1 auto;">
                        <div class="sp-account-name">${escapeHtml(providerLabel(name))}</div>
                        <div class="sp-account-sub">${escapeHtml(text(provider?.auth_type, 'cookie'))} · ${provider?.enabled === false ? '已停用' : '已启用'}</div>
                    </div>
                    <span class="sp-pill ${status.cls}">${status.label}</span>
                </div>
                <div class="sp-account-rows">
                    <div class="sp-account-row"><span>状态说明</span><span>${escapeHtml(text(health.message, configured ? '已配置' : '未配置凭据'))}</span></div>
                    <div class="sp-account-row"><span>最近检测</span><span>${escapeHtml(text(health.last_checked_at, '—'))}</span></div>
                    <div class="sp-account-row"><span>能力</span><span>${[
                        provider?.supports_subscription ? '追更' : '',
                        provider?.supports_folder_browse ? '浏览' : '',
                        provider?.supports_offline ? '离线' : '',
                    ].filter(Boolean).join(' / ') || '只读'}</span></div>
                </div>
                <div class="sp-account-actions">
                    ${name === '115' ? '<button type="button" class="sp-btn sp-btn-sm sp-btn-primary" data-account-action="qr">扫码登录</button>' : ''}
                    <button type="button" class="sp-btn sp-btn-sm" data-account-action="check" data-provider="${escapeHtml(name)}">检测</button>
                    <button type="button" class="sp-btn sp-btn-sm sp-btn-ghost" data-account-action="settings">设置</button>
                </div>
            </article>`;
    }).join('');
}

function renderSignStatus(payload) {
    const container = document.getElementById('sp-account-sign');
    if (!container) return;
    if (!payload) {
        container.innerHTML = '<span class="sp-muted">暂无签到数据。</span>';
        return;
    }
    const stateLabel = payload.enabled === false ? '未启用' : (payload.state || '未知');
    const signed = payload.signed_today === true ? '今日已签' : (payload.signed_today === false ? '今日未签' : '未知');
    container.innerHTML = `
        <div class="sp-stats" style="margin:0;">
            <div class="sp-stat"><span class="sp-stat-label">状态</span><span class="sp-stat-value">${escapeHtml(stateLabel)}</span></div>
            <div class="sp-stat"><span class="sp-stat-label">签到</span><span class="sp-stat-value ${payload.signed_today ? 'is-running' : 'is-paused'}">${escapeHtml(signed)}</span></div>
            <div class="sp-stat"><span class="sp-stat-label">本次叶子</span><span class="sp-stat-value">${Number(payload.reward_leaf || 0)}</span></div>
            <div class="sp-stat"><span class="sp-stat-label">叶子余额</span><span class="sp-stat-value">${payload.balance_leaf == null ? '—' : Number(payload.balance_leaf)}</span></div>
        </div>
        <div class="sp-muted" style="margin-top:8px;">${escapeHtml(text(payload.message, '—'))}${payload.next_run ? ` · 下次 ${escapeHtml(payload.next_run)}` : ''}</div>`;
}

export async function spAccountsRefresh(showToast = false) {
    if (accountsState.loading) return;
    accountsState.loading = true;
    try {
        const [providers, cookies, sign] = await Promise.allSettled([
            window.MediaHubApi.getJson('/api/providers'),
            window.MediaHubApi.getJson('/settings/cookies/status'),
            window.MediaHubApi.getJson('/settings/115/sign/status'),
        ]);
        if (providers.status === 'fulfilled' && Array.isArray(providers.value)) {
            accountsState.providers = providers.value
                .slice()
                .sort((a, b) => ACCOUNT_PROVIDER_ORDER.indexOf(a.name) - ACCOUNT_PROVIDER_ORDER.indexOf(b.name));
        }
        if (cookies.status === 'fulfilled') {
            accountsState.health = cookies.value?.cookie_health || {};
        }
        renderAccounts();
        renderStats();
        renderSignStatus(sign.status === 'fulfilled' ? sign.value : null);
        if (showToast) window.showToast?.('账号状态已刷新', { tone: 'success', duration: 1600 });
    } finally {
        accountsState.loading = false;
    }
}

export async function spAccountCheck(provider) {
    const providers = provider ? [provider] : accountsState.providers.map((item) => item.name);
    const button = document.querySelector(`[data-account-action="check"][data-provider="${provider}"]`) || document.getElementById('sp-account-check-all');
    if (button) button.disabled = true;
    try {
        const data = await window.MediaHubApi.postJson('/settings/cookies/check', { providers, force: true });
        accountsState.health = data?.cookie_health || accountsState.health;
        renderAccounts();
        renderStats();
        window.showToast?.('检测完成', { tone: 'success', duration: 1800 });
    } catch (error) {
        window.showToast?.(`检测失败：${error?.message || '未知错误'}`, { tone: 'error', duration: 3000 });
    } finally {
        if (button) button.disabled = false;
    }
}

export async function spAccountCheckAll() {
    return spAccountCheck('');
}

export async function spAccountSignStatus() {
    try {
        const data = await window.MediaHubApi.getJson('/settings/115/sign/status?refresh=1');
        renderSignStatus(data);
        window.showToast?.('签到状态已刷新', { tone: 'success', duration: 1500 });
    } catch (error) {
        window.showToast?.(`读取失败：${error?.message || '未知错误'}`, { tone: 'error', duration: 2600 });
    }
}

export async function spAccountSignNow() {
    try {
        await window.MediaHubApi.postJson('/settings/115/sign/run', {});
        window.showToast?.('签到任务已提交', { tone: 'success', duration: 2000 });
        window.setTimeout(() => spAccountSignStatus(), 2500);
    } catch (error) {
        window.showToast?.(`签到失败：${error?.message || '未知错误'}`, { tone: 'error', duration: 3000 });
    }
}

function qrSetStatus(message, tone = '') {
    const el = document.getElementById('sp-qr-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = tone === 'error' ? '#fb7185' : (tone === 'success' ? '#34d399' : '');
}

function qrStop() {
    if (accountsState.qr.timer) {
        window.clearInterval(accountsState.qr.timer);
        accountsState.qr.timer = null;
    }
}

async function loadQrApps() {
    const select = document.getElementById('sp-qr-app');
    if (!select || select.dataset.loaded === '1') return;
    try {
        const data = await window.MediaHubApi.getJson('/settings/providers/115/qrcode/apps');
        const apps = Array.isArray(data?.apps) ? data.apps : [];
        select.innerHTML = apps.map((app) => `<option value="${escapeHtml(text(app?.value))}">${escapeHtml(text(app?.label, app?.value))}</option>`).join('');
        const preferred = text(data?.default) || text(apps.find((app) => app?.default)?.value);
        if (preferred) select.value = preferred;
        accountsState.qr.app = select.value;
        select.dataset.loaded = '1';
    } catch (error) {
        select.innerHTML = '<option value="wechatmini">微信小程序</option>';
    }
}

export async function spAccountOpenQr() {
    const modal = document.getElementById('sp-qr-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    await loadQrApps();
    const box = document.getElementById('sp-qr-box');
    if (box && !accountsState.qr.uid) {
        box.innerHTML = '<span style="font-size:12px;color:#64748b;">点击下方按钮获取二维码</span>';
    }
    qrSetStatus('未开始');
}

export function spAccountCloseQr() {
    const modal = document.getElementById('sp-qr-modal');
    if (modal) modal.classList.add('hidden');
    qrStop();
}

export async function spAccountStartQr() {
    if (accountsState.qr.busy) return;
    accountsState.qr.busy = true;
    qrStop();
    const button = document.getElementById('sp-qr-start-btn');
    const box = document.getElementById('sp-qr-box');
    if (button) button.disabled = true;
    qrSetStatus('正在获取二维码…');
    try {
        const app = text(document.getElementById('sp-qr-app')?.value, 'wechatmini');
        accountsState.qr.app = app;
        const data = await window.MediaHubApi.getJson('/settings/providers/115/qrcode/token');
        accountsState.qr.uid = text(data?.uid);
        accountsState.qr.time = text(data?.time);
        accountsState.qr.sign = text(data?.sign);
        if (!accountsState.qr.uid) throw new Error('未获取到二维码 uid');
        const imageUrl = text(data?.image_url, `/settings/providers/115/qrcode/image?uid=${encodeURIComponent(accountsState.qr.uid)}`);
        if (box) {
            box.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="115 登录二维码" style="width:100%;height:100%;object-fit:contain;">`;
        }
        qrSetStatus('请用 115 App 扫码');
        accountsState.qr.timer = window.setInterval(pollQrStatus, 2200);
    } catch (error) {
        qrSetStatus(`获取失败：${error?.message || '未知错误'}`, 'error');
    } finally {
        accountsState.qr.busy = false;
        if (button) button.disabled = false;
    }
}

async function pollQrStatus() {
    const { uid, time, sign, app } = accountsState.qr;
    if (!uid || !time || !sign) {
        qrStop();
        return;
    }
    try {
        const query = new URLSearchParams({ uid, time, sign });
        const data = await window.MediaHubApi.getJson(`/settings/providers/115/qrcode/status?${query.toString()}`);
        const status = Number(data?.status);
        if (status === 0) {
            qrSetStatus('等待扫码…');
            return;
        }
        if (status === 1) {
            qrSetStatus('已扫码，请在手机上确认登录');
            return;
        }
        if (status === 2) {
            qrStop();
            qrSetStatus('登录成功，正在保存 Cookie…', 'success');
            await window.MediaHubApi.postJson('/settings/providers/115/qrcode/result', { uid, app });
            qrSetStatus('已保存，可在账号卡片查看状态', 'success');
            window.showToast?.('115 登录成功', { tone: 'success', duration: 2400 });
            await spAccountsRefresh(false);
            window.setTimeout(() => spAccountCloseQr(), 1200);
            return;
        }
        if (status === -1) {
            qrStop();
            qrSetStatus('二维码已过期，请重新获取', 'error');
            return;
        }
        if (status === -2) {
            qrStop();
            qrSetStatus('扫码已取消', 'error');
            return;
        }
        qrSetStatus(`未知状态：${status}`);
    } catch (error) {
        // 单次轮询失败不打断，等待下一轮。
    }
}

function bindAccountActions() {
    const grid = document.getElementById('sp-accounts-grid');
    if (!grid || grid.dataset.spBound === '1') return;
    grid.dataset.spBound = '1';
    grid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-account-action]');
        if (!button) return;
        const action = button.getAttribute('data-account-action');
        if (action === 'qr') return spAccountOpenQr();
        if (action === 'check') return spAccountCheck(button.getAttribute('data-provider') || '');
        if (action === 'settings') return switchTab('settings');
    });
}

export async function ensureTabData() {
    bindAccountActions();
    await spAccountsRefresh(false);
}

window.spAccountsRefresh = () => spAccountsRefresh(true);
window.spAccountCheckAll = spAccountCheckAll;
window.spAccountSignStatus = spAccountSignStatus;
window.spAccountSignNow = spAccountSignNow;
window.spAccountOpenQr = spAccountOpenQr;
window.spAccountCloseQr = spAccountCloseQr;
window.spAccountStartQr = spAccountStartQr;
