# SyncPan 对齐改造说明（115-media-hub fork）

> 基线分析见 `docs/syncpan-baseline.md`。
> 本文说明改了什么、怎么实现的、怎么验证，以及哪些能力没有对齐。
> 本次改动**只提交到** `github.com/tq4meishijia/115-media-hub`。

---

## 1. 改造结论

把原来「七个平铺标签 + 玻璃拟态大卡片」的单页应用，改造成 SyncPan 风格的桌面端信息架构：

- **四区外壳**：顶栏（页面标题 / 账号状态 / 任务中心 / 主题 / 更多）+ 左侧分组导航 + 内容区 + 底部状态栏。
- **分组导航**：工作台（总览）· 核心功能（自动追更 / 追剧日历 / 文件浏览 / 资源搜索 / 发现页 / 目录监控）· 批量工具（批量工具 / 目录树生成）· 底部（账号管理 / 设置）。
- **新增 4 个页面**：总览、追剧日历、批量工具、账号管理，全部接真实后端数据，不做假数据占位。
- **体验统一**：导航密度、卡片圆角、边框、状态色、按钮尺寸、空状态、骨架屏统一到一套 `--sp-*` 设计令牌；浅色主题同步适配。

---

## 2. 涉及模块与改动范围

### 2.1 新增文件

| 文件 | 作用 |
|---|---|
| `templates/partials/pages/overview.html` | 总览页骨架：统计条、任务卡、最近动态、账号状态、今日排期、快捷操作 |
| `templates/partials/pages/calendar.html` | 追剧日历：周切换、类型/状态筛选、七列周视图、未排期列表 |
| `templates/partials/pages/tools.html` | 批量工具：10 个工具卡 + 广告清理 / 链接库两个内嵌面板 |
| `templates/partials/pages/accounts.html` | 账号管理：平台卡、Cookie 健康、115 签到、扫码登录弹窗 |
| `static/css/syncpan.css` | 新外壳与组件样式层（`--sp-*` 令牌、深/浅色、响应式） |
| `static/js/modules/app/shell-ui.js` | 顶栏标题同步、状态栏轮询、115 登录态上下文、导航角标 |
| `static/js/modules/tabs/overview.js` | 总览数据聚合与渲染（订阅 / 转存 / 跨盘 / Cookie） |
| `static/js/modules/tabs/calendar.js` | 周历计算、排期渲染、TMDB 更新日叠加 |
| `static/js/modules/tabs/tools.js` | 工具路由、广告清理扫描/删除、链接库筛选/复制/建任务 |
| `static/js/modules/tabs/accounts.js` | 平台卡渲染、Cookie 检测、签到、115 扫码全流程 |
| `tests/test_syncpan_alignment.py` | 外壳 / 页面 / 模块注册 / 后端接口的静态契约测试 |
| `docs/syncpan-baseline.md` | SyncPan 功能、流程、布局、证据与局限 |
| `docs/syncpan-alignment.md` | 本文 |

### 2.2 修改文件

| 文件 | 改动 |
|---|---|
| `templates/index.html` | 重写外壳：分组侧栏、顶栏上下文、底部状态栏、新页面 include、移动端 7 项导航、加载 `syncpan.css` 与 `shell-ui.js` |
| `templates/partials/pages/resource.html` | 默认隐藏（首屏改为总览）；「参数配置」文案改「设置」 |
| `static/js/index.js` | 默认标签改 `overview`；`SHELL_TAB_META` 扩到 12 项并更名；`switchTab` 兜底改 `overview`；顶栏同步挂 `spShellSetTab` |
| `static/js/modules/tabs/runtime.js` | 注册 `overview / calendar / tools / accounts` 四个动态模块路径 |
| `static/js/modules/app/boot.js` | 首屏补 `ensureTabData(currentTab)`，保证直接进入总览也有数据 |
| `app/services/scraper.py` | 新增 `list_scraper_entries_by_path()`：把人类可读目录路径解析成 115 cid 再列条目 |
| `app/routes/scraper.py` | 新增 `GET /scraper/{provider}/entries-by-path` |
| `docs/superpowers/modules.md` | 登记 4 个新页面模板与新导航名称 |
| `tests/test_cross_copy_frontend.py` | 导航断言由「文件管理」改为「文件浏览」 |

