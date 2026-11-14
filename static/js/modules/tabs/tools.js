let toolsState = {
    panel: '',
    adProvider: '115',
    adCid: '0',
    adEntries: [],
    adMatched: [],
    adSelected: new Set(),
    adBusy: false,
    libItems: [],
    libBusy: false,
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

function formatSize(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    let size = value;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }
    return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

async function copyToClipboard(value) {
    const content = String(value || '');
    if (!content) return false;
    try {
        await navigator.clipboard.writeText(content);
        return true;
    } catch (error) {
        try {
            const input = document.createElement('textarea');
            input.value = content;
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            const ok = document.execCommand('copy');
            input.remove();
            return ok;
        } catch (innerError) {
            return false;
        }
    }
}

const PANEL_META = {
    'ad-clean': {
        title: '广告清理',
        desc: '按关键词或正则扫描指定目录，勾选后删除；删除会走网盘回收站，可恢复。',
    },
    'link-library': {
        title: '链接库',
        desc: '已入库的分享链接 / 磁力，支持过滤、复制与一键建追更任务。',
    },
};

export function spToolOpen(id) {
    const action = String(id || '').trim();
    if (action === 'batch-transfer') {
        switchTab('resource');
        window.showToast?.('在资源搜索里粘贴多条链接即可批量识别', { tone: 'info', duration: 2600 });
        return;
    }
    if (action === 'batch-rename') {
        switchTab('scraper');
        window.showToast?.('在文件浏览里多选文件后使用批量重命名', { tone: 'info', duration: 2600 });
        return;
    }
    if (action === 'tree') {
        switchTab('task');
        return;
    }
    if (action === 'cross-copy') {
        if (typeof window.openCrossCopyModal === 'function') window.openCrossCopyModal();
        else window.showToast?.('跨盘互传入口未就绪', { tone: 'warn' });
        return;
    }
    if (action === 'monitor') {
        switchTab('monitor');
        return;
    }
    if (action === 'ad-clean' || action === 'link-library') {
        spToolShowPanel(action);
    }
}

export function spToolShowPanel(id) {
    const panel = document.getElementById('sp-tool-panel');
    const ad = document.getElementById('sp-tool-ad-clean');
    const lib = document.getElementById('sp-tool-link-library');
    const meta = PANEL_META[id];
    if (!panel || !ad || !lib || !meta) return;
    toolsState.panel = id;
    panel.classList.remove('hidden');
    ad.classList.toggle('hidden', id !== 'ad-clean');
    lib.classList.toggle('hidden', id !== 'link-library');
    const title = document.getElementById('sp-tool-panel-title');
    const desc = document.getElementById('sp-tool-panel-desc');
    if (title) title.textContent = meta.title;
    if (desc) desc.textContent = meta.desc;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (id === 'link-library' && !toolsState.libItems.length) {
        spLinkLibraryLoad(false);
    }
}

export function spToolClosePanel() {
    const panel = document.getElementById('sp-tool-panel');
    if (panel) panel.classList.add('hidden');
    toolsState.panel = '';
}

export function spToolsRefresh() {
    if (toolsState.panel === 'ad-clean') return spAdCleanScan();
    if (toolsState.panel === 'link-library') return spLinkLibraryLoad(true);
    window.showToast?.('先选择一个工具面板', { tone: 'info', duration: 1600 });
}

function buildKeywordMatcher() {
    const raw = text(document.getElementById('sp-ad-keywords')?.value, '');
    const mode = text(document.getElementById('sp-ad-mode')?.value, 'contains');
    const keywords = raw.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean);
    if (!keywords.length) return null;
    if (mode === 'regex') {
        try {
            const regex = new RegExp(keywords.join('|'), 'i');
            return (name) => regex.test(name);
        } catch (error) {
            throw new Error('正则表达式不合法，请检查');
        }
    }
    const lower = keywords.map((item) => item.toLowerCase());
    return (name) => {
        const target = String(name || '').toLowerCase();
        return lower.some((keyword) => target.includes(keyword));
    };
}

