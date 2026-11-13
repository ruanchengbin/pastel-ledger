# 小程序/App（uni-app）测试计划

> 测试对象：`006.跨段APP（uniapp）/app`  
> 启动方式：**需要 HBuilderX**（无 CLI 编译脚本）。打开 HBuilderX → 导入 `006.跨段APP（uniapp）/app` → 运行到微信开发者工具 / Android / iOS  
> 后端依赖：同机器 `http://localhost:3000/api/v1`，地址在 `utils/api.js` 首行常量；真机调试需改成电脑局域网 IP + 微信后台 request 合法域名  
> 已编译产物：`unpackage/dist/dev/mp-weixin/`（可直接导入微信开发者工具）

---

## 1. 技术栈与目录结构

| 层 | 技术 |
|---|---|
| 框架 | uni-app × Vue 3（`<script setup>` 不支持，使用 Options API） |
| 运行平台 | 微信小程序（目标平台）、H5、App-Plus（Android/iOS，理论上 uni-app 一套代码多端编译） |
| 状态层 | Vue 3 `reactive` 本地 store（无 Pinia/Vuex） |
| 持久化 | `uni.getStorageSync / uni.setStorageSync`（小程序本地 storage 限制 10MB） |
| 主题 | App.vue 全局 `<style>` 中定义 `.theme-macaron / theme-ocean / theme-mint / theme-apricot` + **CSS 变量**切换 |
| tabBar | 原生 tabBar（非 custom-tab-bar），pages.json 声明 |
| 无 | 无 TypeScript、无构建配置（manifest.json / pages.json 就是配置） |

目录结构：
```
006.跨段APP（uniapp）/app/
  App.vue              # 全局样式（CSS 变量定义）+ onLaunch/onShow 主题恢复
  main.js              # Vue 实例入口
  manifest.json        # uni-app 应用配置（appid、版本、权限）
  pages.json           # 页面路由 + tabBar 定义
  uni.scss             # uni-app 内置变量
  index.html           # H5 入口模板
  static/              # tabBar 图标（ledger / stats / budget / settings，普通+选中）
  utils/
    api.js             # uni.request 封装：Token、401 静默续期、{code,data,message}
    store.js           # reactive state：theme / user / categories / transactions / budget
  pages/
    login/login.vue          # 登录 / 注册 / 找回密码
    ledger/ledger.vue        # 流水（月+账户筛选、明细 scroll-view 分页、下拉刷新、FAB）
    record/record.vue        # 记一笔 / 编辑
    stats/stats.vue          # 统计
    budget/budget.vue        # 预算
    categories/categories.vue
    settings/settings.vue    # 名字、关联账户、主题、退出/注销
  unpackage/
    dist/dev/mp-weixin/      # 已编译的小程序代码（可直接导入微信开发者工具）
```

---

## 2. 核心业务模块

| 模块 | 页面 | 特殊实现 |
|---|---|---|
| 登录态 | App.vue onLaunch/onShow + pages.json `"navigationStyle":"custom"` | 启动时自动恢复会话、未登录 tabBar 页跳 login |
| 主题 | store.js `applyThemeOf(user)` + App.vue `.theme-xxx` CSS 变量 | 按邮箱分仓存储 `ledger.theme.v1.xxx@yyy.com` |
| 流水分页 | ledger.vue `scroll-view scroll-y lower-threshold=80` | 默认 20 条，触底再追加；页面 disableScroll=true，只有明细区滚 |
| 跨账户只读 | `tx.readonly === true` 时点击行 toast 禁止、颜色降透明度、owner tag | 后端 `sync/full?include_partners=1` 一次性拉 |
| tabBar | pages.json 原生 tabBar | 4 个 item：流水/统计/预算/设置，带 static/ 图标 |
| 关联账户 | settings.vue link-list 委托 | 6 种状态 machine（pending/accepted/rejected/cancelled/revoked + direction） |
| 头像 | 4 个 tabBar 页 `.appbar--with-avatar` | 左头像 + 40rpx 间距 + 左对齐标题 |
| 外观卡片 | settings.vue theme-grid `.theme-card:nth-child(odd) margin-right` | 2×2 网格 |

---

## 3. 高风险功能（**重中之重**）

### P0 风险（不验证就不能上线）