### 2.3 明确未改动

- 订阅调度、转存、跨盘复制、监控、STRM、Seerr、115 扫码/签到等后端业务逻辑。
- 现有弹窗与既有页面的内部交互（只做外壳与视觉层面的覆盖）。
- 没有改 `origin`（xianer235/115-media-hub）的任何内容，也没有向该仓库推送。

---

## 3. 实现思路

### 3.1 外壳：用「覆盖层」而不是重写

原 `index.css` 有 17k 行且被大量页面依赖，直接改写风险高。新增 `syncpan.css` 作为最后加载的覆盖层：

- 用 `.app-shell` / `.shell-rail` / `.shell-toolbar` / `.shell-workspace` 覆盖布局为「整屏 + 固定侧栏 + 扁平顶栏」。
- 用 `.shell-nav-btn` / `.sp-nav-group` 覆盖导航为 36px 行高、8px 圆角、蓝色选中底。
- 用 `.group-card` 统一旧页面卡片为 16px 圆角、无重阴影。
- 保留原 DOM 结构与 id（`switchTab`、`syncMainTabRowState`、任务中心、签到、主题切换全部复用）。

### 3.2 标签系统：只加注册，不改路由

`switchTab` 依赖 `SHELL_TAB_META` + `page-{tab}` + `TAB_MODULE_IMPORT_PATHS` 三处。新增页面只需：

1. `index.html` include 页面模板；
2. `runtime.js` 注册模块路径；
3. `SHELL_TAB_META` 加标题；
4. 模块导出 `ensureTabData()`。

新模块全部是纯 ES module，内部只用 `window.MediaHubApi` 与既有全局操作函数（`openNewSubscriptionTask`、`editSubscriptionTask`、`startSubscriptionTask`、`openCrossCopyModal`），不复制业务逻辑。

### 3.3 总览：四次请求并行聚合

`/subscription/status`、`/resource/jobs/state`、`/cross_copy/jobs`、`/settings/cookies/status` 并行拉取，`Promise.allSettled` 容忍单点失败；30 秒轮询仅在页面可见时执行。任务卡按「启用优先」排序，最多 6 张。

### 3.4 追剧日历：用任务排期而不是外部播出表

数据来自订阅任务的 `schedule_weekdays` / `schedule_start_time`，同时把 `tmdb_next_air_date` 落在本周的任务标为「更新」。因此不依赖 TMDB 是否配置，也不会伪造豆瓣排期。

### 3.5 批量工具：能接的接，接不了的说清楚

- 已接：批量转存（跳资源搜索）、批量重命名（跳文件浏览）、目录树生成、跨盘互传、目录监控、广告清理、链接库。
- 广告清理新增「路径 → cid」后端解析，扫描后用 `entries` 快照调用既有 `/scraper/{provider}/delete`，删除进回收站。
- 链接库读取 `/resource/state` 的 `items`，支持过滤、复制、一键建追更。
- 批量分享 / 链接转换 / 广告插入需要额外的分享与上传接口，卡片明确标注「未接入」且禁用，不做假按钮。

### 3.6 账号管理：复用既有接口

`/api/providers` + `/settings/cookies/status` 渲染平台卡；`/settings/cookies/check` 单卡/全部检测；`/settings/115/sign/*` 签到；扫码走 `token → image → status 轮询 → result` 四步，成功后刷新卡片。

---

## 4. 验证方式

### 4.1 已执行的自动化检查

```bash
# 1) 应用可导入（路由/服务无语法错误）
.venv/Scripts/python.exe -c "import app.main; print('ok')"

# 2) 本次改造契约测试（9 项）
.venv/Scripts/python.exe tests/test_syncpan_alignment.py

# 3) 模块索引完整性（新增页面必须登记）
.venv/Scripts/python.exe tests/test_modules_doc.py

# 4) 受导航改名影响的前端测试
.venv/Scripts/python.exe tests/test_cross_copy_frontend.py
```

结果：全部通过（`test_modules_doc` 在无 AGENTS.md 的环境跳过 1 项，属预期）。

### 4.2 浏览器冒烟（Playwright + 本机 Edge，1440×900 与 390×844）