export async function spAdCleanScan() {
    if (toolsState.adBusy) return;
    const statusEl = document.getElementById('sp-ad-status');
    const resultsEl = document.getElementById('sp-ad-results');
    const actionsEl = document.getElementById('sp-ad-actions');
    const provider = text(document.getElementById('sp-ad-provider')?.value, '115');
    const path = text(document.getElementById('sp-ad-path')?.value, '');
    let matcher = null;
    try {
        matcher = buildKeywordMatcher();
    } catch (error) {
        window.showToast?.(error.message, { tone: 'error', duration: 2600 });
        return;
    }
    if (!matcher) {
        window.showToast?.('请先填写至少一个关键词', { tone: 'warn', duration: 2200 });
        return;
    }
    toolsState.adBusy = true;
    toolsState.adProvider = provider;
    toolsState.adSelected.clear();
    if (statusEl) statusEl.textContent = '正在扫描目录…';
    if (resultsEl) resultsEl.innerHTML = '<div class="sp-skeleton" style="height:120px;"></div>';
    if (actionsEl) actionsEl.classList.add('hidden');
    try {
        const query = new URLSearchParams({ path, limit: '1000' });
        const data = await window.MediaHubApi.getJson(`/scraper/${encodeURIComponent(provider)}/entries-by-path?${query.toString()}`);
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        toolsState.adCid = text(data?.cid, '0');
        toolsState.adEntries = entries;
        toolsState.adMatched = entries.filter((entry) => matcher(text(entry?.name)));
        renderAdResults();
        if (statusEl) {
            statusEl.textContent = `扫描完成：共 ${entries.length} 项，匹配 ${toolsState.adMatched.length} 项。目录 cid=${toolsState.adCid}`;
        }
    } catch (error) {
        if (statusEl) statusEl.textContent = `扫描失败：${error?.message || '未知错误'}`;
        if (resultsEl) {
            resultsEl.innerHTML = `<div class="sp-empty"><strong>无法扫描</strong><span>${escapeHtml(error?.message || '未知错误')}</span></div>`;
        }
    } finally {
        toolsState.adBusy = false;
    }
}

function renderAdResults() {
    const resultsEl = document.getElementById('sp-ad-results');
    const actionsEl = document.getElementById('sp-ad-actions');
    if (!resultsEl) return;
    if (!toolsState.adMatched.length) {
        resultsEl.innerHTML = '<div class="sp-empty"><strong>没有匹配项</strong><span>换个关键词，或确认目录路径是否正确。</span></div>';
        actionsEl?.classList.add('hidden');
        return;
    }
    resultsEl.innerHTML = `
        <div class="sp-table-wrap">
            <table class="sp-table">
                <thead>
                    <tr>
                        <th style="width:34px;"><input type="checkbox" onchange="spAdCleanSelectAll(this.checked)"></th>
                        <th>名称</th>
                        <th style="width:70px;">类型</th>
                        <th style="width:90px;">大小</th>
                    </tr>
                </thead>
                <tbody>
                    ${toolsState.adMatched.map((entry) => {
                        const id = text(entry?.id || entry?.cid);
                        const checked = toolsState.adSelected.has(id) ? 'checked' : '';
                        return `
                            <tr>
                                <td><input type="checkbox" data-ad-id="${escapeHtml(id)}" ${checked}></td>
                                <td class="is-name" title="${escapeHtml(text(entry?.name))}">${escapeHtml(text(entry?.name))}</td>
                                <td>${entry?.is_dir ? '文件夹' : '文件'}</td>
                                <td>${entry?.is_dir ? '—' : formatSize(entry?.size)}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    actionsEl?.classList.remove('hidden');
}

export function spAdCleanToggle(id, checked) {
    const key = text(id);
    if (!key) return;
    if (checked) toolsState.adSelected.add(key);
    else toolsState.adSelected.delete(key);
}

export function spAdCleanSelectAll(checked) {
    toolsState.adSelected.clear();
    if (checked) {
        toolsState.adMatched.forEach((entry) => {
            const id = text(entry?.id || entry?.cid);
            if (id) toolsState.adSelected.add(id);
        });
    }
    document.querySelectorAll('#sp-ad-results [data-ad-id]').forEach((input) => {
        input.checked = Boolean(checked);
    });
}

export async function spAdCleanDelete() {
    const ids = Array.from(toolsState.adSelected);
    if (!ids.length) {
        window.showToast?.('先勾选要删除的条目', { tone: 'warn', duration: 2000 });
        return;
    }
    const names = toolsState.adMatched
        .filter((entry) => ids.includes(text(entry?.id || entry?.cid)))
        .map((entry) => text(entry?.name))
        .slice(0, 5);
    const message = `确定删除 ${ids.length} 项吗？\n${names.join('\n')}${ids.length > 5 ? '\n…' : ''}`;
    const confirmed = typeof window.showAppConfirm === 'function'
        ? await window.showAppConfirm(message)
        : window.confirm(message);
    if (!confirmed) return;
    const button = document.querySelector('#sp-ad-actions .sp-btn-danger');
    if (button) button.disabled = true;
    try {
        const selectedEntries = toolsState.adMatched.filter((entry) => ids.includes(text(entry?.id || entry?.cid)));
        await window.MediaHubApi.postJson(`/scraper/${encodeURIComponent(toolsState.adProvider)}/delete`, {
            entry_ids: ids,
            parent_id: toolsState.adCid,
            entries: selectedEntries,
        });
        window.showToast?.(`已提交删除 ${ids.length} 项`, { tone: 'success', duration: 2200 });
        toolsState.adSelected.clear();
        await spAdCleanScan();
    } catch (error) {
        window.showToast?.(`删除失败：${error?.message || '未知错误'}`, { tone: 'error', duration: 3200 });
    } finally {
        if (button) button.disabled = false;
    }
}