| # | 风险 | 位置 | 原因 |
|---|---|---|---|
| **R1** | **微信小程序不支持 CSS `var()` 变量** | App.vue 全局 style | App.vue 里 4 套主题全部用 `--brand / --surface / --bg / --border` 变量切换。**微信小程序的 wxss 完全不支持 CSS 自定义属性**（`var()` 在 wxss 里是无效语法，渲染时浏览器 fallback 或直接不显示）。小程序端所有颜色都会失效——这是之前"主题没根据登录用户变"的真凶之一，而不是之前只修的 themeKeyFor。**这个 P0 必须在真机上立刻验证**，如果真不生效需要把 CSS 变量改成硬编码的每个主题下的显式值 |
| R2 | **tabBar `selectedFontWeight: "bold"` 是否生效** | pages.json tabBar list | 原生 tabBar 没有 `selectedFontWeight` 字段，这是 uni-app 的扩展。HBuilderX 编译到小程序时是否真的能转换成 WXSS 的 `font-weight: bold`？**必须真机看一下选中态** |
| R3 | **scroll-view 分页 + disableScroll 配合** | ledger.vue + pages.json `"disableScroll": true` | 页面级禁止滚动后，scroll-view 的 `scroll-y` + `lower-threshold` + `refresher-enabled` 能不能在微信小程序里同时生效？这三者之间在旧版本基础库里有冲突记录 |
| R4 | **主题按邮箱分仓存储** | store.js `themeKeyFor(email)` | 小程序的 `uni.getStorageSync` 在某些机型上最大支持 1024 个 key，多账号多次切换会不会累积太多 key |
| R5 | **后端 401 静默续期** | api.js | 如果 token 过期 + refresh_token 也过期，小程序后台挂起 5 分钟后回来是不是能正确跳登录页 |

### P1 风险

| # | 风险 | 位置 | 原因 |
|---|---|---|---|
| R6 | **tabBar 图标尺寸** | pages.json | 微信 tabBar 图标要求 ≤ 40KB，推荐 81×81px。static/ 下的 png 是 UI 工具生成的，没验证尺寸 |
| R7 | **小程序域名白名单** | manifest.json | 真机调试必须把后端地址加进 request 合法域名 |
| R8 | **自定义导航栏 + 状态栏适配** | 所有 tabBar 页 `.appbar` | `var(--status-bar-height)` 在真机上是否取值正确，刘海屏/水滴屏会不会遮挡 |
| R9 | **readonly tx 点击禁止编辑** | ledger.vue `openTx` | 只做了 UI 层拦截，后端 `/transactions/:id` 更新必须也有权限校验 |
| R10 | **金额「分」与「元」** | store.js `toCents / fromCents` | 输入框（元）→ 接口（分）的转换，负数、超大值、0.005 边界 |

### P2 风险（平台差异）

| # | 风险 | 平台 |
|---|---|---|
| R11 | picker 组件日历选择 | 微信基础库差异 |
| R12 | `scroll-into-view` 空字符串无效 | H5 正常、小程序可能保留旧滚动位置 |
| R13 | tabBar 切换重新渲染 onShow | 可能重复 sync |

---

## 4. 分层测试方案

```
┌────────────────────────────────────────────────────────────┐
│  L0 编译与加载                                             │
│  - HBuilderX 运行 → 微信开发者工具能打开                       │
│  - 控制台无编译错误                                          │
│  - 基础库版本兼容性警告检查                                    │
├────────────────────────────────────────────────────────────┤
│  L1 P0 主题生效验证（最优先！）                               │
│  - 登录后打开流水页                                          │
│  - 截图对比：4 主题下颜色是否正确                              │
│  - 如果 CSS var 不生效 → 立刻改代码                          │
├────────────────────────────────────────────────────────────┤
│  L2 功能链路手工验证（真机或开发者工具）                        │
│  - 登录 / 记一笔 / 统计 / 预算 / 关联 / 退出                   │
│  - 跨账户只读标记                                            │
│  - tabBar 图标 + 选中加粗                                    │
├────────────────────────────────────────────────────────────┤
│  L3 异常注入                                                │
│  - 开发者工具 "模拟弱网"、"离线"                              │
│  - localStorage 手工篡改 token                              │
├────────────────────────────────────────────────────────────┤
│  L4 多端回归                                                │
│  - H5 端（uni-app 编译 H5）                                   │
│  - Android 真机（如果有设备）                                 │
└────────────────────────────────────────────────────────────┘
```

### 4.1 L0 编译（第一步必须做）

1. HBuilderX 打开项目 → 运行 → 运行到小程序模拟器 → 微信开发者工具
2. 等编译完成，看**小程序开发者工具的错误面板**：
   - [ ] 没有 `wxss 解析错误`（R1 高风险！如果报 CSS var 无效就是中招）
   - [ ] 没有 `pages.json tabBar` 错误
   - [ ] 没有 `Cannot find module` 错误
3. 基础库版本建议 ≥ 2.32（较新的稳定版）

### 4.2 L1 主题生效验证（**P0 优先级最高**）

#### 场景 A：4 主题颜色是否显示

步骤：
1. 登录 demo 账号
2. 打开流水页 → 截图（记一次当前颜色）
3. 打开设置页 → 点「海盐蓝」主题卡 → 等 2 秒 → 截图
4. 流水页 → 截图（看是否变色）
5. 重复 2 次换薄荷青、暖杏橙

**判定**：
- ❌ 如果截图完全一样、或颜色显示为白色/默认灰色 → **CSS 变量在小程序端不生效，必须重构主题方案**
- ✅ 颜色能跟着选的主题变 → R1 通过

#### 场景 B：切换账号主题隔离

1. demo 选海洋蓝 → 退出
2. partner 登录 → 看主题（应该是 partner 自己的）
3. partner 选薄荷青 → 退出
4. demo 登录 → 看主题（必须回到海洋蓝，不是薄荷青）

#### 场景 C：主题按邮箱存储独立

