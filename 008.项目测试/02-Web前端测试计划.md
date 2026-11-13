# 前端（Web）测试计划 · Pastel Ledger Web

> 测试对象：`003.前端代码`  
> 启动方式：`node server.js`（内置 Node 静态文件服务，8765 端口），浏览器打开 `http://localhost:8765`  
> 后端依赖：同机器 `http://localhost:3000/api/v1`，前端 API 基地址在 `assets/js/api.js` 中  
> 现有基建：无单测 / 无 E2E 框架 / 无 CI。测试手段全手工 + 少量 Playwright（可选）

---

## 1. 技术栈与目录结构

| 层 | 技术 |
|---|---|
| 运行时 | 原生 HTML5 + 原生 ES Module JS（无构建） |
| 样式 | CSS 变量 + 5 个平铺 CSS 文件 |
| 主题 | 4 套：macaron / ocean / mint / apricot，顶层 `.theme-xxx` 类切换 |
| 鉴权 | 前端存 `access_token / refresh_token` 在 localStorage，401 自动静默续期 |
| 数据同步 | `/sync/full?include_partners=1` 一次性拉全量 |
| 跨账户 | partner 流水带 `ownerEmail / readonly / categoryName`，前端渲染时降透明度 + 禁用编辑 |
| 后端连接 | fetch + 统一封装 `api.js`，所有端点返回 `{code, data, message}` |
| 服务器 | 自写 Node HTTP server（`server.js`），仅做静态文件服务 + 防目录穿越 |

目录结构：
```
003.前端代码/
  index.html            # 登录/注册入口（根路径）
  server.js             # Node 静态文件服务
  assets/
    css/
      tokens.css        # 4 套主题 CSS 变量定义
      base.css          # 重置 / 排版
      components.css    # card / btn / tag / avatar / progress / list
      pages.css         # 各页面特有样式
      auth.css          # 登录/注册页
    js/
      api.js            # fetch 封装：token、401 续期、错误统一
      auth.js           # login/register/logout/fetchMe
      store.js          # 全局状态（localStorage 持久化）+ syncFromServer
      theme.js          # 主题切换 applyTheme / 按账号记忆
      ui.js             # toast / modal / confirm / avatarLetter
      ledger.js         # 流水页
      record.js         # 记一笔 / 编辑
      categories.js     # 分类管理
      budget.js         # 预算
      stats.js          # 统计
      settings.js       # 设置（含关联账户管理、主题切换、名字、退出登录）
  pages/
    login.html          # 登录
    register.html       # 注册
    forgot-password.html
    ledger.html         # 流水（默认页）
    record.html         # 记一笔（/pages/record.html?txId=xxx 编辑模式）
    categories.html
    budget.html
    stats.html
    settings.html
```

---

## 2. 核心业务模块

| 模块 | 文件 | 职责 |
|---|---|---|
| 鉴权会话 | `auth.js` + `store.js#saveSession` | 登录 → localStorage → 同步全量 → 应用主题 |
| 主题 | `theme.js` | 按账号（邮箱）分仓记忆，切换账号自动变 |
| 流水 | `ledger.js` | 月筛选 + 账户筛选（多账户）+ 只读标记 + 分页 |
| 记一笔 | `record.js` | 创建 / 编辑 / 删除（30s 内可恢复）+ partner 流水禁用编辑 |
| 统计 | `stats.js` | 汇总 / 构成 / 6 月柱状趋势 |
| 预算 | `budget.js` | 总额 / 起始日 / 分类预算 / 实时进度 |
| 分类 | `categories.js` | 支出/收入分类管理 + 排序 |
| 设置 | `settings.js` | 名字、主题、关联账户（发起/确认/解除）、密码、退出/注销 |

---

## 3. 高风险功能

### P0 风险

