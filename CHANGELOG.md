# 更新日志

## 2024-07-21 - 版本优化

### 功能改进

1. **网站名称超链接**
   - 在所有页面顶部的网站名称/图标上添加了超链接，点击可返回首页 `/`
   - 实现位置：`brandLogoHtml` 函数

2. **语言和主题切换按钮文字固定**
   - 语言切换按钮文字固定为英文（中文界面显示 "English"，英文界面显示 "中文"）
   - 主题切换按钮文字固定为英文（Auto/Light/Dark）
   - 不再跟随界面语言切换

3. **环境变量支持增强**
   - 新增 `SITE_NAME` 环境变量支持，用于自定义站点名称
   - 默认值为 "OmniWall"
   - 提供了默认图标 SVG data URI，当 `SITE_FAVICON` 未配置时自动使用

4. **Cloudflare Turnstile 人机验证范围扩大**
   - 内容检测接口 `/api/check-content` 的 Turnstile 保护默认改为启用（原来是 `false`，现在是 `true`）
   - 配置项：`DEFAULT_TURNSTILE_CONFIG.protectContentCheck = true`
   - 可在管理后台按需关闭

5. **文档更新**
   - 更新了 README.md，说明语言切换和主题切换按钮文字固定为英文
   - 更新了部署教程，说明 Turnstile 默认保护内容检测接口
   - 更新了 SITE_NAME 和 SITE_FAVICON 的说明

### 技术细节

#### 代码修改位置

**omniwall.txt (第 366-377 行)**
```javascript
function publicNav(request, env, active = "") {
  const lang = getLang(request);
  const switchHref = langSwitchLink(request, lang);
  const nav = [
    ["/featured", lang === "en" ? "Featured" : "今日推荐", "featured"],
    ["/docs", lang === "en" ? "Docs" : "文档", "docs"],
    ["/url-builder", lang === "en" ? "URL Builder" : "链接生成器", "builder"],
    ["/feedback", lang === "en" ? "Feedback" : "💬 反馈", "feedback"],
  ].map(([href, label, key]) => `<a class="${active === key ? "active" : ""}" href="${escapeAttr(withLang(href, lang))}">${escapeHtml(label)}</a>`).join("");
  const themeLabels = { auto: "Auto", light: "Light", dark: "Dark" };
  const langSwitchText = lang === "en" ? "中文" : "English";
  return `<nav class="nav">${brandLogoHtml(siteFaviconHref(env), siteName(env))}<div class="nav-actions">${nav}<a class="ui-switch" href="${escapeAttr(switchHref)}" title="Language">🌐 ${escapeHtml(langSwitchText)}</a><button type="button" class="ui-switch theme-toggle" onclick="toggleTheme();return false" title="Theme"><span class="theme-icon">🌓</span><span class="theme-label" data-auto="${escapeAttr(themeLabels.auto)}" data-light="${escapeAttr(themeLabels.light)}" data-dark="${escapeAttr(themeLabels.dark)}">${escapeHtml(themeLabels.auto)}</span></button></div></nav>`;
}
```

**omniwall.txt (第 18 行)**
```javascript
const DEFAULT_TURNSTILE_CONFIG = { enabled: true, protectFeedback: true, protectAdminLogin: true, protectContentCheck: true };
```

### GitHub 仓库

- 仓库地址: https://github.com/aichenshidelibing/omniwall
- 分支: main
- 提交信息: Initial commit with enhanced features

### 环境变量配置示例

```bash
# 必需变量
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的32位以上强密码
UNSPLASH_ACCESS_KEY=你的Unsplash密钥

# D1 绑定（必需）
DB=omniwall-db

# 可选 - 品牌定制
SITE_NAME=OmniWall
SITE_FAVICON=https://example.com/favicon.png

# 可选 - Turnstile 人机验证
TURNSTILE_SITE_KEY=0x4AAAA...
TURNSTILE_SECRET_KEY=0x4AAAA...
```

### 部署说明

1. 将 `omniwall.txt` 内容复制到 Cloudflare Worker
2. 绑定 D1 数据库（变量名必须为 `DB`）
3. 配置必需的环境变量
4. 首次访问会自动初始化数据库表
5. 访问 `https://你的域名/{ADMIN_USERNAME}/login` 登录后台

### 注意事项

- 所有页面的语言切换和主题切换按钮文字现在固定为英文显示
- Turnstile 人机验证默认保护内容检测接口，可在后台关闭
- 网站名称和图标现在支持通过环境变量自定义
- 页面顶部品牌区域点击可返回首页