用开发者工具 AppData 面板看 storage，应该有类似：
```
ledger.theme.v1.demo@ledger.app    = "ocean"
ledger.theme.v1.partner@ledger.app = "mint"
```
两个 key 独立存在。

### 4.3 L2 功能链路手工 checklist

**tabBar（P0）**
- [ ] 4 个 tab 有图标（static/ledger-current.png 等）
- [ ] 选中项颜色 = `#2c6a9e`（海洋蓝）
- [ ] 未选中 = `#8a8a8a`
- [ ] **选中文字加粗**（`selectedFontWeight` 是否生效）
- [ ] 点 tab 切换不闪白屏

**顶部栏（头像左上）**
- [ ] 4 个 tabBar 页头像在左
- [ ] 头像和标题之间有间隙（40rpx）
- [ ] 标题靠左，居中不对（看代码）
- [ ] 标题栏吸顶，滚动时不跟

**流水页**
- [ ] 月份切换按钮正常
- [ ] 多账户时出现账户筛选下拉
- [ ] 默认选中"全部关联"
- [ ] 明细区局部滚动（不整页滚动）
- [ ] 触底加载更多 + 底部提示
- [ ] 下拉刷新 reset 回 20 条
- [ ] partner tx 降透明度 + owner tag
- [ ] partner tx 点击 toast「关联账户流水仅可查看」（不跳编辑页）

**记一笔**
- [ ] 创建保存 → 返回流水页
- [ ] 编辑保存 → 金额变
- [ ] 删除 → 出现撤销按钮（30s 内）
- [ ] 31s 后撤销按钮消失（硬删除）

**设置页**
- [ ] 主题卡 2×2 对齐
- [ ] 选中态边框 + 背景色
- [ ] 改名字 → 头像立刻变（首字）
- [ ] 退出登录跳 login（不跳 404）
- [ ] 关联账户：发起 → 对方接受 → 自动互 accepted

**预算**
- [ ] 进度条 fill 正确颜色
- [ ] 总消耗 + 剩余 + 分类子预算

**统计**
- [ ] 汇总数字正确
- [ ] 构成占比 = 100%
- [ ] 6 月柱状趋势

### 4.4 L3 异常注入

| 操作 | 预期 |
|---|---|
| 开发者工具 → AppData → 删掉 auth_v1 + reload | 跳登录页 |
| 开发者工具 → 清 storage → 登录 → 换主题 → 重开 | 主题还在（持久化） |
| 弱网（2G slow）→ 打开流水页 | 有 loading 状态 + 超时 toast |
| 后端关掉 → 记一笔 → 保存 | 按钮 disabled + toast |

### 4.5 L4 多端回归（有时间时做）

- [ ] 编译 H5：HBuilderX → 运行到浏览器 → `localhost:8080`（H5 端也用 CSS var，但现代浏览器都支持，这里应该没问题）
- [ ] 编译 Android APK：如果有真机，跑 `npm run build:app` 或 HBuilderX 云打包

---

## 5. 主题重构预案（如果 L1 验证失败）

如果发现 `var()` 在微信小程序 wxss 中真的不生效，**必须立刻重构**。方案：

**方案 A：scss 编译硬编码（推荐，因为 uni.scss 已存在）**
把 `.theme-macaron { --brand: #a78bfa; ... }` 改成：
```scss
.theme-macaron {
  .btn--primary { background: #a78bfa; }
  .avatar { background: #a78bfa; }
  /* 每个用到变量的 class 在 4 个主题下各写一份 */
}
.theme-ocean { ... }
.theme-mint { ... }
.theme-apricot { ... }
```
scss 编译期展开，wxss 里没有任何 var()。

**方案 B：runtime inline 样式**
用 JS 在 `onLaunch` 时收集主题变量，然后遍历所有 class，动态 setStyle。缺点是维护成本高。

**建议**：先跑 L1 验证，拿到确切结论再决定重构范围。

---

## 6. 执行指南

### 启动
```
# 后端（同一个）
cd 005.后端代码; npm start

# uni-app
# HBuilderX 打开 006.跨段APP（uniapp）/app
# 运行 → 运行到小程序模拟器 → 微信开发者工具
# （或直接用 unpackage/dist/dev/mp-weixin 导入微信开发者工具）
```

### 真机调试域名白名单
开发者工具（或小程序管理后台）→ 开发设置 → 服务器域名 → request 合法域名：
```
http://<你的电脑局域网IP>:3000
```
并关闭「不校验合法域名」选项验证。

### 抓包（可选）
Charles / 微信开发者工具 Network 面板，看 `/api/v1/sync/full?include_partners=1` 返回：
- [ ] `visible_accounts` 数组含所有关联账户
- [ ] partner tx 有 `owner_email` + `readonly: true` + `category_name`

---

## 7. 交付物

- [ ] L1 主题验证结论（CSS var 是否生效 + 截图）
- [ ] 如 R1 不通过 → 方案 A 重构（约 200 行 CSS 重写）
- [ ] tabBar selectedFontWeight 真机截图 + 结论
- [ ] P0 用例 checklist 执行完毕
- [ ] 本文件保留在 `008.项目测试/03-小程序App测试计划.md`