export async function spLinkLibraryLoad(showToast = false) {
    if (toolsState.libBusy) return;
    toolsState.libBusy = true;
    const statusEl = document.getElementById('sp-lib-status');
    const resultsEl = document.getElementById('sp-lib-results');
    if (statusEl) statusEl.textContent = '正在加载…';
    if (resultsEl) resultsEl.innerHTML = '<div class="sp-skeleton" style="height:120px;"></div>';
    try {
        const data = await window.MediaHubApi.getJson('/resource/state');
        toolsState.libItems = Array.isArray(data?.items) ? data.items : [];
        renderLinkLibrary();
        if (statusEl) statusEl.textContent = `共 ${toolsState.libItems.length} 条`;
        if (showToast) window.showToast?.('链接库已刷新', { tone: 'success', duration: 1600 });
    } catch (error) {
        if (statusEl) statusEl.textContent = '加载失败';
        if (resultsEl) {
            resultsEl.innerHTML = `<div class="sp-empty"><strong>无法加载链接库</strong><span>${escapeHtml(error?.message || '未知错误')}</span></div>`;
        }
    } finally {
        toolsState.libBusy = false;
    }
}

export function spLinkLibraryRender() {
    renderLinkLibrary();
}

function renderLinkLibrary() {
    const resultsEl = document.getElementById('sp-lib-results');
    if (!resultsEl) return;
    const filter = text(document.getElementById('sp-lib-filter')?.value, '').toLowerCase();
    const items = toolsState.libItems.filter((item) => {
        if (!filter) return true;
        return `${text(item?.title)} ${text(item?.link_url)}`.toLowerCase().includes(filter);
    });
    if (!items.length) {
        resultsEl.innerHTML = '<div class="sp-empty"><strong>没有匹配的链接</strong><span>去资源搜索里入库一些资源，这里会自动出现。</span></div>';
        return;
    }
    resultsEl.innerHTML = `
        <div class="sp-table-wrap">
            <table class="sp-table">
                <thead>
                    <tr>
                        <th>标题</th>
                        <th style="width:90px;">类型</th>
                        <th style="width:110px;">入库时间</th>
                        <th style="width:150px;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.slice(0, 200).map((item) => {
                        const id = Number(item?.id || 0);
                        const link = text(item?.link_url);
                        const title = text(item?.title, '未命名');
                        return `
                            <tr>
                                <td class="is-name" title="${escapeHtml(title)}">${escapeHtml(title)}</td>
                                <td><span class="sp-pill sp-pill-info">${escapeHtml(text(item?.link_type, 'link'))}</span></td>
                                <td class="sp-muted">${escapeHtml(text(item?.created_at, '—'))}</td>
                                <td>
                                    <button type="button" class="sp-btn sp-btn-sm" data-lib-copy="${escapeHtml(link)}">复制</button>
                                    <button type="button" class="sp-btn sp-btn-sm sp-btn-ghost" data-lib-sub="${id}">追更</button>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function bindLibraryActions() {
    const resultsEl = document.getElementById('sp-lib-results');
    if (!resultsEl || resultsEl.dataset.spBound === '1') return;
    resultsEl.dataset.spBound = '1';
    resultsEl.addEventListener('click', async (event) => {
        const copyBtn = event.target.closest('[data-lib-copy]');
        if (copyBtn) {
            const ok = await copyToClipboard(copyBtn.getAttribute('data-lib-copy'));
            window.showToast?.(ok ? '已复制链接' : '复制失败', { tone: ok ? 'success' : 'error', duration: 1600 });
            return;
        }
        const subBtn = event.target.closest('[data-lib-sub]');
        if (subBtn) {
            const id = Number(subBtn.getAttribute('data-lib-sub') || 0);
            const item = toolsState.libItems.find((entry) => Number(entry?.id) === id);
            if (item && typeof window.openNewSubscriptionTask === 'function') {
                window.openNewSubscriptionTask({
                    name: item.title,
                    title: item.title,
                    share_link_url: item.link_url,
                });
            }
        }
    });
}

function bindAdActions() {
    const resultsEl = document.getElementById('sp-ad-results');
    if (!resultsEl || resultsEl.dataset.spBound === '1') return;
    resultsEl.dataset.spBound = '1';
    resultsEl.addEventListener('change', (event) => {
        const input = event.target.closest('[data-ad-id]');
        if (!input) return;
        spAdCleanToggle(input.getAttribute('data-ad-id'), input.checked);
    });
}

export async function ensureTabData() {
    bindAdActions();
    bindLibraryActions();
}

window.spToolOpen = spToolOpen;
window.spToolClosePanel = spToolClosePanel;
window.spToolsRefresh = spToolsRefresh;
window.spAdCleanScan = spAdCleanScan;
window.spAdCleanDelete = spAdCleanDelete;
window.spAdCleanSelectAll = spAdCleanSelectAll;
window.spAdCleanToggle = spAdCleanToggle;
window.spLinkLibraryLoad = spLinkLibraryLoad;
window.spLinkLibraryRender = spLinkLibraryRender;
