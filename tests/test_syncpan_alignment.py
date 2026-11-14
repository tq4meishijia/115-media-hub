"""SyncPan 对齐改造的静态契约测试。

目的：外壳重构涉及 index.html + 路由注册 + 模块加载表 + 新页面模板多处联动，
任何一处漏改都会让新导航点击后白屏。这里用静态断言把「页面容器 / 路由表 /
模块路径 / 后端接口」四件事锁住，避免只改一半。
"""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "templates" / "index.html"
RUNTIME_JS = ROOT / "static" / "js" / "modules" / "tabs" / "runtime.js"
APP_JS = ROOT / "static" / "js" / "index.js"
PAGES_DIR = ROOT / "templates" / "partials" / "pages"
TABS_DIR = ROOT / "static" / "js" / "modules" / "tabs"

NEW_TABS = ("overview", "calendar", "tools", "accounts")

NEW_PAGE_IDS = {
    "overview": ("page-overview", "sp-overview-stats", "sp-overview-running"),
    "calendar": ("page-calendar", "sp-cal-grid", "sp-cal-summary"),
    "tools": ("page-tools", "sp-tool-grid", "sp-tool-panel"),
    "accounts": ("page-accounts", "sp-accounts-grid", "sp-qr-modal"),
}


class SyncPanShellContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index_html = INDEX_HTML.read_text(encoding="utf-8")
        cls.runtime_js = RUNTIME_JS.read_text(encoding="utf-8")
        cls.app_js = APP_JS.read_text(encoding="utf-8")

    def test_new_pages_are_included_in_shell(self):
        for tab in NEW_TABS:
            self.assertIn(
                f'partials/pages/{tab}.html',
                self.index_html,
                f"index.html 没有 include {tab} 页面",
            )
            partial = (PAGES_DIR / f"{tab}.html").read_text(encoding="utf-8")
            self.assertIn(
                f'id="page-{tab}"',
                partial,
                f"{tab}.html 缺少 page-{tab} 容器",
            )

    def test_new_pages_expose_required_hooks(self):
        for tab, ids in NEW_PAGE_IDS.items():
            content = (PAGES_DIR / f"{tab}.html").read_text(encoding="utf-8")
            for element_id in ids:
                self.assertIn(f'id="{element_id}"', content, f"{tab}.html 缺少 #{element_id}")

    def test_nav_uses_grouped_sidebar(self):
        for group in ("工作台", "核心功能", "批量工具"):
            self.assertIn(group, self.index_html, f"侧栏缺少分组「{group}」")
        for tab in NEW_TABS:
            self.assertIn(
                f'data-tab-target="{tab}"',
                self.index_html,
                f"侧栏/移动导航缺少 {tab} 入口",
            )

    def test_tab_module_paths_registered(self):
        for tab in NEW_TABS:
            self.assertIn(
                f"{tab}: withTabModuleImportQuery('/static/js/modules/tabs/{tab}.js')",
                self.runtime_js,
                f"runtime.js 未注册 {tab} 模块",
            )

    def test_tab_meta_covers_new_tabs(self):
        for tab in NEW_TABS:
            self.assertIn(f"{tab}: {{ title:", self.app_js, f"SHELL_TAB_META 缺少 {tab}")

    def test_new_tab_modules_export_ensure_tab_data(self):
        for tab in NEW_TABS:
            content = (TABS_DIR / f"{tab}.js").read_text(encoding="utf-8")
            self.assertIn("export async function ensureTabData", content, f"{tab}.js 未导出 ensureTabData")

    def test_default_tab_is_overview(self):
        self.assertIn("let currentTab = 'overview';", self.app_js)


class SyncPanBackendContractTest(unittest.TestCase):
    def test_entries_by_path_route_exists(self):
        route_text = (ROOT / "app" / "routes" / "scraper.py").read_text(encoding="utf-8")
        self.assertIn('/scraper/{provider}/entries-by-path', route_text)
        self.assertIn("list_scraper_entries_by_path", route_text)

    def test_entries_by_path_service_exists(self):
        service_text = (ROOT / "app" / "services" / "scraper.py").read_text(encoding="utf-8")
        self.assertIn("def list_scraper_entries_by_path(", service_text)
        self.assertIn("resolve_115_folder_id_by_path", service_text)


if __name__ == "__main__":
    unittest.main()