| # | 风险 | 位置 | 原因 |
|---|---|---|---|
| R1 | **退出登录跳转 404** | `settings.js` | 已修复过一次（`index.html` → `login.html`），类似相对路径问题容易复发（`pages/` 目录下相对路径解析） |
| R2 | **主题切换不按账号隔离** | `theme.js` + `store.js` | 全局键曾是单一 `ledger.theme.v1`，切换账号会沿用前一个账号的主题，之前踩过坑 |
| R3 | **partner 流水误编辑** | `ledger.js#openTx` / `record.js` | readonly 标记在 UI 层靠布尔判断，漏判断会跳去编辑页写对方数据 |
| R4 | **syncFromServer 合并字段覆盖** | `store.js#applyServerData` | 后端 `include_partners=1` 带来的 `ownerEmail` 等字段不能与本地缓存混淆 |
| R5 | **API 基地址硬编码** | `api.js` | 如果写成 localhost 而部署到线上会全挂 |

### P1 风险

| # | 风险 | 位置 |
|---|---|---|
| R6 | **刷新 token 竞态** | `api.js#refreshIfNeeded` | 并发 3 个 401 同时触发续期，可能只一个成功、另外两个拿着已失效的 refresh_token |
| R7 | **undo 恢复窗口** | `record.js` | 30 秒后后端 hard delete，前端按钮是否正确隐藏 |
| R8 | **移动端 CSS 兼容** | `tokens.css` / `pages.css` | 变量降级、rpx 单位（Web 端用 px）、Safari 14 CSS var 支持 |
| R9 | **XSS：note 字段未 escape** | `ledger.js` | 流水备注直接 innerHTML 渲染 |

---

## 4. 分层测试方案

```
┌────────────────────────────────────────────────────────────┐
│  L0 视觉冒烟（手测，Chrome 80+）                             │
│  - 4 主题在 7 个页面下切换无错位                               │
│  - 退出登录 → 正确跳 /pages/login.html                       │
├────────────────────────────────────────────────────────────┤
│  L1 页面级手工用例（浏览器控制台 + 人肉）                        │
│  - 登录/注册/退出链路                                         │
│  - 记一笔 → 编辑 → 删除 → undo                                │
│  - 关联账户完整链路                                          │
│  - 主题按账号隔离                                            │
├────────────────────────────────────────────────────────────┤
│  L2 端到端（可选 Playwright / Selenium 脚本）                  │
│  - 完整路径：打开 → 登录 → 流水页 → 记一笔 → 统计 → 设置      │
│  - 跨账号场景（需要两个账号 + 两次登录）                       │
├────────────────────────────────────────────────────────────┤
│  L3 网络异常注入（Chrome DevTools throttle）                    │
│  - 断网、慢网、后端返回 500 时的 UI 状态                       │
├────────────────────────────────────────────────────────────┤
│  L4 安全（控制台代码注入）                                    │
│  - 手工改 localStorage 的 token / theme                       │
│  - 直接 fetch 后端接口写对方数据（读越权）                     │
└────────────────────────────────────────────────────────────┘
```

### 4.1 L0 视觉冒烟（每个主题下的关键截图）

| 场景 | 检查点 |
|---|---|
| 登录页（根路径） | 4 套主题 hero 区颜色正确、不溢出 |
| 流水页 月选择 + 账户筛选 | 多账户时下拉显示正确分组，无滚动条冲突 |
| 设置页 主题卡片 | 2×2 网格对齐、选中态边界高亮 |
| 预算页 进度条 | 不同颜色主题下进度条 fill 色正确 |
| 记一笔 FAB | 悬浮按钮不被底部内容遮挡 |
| 统计页 6 月柱状趋势 | bar 高度单调正确，无负高度 |

### 4.2 L1 页面级手工用例（推荐 checklist）

**链路 A：基础记账**
1. 访问 `http://localhost:8765` → 自动跳登录页（**根路径必须返回 index.html，且 index.html 自动跳 pages/ledger.html 或 login.html**）
2. demo 登录 → 流水页加载
3. 点悬浮 + 按钮 → 记一笔 → 保存 → 返回流水页 → 新记录出现在今天分组
4. 点刚记录的行 → 编辑 → 改金额 → 保存 → 金额变
5. 再次点开 → 删除 → 流水消失 → 按钮变撤销（30 秒内）→ 撤销 → 记录回来