- 登录 → 依次进入 10 个标签，顶栏标题与页面内容一一对应，无白屏。
- 日历「上一周 / 本周 / 下一周」切换正确（例：`2026 年 11/16 - 11/22`）。
- 批量工具：广告清理面板可打开；未配置 Cookie 时展示「扫描失败：115 Cookie 未配置」，不抛异常。
- 账号管理：扫码弹窗可打开/关闭，客户端下拉正常加载。
- 主题切换：浅色下正文、卡片、侧栏、状态栏均可读。
- 控制台仅剩 1 条预期 400（未配置网盘凭据的健康检查），无 JS 运行时错误。

### 4.3 手工验收清单

| 项 | 期望 |
|---|---|
| 首屏 | 直接进入「总览」，统计条与空状态正常 |
| 侧栏 | 三组标题 + 底部账号/设置；当前项蓝色高亮 |
| 顶栏 | 标题随标签变化；115 登录态、任务中心、主题、更多可用 |
| 状态栏 | 右下角「空闲 / N 个任务运行中」+ 版本号；不遮挡内容 |
| 既有页面 | 自动追更、文件浏览、资源搜索、发现页、目录监控、设置功能不回归 |
| 移动端 | 侧栏隐藏，底部 7 项导航完整可见，无横向溢出 |

---

## 5. 差异与未对齐项

| SyncPan | 本 fork 现状 | 原因 / 影响 |
|---|---|---|
| 10 家网盘 | 115 为主，另有夸克 / 阿里 / 123 / 天翼 provider（默认仅 115、夸克启用） | 不新增平台适配层；平台能力差异大，强行接入会引入不稳定 |
| 分享链接失效巡检（链接监控） | 只有目录监控 | 需要独立的分享有效性探测与订阅表，未实现；导航已更名「目录监控」避免误导 |
| 追剧日历（豆瓣/外部排期） | 按任务排期 + TMDB 更新日 | 没有接入豆瓣排期数据源，日历是「自己的追更排期」而非全网播出表 |
| 批量分享 / 链接转换 / 广告插入 | 未接入（卡片禁用并标注） | 依赖 115 分享创建与上传接口，现有 provider 未封装 |
| 我的分享（CSV 导出、批量取消） | 未实现，替代为「链接库」（本地已入库链接） | 语义不同，已明确标注 |
| 跨盘互传「秒传探测 + 断点续传 + 并发 1~16」 | 复用既有跨盘任务，能力以现有实现为准 | 未改传输引擎 |
| 10 通道推送 / QQ 微信机器人 / 内网穿透 / AI 智能体 | 复用既有通知与 HTTP 服务，未新增渠道 | 属于增量集成，不在本次体验对齐范围 |
| 会员 / 卡密 / 定价 | 不实现 | 开源项目定位不同 |
| 像素级界面复刻 | 对齐信息架构、密度、组件语言 | 营销 mockup 非真实截图，像素级复刻既不可行也无必要 |

---

## 6. 构建与运行

### 6.1 本地（Windows，仓库已带 `.venv`）

```bash
# 安装依赖（首次）
.venv/Scripts/python.exe -m pip install -r requirements.txt

# 启动
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# 打开 http://127.0.0.1:8000
```

或使用仓库脚本：`start-local.cmd`；桌面壳：`.venv/Scripts/python.exe desktop.py`。

首次启动若没有 `data/config/settings.json`，默认账号 `admin` / `admin123`，登录后请立即在「设置」修改。

### 6.2 Docker

```bash
docker compose up -d --build
# 默认映射见 compose.yml
```

### 6.3 前端资源

无构建步骤（原生 ES module + 预生成 Tailwind）。改了 Tailwind 源样式才需要：

```bash
npm install
npm run build:css
```

新增的 `syncpan.css` 为手写 CSS，直接生效。

---

## 7. 回滚

本次改动均为新增文件或可定位的局部修改，回滚方式：

```bash
git revert <commit>
# 或仅回滚外壳
git checkout <commit>~1 -- templates/index.html static/js/index.js static/js/modules/tabs/runtime.js
```

后端仅新增一个只读接口，回滚不影响既有数据与任务。
