# 更新日志

## 2026-07-22 - 功能扩展

### 新增功能

1. **首页内容后台配置**
   - 后台“系统设置”可配置首页中英文轮播标题、副标题、按钮文案、首页背景关键词和每日精选关键词。
   - 首页标题继续使用单元素轮换，避免多标题同时播放导致重叠。

2. **每日精选**
   - 新增 `/daily` 页面，按 landscape / portrait / squarish 展示当天固定壁纸。
   - 新增 `/api/daily` 接口，支持 `orientation` 和 `info=true`。
   - 精选结果写入 D1 `daily_images`，同一天同方向保持稳定。

3. **API Key 管理**
   - 后台新增“API Key 管理”。
   - 支持创建、禁用、启用、删除外部调用 Key。
   - Key 明文只在创建后显示一次，D1 只保存哈希。
   - 支持 `Authorization: Bearer ow_xxx` 和 `X-API-Key: ow_xxx`。
   - 每个 Key 可配置独立分钟 / 小时 / 每日额度。

4. **图片质量评分**
   - 新增 `quality=fast|balanced|high` 参数。
   - 根据分辨率、方向匹配、比例匹配、图源健康、作者和来源信息计算 `quality_score`。
   - JSON 元数据会返回质量分数。

5. **预设分享**
   - 新增 `/share/preset/{slug}` 分享页。
   - 展示预设预览图、参数 JSON、二维码、复制链接和继续定制入口。
   - `/featured` 预设卡片增加分享按钮。

6. **图源路由增强**
   - 图源健康检测现在将 4xx/429 视为异常，而不是只把 5xx 当失败。
   - `source=random` 增加额度感知排序和失败冷却。
   - 后台“图源监控”可配置失败冷却秒数和额度感知开关。

7. **Telegram Bot 图片命令**
   - 新增 `/daily [landscape|portrait|squarish]`。
   - 新增 `/random 关键词`。
   - `/help` 已同步展示新命令。

8. **瀑布流探索页**
   - 新增 `/explore`。
   - 支持关键词、图源、方向、质量筛选。
   - 支持批量加载图片卡片和复制 API 链接。

### 数据库更新

自动初始化 / 迁移会新增：

- `api_keys`
- `daily_images`
- `source_failures`
- `request_analytics.api_key_id`

### 文档更新

- 更新 `README.md`
- 更新 `图床安装部署教程.md`

---

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

### GitHub 仓库

- 仓库地址: https://github.com/aichenshidelibing/omniwall
- 分支: main

### 部署说明

1. 将 `omniwall.txt` 内容复制到 Cloudflare Worker
2. 绑定 D1 数据库（变量名必须为 `DB`）
3. 配置必需的环境变量
4. 首次访问会自动初始化数据库表
5. 访问 `https://你的域名/{ADMIN_USERNAME}/login` 登录后台