**链路 B：跨账户关联**
1. demo 在设置页输入 partner 邮箱 → 发送 → 列表出现 pending
2. 退出 → partner 登录 → 设置页看到 pending 请求 → 接受
3. demo 重新登录 → 流水页出现账户筛选器（多账户时才显示）
4. 切到 partner 账户 → 流水行降透明度、头像旁显示 partner 名字、点击行 **不能跳编辑页**（toast "关联账户流水仅可查看"）
5. 切回 "全部关联" → 汇总包含两边总额

**链路 C：主题按账号隔离**
1. demo 登录 → 设置页 → 选 ocean → 整个 Web 立刻变蓝
2. 退出 → partner 登录 → 整个 Web **不能是 ocean**（partner 自己的主题）
3. partner 选 mint → 退出 → demo 重新登录 → 必须回到 ocean

**链路 D：退出登录**
1. 任意页面点退出 → confirm → 跳 `pages/login.html`（**不能跳 index.html 404**）
2. 按浏览器返回键 → 再次跳回 login（不能回到已登出的页面）

### 4.3 L2 E2E（Playwright 示例骨架，可选）

```js
// npm i -D @playwright/test
test('完整记账 + 主题隔离', async ({ page }) => {
  await page.goto('http://localhost:8765');
  await page.fill('[name=email]', 'demo@ledger.app');
  await page.fill('[name=password]', 'demo1234');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/ledger\.html/);
  // 断言主题类
  await expect(page.locator('.page')).toHaveClass(/theme-ocean|theme-macaron/);
});
```

### 4.4 L3 网络异常注入（Chrome DevTools Network → Offline）

| 操作 | 预期 UI |
|---|---|
| 登录时断网 | 按钮变 disabled + toast 「网络错误，请稍后重试」 |
| 记一笔时断网 | 按钮 disabled + 留在当前表单（**不能丢失用户填写的内容**） |
| sync 时断网 | 顶部不报错，继续显示本地数据，下次联网自动恢复 |
| 401 静默续期失败 | 自动跳登录页，localStorage AUTH_KEY 被清空 |

### 4.5 L4 安全

| 攻击 | 期望 |
|---|---|
| localStorage 里把 token 改成假值 → 刷新 | /account/me 401 → 自动跳登录页 |
| fetch 直接写对方 transaction id | 后端应返回 403（**前端即使不拦截也没权限**，这是后端的事，但前端要在控制台看到错误） |
| XSS：手工改一条 tx 的 note 为 `<img src=x onerror=alert(1)>` → 渲染 | 如果 innerHTML 渲染则会 alert；正确做法应 textContent |

---

## 5. 执行指南

### 手测 checklist（复制到浏览器 console 打开的 checklist.md 对照）

- [ ] 登录后头像显示名字首字
- [ ] 退出登录不跳 404
- [ ] 切换账号主题自动变
- [ ] partner 流水点击不可编辑
- [ ] 设置页主题卡片 2×2 对齐
- [ ] 预算进度条 fill 正确
- [ ] 统计页 bar 无负高度
- [ ] undo 30s 后按钮正确消失

### 一键打开
```powershell
cd 005.后端代码; npm start    # 后端 3000
cd 003.前端代码; node server.js   # 前端 8765
# 浏览器 http://localhost:8765
```

### 跑后端 smoke
```powershell
cd 005.后端代码; node smoke.mjs   # 36+ 断言
```

---

## 6. 交付物

- [ ] 本文件 L0/L1 checklist 执行完毕，发现问题直接回写
- [ ] 主题隔离问题（R2）加一次专项回归
- [ ] 设置页退出登录跳转（R1）加一次专项回归
- [ ] 可选：`003.前端代码/e2e.spec.js` Playwright 脚本骨架
- [ ] 本文件保留在 `008.项目测试/02-Web前端测试计划.md`
