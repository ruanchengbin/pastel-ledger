/*
  store.js — 小程序端账本状态层
  与 003.前端代码/assets/js/store.js 同一套数据模型与后端接口：
  - 金额统一以「分」存储
  - 分类 / 流水 / 预算全部走 REST 接口，GET /sync/full?include_partners=1 一次性拉全量
  - 本地按账号（邮箱）分仓持久化，主题全局记忆
*/
import { reactive } from 'vue'
import Api from './api.js'

const USER_KEY = 'ledger.user.v1'
const AUTH_KEY = 'ledger.auth.v1'
const THEME_KEY = 'ledger.theme.v1'
const DATA_PREFIX = 'ledger.data.'
const DEFAULT_THEME = 'macaron'
export const THEMES = ['macaron', 'ocean', 'mint', 'apricot']
export const THEME_META = {
  macaron: { name: '马卡龙紫', desc: '柔和紫调 · 默认', color: '#a78bfa' },
  ocean: { name: '海盐蓝', desc: '清透冷静', color: '#8fbce8' },
  mint: { name: '薄荷青', desc: '清爽自然', color: '#86cfb8' },
  apricot: { name: '暖杏橙', desc: '温暖柔和', color: '#f0b58c' }
}

/* ------------------------------ 工具 ------------------------------ */

export function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

export function iso(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

export function todayISO() {
  return iso(new Date())
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function shiftMonth(key, delta) {
  const parts = String(key).split('-')
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1)
  return date.getFullYear() + '-' + pad(date.getMonth() + 1)
}

export function monthLabel(key) {
  const parts = String(key).split('-')
  return parts[0] + '年' + Number(parts[1]) + '月'
}

export function toCents(yuan) {
  return Math.round(Number(yuan || 0) * 100)
}

export function fromCents(cents) {
  return Math.round(Number(cents || 0)) / 100
}

export function formatMoney(cents, withSign) {
  const value = Number(cents || 0) / 100
  const text = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (!withSign) return text
  return (value < 0 ? '-' : '') + text
}

function read(key, fallback) {
  try {
    const raw = uni.getStorageSync(key)
    return raw === '' || raw === null || raw === undefined ? fallback : raw
  } catch (e) {
    return fallback
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) uni.removeStorageSync(key)
    else uni.setStorageSync(key, value)
  } catch (e) {
    /* 忽略写入异常 */
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/* ------------------------------ 状态 ------------------------------ */

export const state = reactive({
  user: null,
  theme: normalizeTheme(read(THEME_KEY, DEFAULT_THEME)),
  categories: [],
  transactions: [],
  budget: { total: 0, startDay: 1, categories: {} },
  visibleAccounts: [],
  recent: {},
  monthKey: todayISO().slice(0, 7),
  ready: false
})

export function normalizeTheme(name) {
  return THEMES.indexOf(name) > -1 ? name : DEFAULT_THEME
}

export function currentUser() {
  const u = read(USER_KEY, null)
  if (!u || !u.email) return null
  return {
    id: u.id || null,
    email: u.email,
    name: u.name || null,
    theme: u.theme || DEFAULT_THEME,
    createdAt: u.createdAt || null,
    lastLoginAt: u.lastLoginAt || null
  }
}

export function isLoggedIn() {
  return !!read(AUTH_KEY, null)
}

function saveSession(user) {
  if (!user || !user.email) return
  const now = new Date().toISOString()
  write(USER_KEY, {
    id: user.id || null,
    email: user.email,
    name: user.name || user.display_name || null,
    theme: user.theme || DEFAULT_THEME,
    createdAt: user.created_at || user.createdAt || now,
    lastLoginAt: user.last_login_at || user.lastLoginAt || now
  })
  write(AUTH_KEY, { email: user.email, at: now })
  state.user = currentUser()
  setTheme(state.user.theme)
}

export function clearSession() {
  write(AUTH_KEY, null)
  write(USER_KEY, null)
  state.user = null
  state.categories = []
  state.transactions = []
  state.visibleAccounts = []
  state.budget = { total: 0, startDay: 1, categories: {} }
  state.ready = false
}

/* ------------------------------ 主题 ------------------------------ */

export function setTheme(name) {
  const theme = normalizeTheme(name)
  state.theme = theme
  write(THEME_KEY, theme)
  return theme
}

/* ------------------------------ 本地数据 ------------------------------ */

function dataKey(email) {
  return DATA_PREFIX + String(email || '').toLowerCase()
}

function freshData() {
  return {
    categories: [],
    transactions: [],
    budget: { total: 0, startDay: 1, categories: {} },
    visibleAccounts: [],
    recent: {}
  }
}

export function loadData() {
  const user = currentUser()
  if (!user) return null
  const data = read(dataKey(user.email), null) || freshData()
  state.categories = data.categories || []
  state.transactions = data.transactions || []
  state.budget = data.budget || { total: 0, startDay: 1, categories: {} }
  state.visibleAccounts = data.visibleAccounts || []
  state.recent = data.recent || {}
  state.ready = true
  return state
}

export function persist() {
  const user = currentUser()
  if (!user) return
  write(dataKey(user.email), {
    categories: state.categories,
    transactions: state.transactions,
    budget: state.budget,
    visibleAccounts: state.visibleAccounts,
    recent: state.recent
  })
}

/* ------------------------------ 登录态 ------------------------------ */

function applyAuth(data) {
  if (data.access_token) {
    Api.setTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 900) * 1000
    })
  }
  saveSession(data.user)
}

export async function login(email, password, remember) {
  email = String(email || '').trim().toLowerCase()
  const data = await Api.login(email, password, remember !== false)
  applyAuth(data)
  loadData()
  return currentUser()
}

export async function register(email, password, code) {
  email = String(email || '').trim().toLowerCase()
  const data = await Api.register({ email, password, code, agree_terms: true })
  applyAuth(data)
  loadData()
  return currentUser()
}

export async function sendCode(email, purpose) {
  return Api.sendCode(email, purpose)
}

export async function resetPassword(payload) {
  return Api.resetPassword(payload)
}

export async function logout() {
  try {
    await Api.logout()
  } catch (e) {
    /* 网络失败也要清本地登录态 */
  }
  clearSession()
}

export async function deleteAccount() {
  await Api.deleteAccount()
  const user = currentUser()
  if (user) write(dataKey(user.email), null)
  clearSession()
}

export async function fetchMeAsync() {
  const data = await Api.me()
  const user = currentUser() || {}
  user.id = data.id
  user.email = data.email
  user.name = data.name || user.name || null
  user.theme = data.theme || user.theme || DEFAULT_THEME
  user.createdAt = data.created_at || user.createdAt
  user.lastLoginAt = data.last_login_at || user.lastLoginAt
  write(USER_KEY, user)
  state.user = currentUser()
  setTheme(user.theme)
  return state.user
}

export async function updateThemeAsync(theme) {
  const data = await Api.updateTheme(theme)
  const user = currentUser() || {}
  user.theme = data.theme || theme
  write(USER_KEY, user)
  state.user = currentUser()
  return setTheme(user.theme)
}

export async function updateNameAsync(name) {
  const data = await Api.updateName(name)
  const user = currentUser() || {}
  user.name = data.name || null
  write(USER_KEY, user)
  state.user = currentUser()
  return user.name
}

/* ------------------------------ 同步 ------------------------------ */

export function mapCategoryFromApi(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon || 'category',
    color: row.color || '#7a5fe0',
    builtin: !!row.is_system,
    enabled: row.status !== 'disabled',
    order: Number(row.sort_order) || 0
  }
}

export function mapTransactionFromApi(row) {
  return {
    id: row.id,
    type: row.type,
    amount: toCents(row.amount),
    categoryId: row.category_id,
    date: String(row.occurred_on).slice(0, 10),
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.server_updated_at || row.created_at || new Date().toISOString(),
    deleted: !!row.deleted_at,
    version: row.version,
    ownerEmail: row.owner_email || null,
    ownerName: row.owner_name || null,
    readonly: !!row.readonly,
    categoryName: row.category_name || null,
    categoryIcon: row.category_icon || null,
    categoryColor: row.category_color || null
  }
}

export function applyServerData(data) {
  if (!data) return
  if (Array.isArray(data.categories)) state.categories = data.categories.map(mapCategoryFromApi)
  if (Array.isArray(data.transactions)) state.transactions = data.transactions.map(mapTransactionFromApi)
  if (data.budgets) {
    state.budget.startDay = Number(data.budgets.period_start_day) || 1
    state.budget.total = data.budgets.total_amount_yuan == null ? 0 : toCents(data.budgets.total_amount_yuan)
  }
  if (Array.isArray(data.category_budgets)) {
    const map = {}
    data.category_budgets.forEach((item) => {
      map[item.category_id] = toCents(item.amount_yuan)
    })
    state.budget.categories = map
  }
  if (Array.isArray(data.visible_accounts)) {
    state.visibleAccounts = data.visible_accounts.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name || null
    }))
  }
  persist()
  return state
}

export async function syncFromServer() {
  if (!currentUser()) return null
  const data = await Api.get('/sync/full?include_partners=1')
  return applyServerData(data)
}

/* ------------------------------ 流水 ------------------------------ */

export function transactions() {
  return state.transactions.filter((tx) => !tx.deleted)
}

export function transactionsOfMonth(monthKey) {
  return transactions().filter((tx) => String(tx.date).slice(0, 7) === monthKey)
}

export function findTransaction(id) {
  return state.transactions.filter((tx) => tx.id === id)[0] || null
}

export async function addTransaction(input) {
  const amount = Math.round(Number(input.amount))
  assert(amount > 0, '请输入有效金额')
  const category = state.categories.filter((c) => c.id === input.categoryId && c.type === input.type)[0]
  assert(category, '请选择分类')

  const now = new Date().toISOString()
  const type = input.type === 'income' ? 'income' : 'expense'
  const date = input.date || todayISO()
  const note = String(input.note || '').slice(0, 50)
  const id = uuidv4()

  const created = await Api.post('/transactions', {
    id,
    type,
    amount: amount / 100,
    category_id: input.categoryId,
    occurred_on: date,
    note
  })

  const tx = {
    id: (created && created.id) || id,
    type,
    amount,
    categoryId: input.categoryId,
    date,
    note,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    version: created && created.version,
    ownerEmail: null,
    ownerName: null,
    readonly: false
  }
  state.transactions.push(tx)
  state.recent[type] = tx.categoryId
  persist()
  return tx
}

export async function updateTransaction(id, patch) {
  const tx = findTransaction(id)
  assert(tx, '记录不存在或已删除')
  assert(!tx.readonly, '关联账户流水仅可查看')

  const body = {}
  if (patch.type) {
    body.type = patch.type === 'income' ? 'income' : 'expense'
    assert(state.categories.filter((c) => c.id === patch.categoryId && c.type === body.type)[0], '请选择分类')
  }
  if (patch.amount != null) {
    const amount = Math.round(Number(patch.amount))
    assert(amount > 0, '请输入有效金额')
    body.amount = amount / 100
  }
  if (patch.categoryId) body.category_id = patch.categoryId
  if (patch.date) body.occurred_on = patch.date
  if (patch.note != null) body.note = String(patch.note).slice(0, 50)

  const updated = await Api.put('/transactions/' + encodeURIComponent(id), body)

  if (body.type) tx.type = body.type
  if (patch.amount != null) tx.amount = Math.round(Number(patch.amount))
  if (patch.categoryId) tx.categoryId = patch.categoryId
  if (patch.date) tx.date = patch.date
  if (patch.note != null) tx.note = String(patch.note).slice(0, 50)
  tx.updatedAt = new Date().toISOString()
  if (updated && updated.version != null) tx.version = updated.version
  state.recent[tx.type] = tx.categoryId
  persist()
  return tx
}

export async function softDelete(id) {
  const tx = findTransaction(id)
  if (!tx) return null
  assert(!tx.readonly, '关联账户流水仅可查看')
  await Api.del('/transactions/' + encodeURIComponent(id))
  tx.deleted = true
  persist()
  return tx
}

/* ------------------------------ 统计 ------------------------------ */

export function summary(monthKey) {
  const key = monthKey || state.monthKey
  const list = transactionsOfMonth(key)
  const expense = list.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0)
  const income = list.filter((tx) => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0)
  const parts = key.split('-')
  const total = daysInMonth(Number(parts[0]), Number(parts[1]))
  const today = todayISO()
  const days = key === today.slice(0, 7) ? Number(today.slice(8, 10)) : total
  return {
    key,
    expense,
    income,
    balance: income - expense,
    count: list.length,
    days,
    dailyAvg: days ? Math.round(expense / days) : 0,
    balanceRate: income > 0 ? (income - expense) / income : null
  }
}

export function breakdown(monthKey, type) {
  const wanted = type || 'expense'
  const list = transactionsOfMonth(monthKey).filter((tx) => tx.type === wanted)
  const total = list.reduce((s, tx) => s + tx.amount, 0)
  const map = {}
  list.forEach((tx) => {
    const cat = categoryById(tx.categoryId)
    const key = tx.categoryId || (tx.categoryName || 'unknown')
    if (!map[key]) {
      map[key] = {
        category: {
          id: key,
          name: (cat && cat.name) || tx.categoryName || '未分类',
          color: (cat && cat.color) || tx.categoryColor || '#a78bfa',
          icon: (cat && cat.icon) || tx.categoryIcon || 'category'
        },
        amount: 0
      }
    }
    map[key].amount += tx.amount
  })
  return Object.keys(map)
    .map((k) => {
      const row = map[k]
      row.percent = total > 0 ? (row.amount / total) * 100 : 0
      return row
    })
    .sort((a, b) => b.amount - a.amount)
}

export function trend(endMonthKey, count) {
  const size = count || 6
  const rows = []
  for (let i = size - 1; i >= 0; i--) {
    const key = shiftMonth(endMonthKey || state.monthKey, -i)
    const s = summary(key)
    rows.push({ key, expense: s.expense, income: s.income })
  }
  return rows
}

export function comparison(monthKey) {
  const current = summary(monthKey)
  const previous = summary(shiftMonth(monthKey || state.monthKey, -1))
  return {
    current,
    previous,
    expensePercent: previous.expense > 0 ? ((current.expense - previous.expense) / previous.expense) * 100 : null,
    incomePercent: previous.income > 0 ? ((current.income - previous.income) / previous.income) * 100 : null,
    balanceDiff: current.balance - previous.balance
  }
}

/* ------------------------------ 分类 ------------------------------ */

export function categoriesOf(type, includeDisabled) {
  return state.categories
    .filter((c) => (!type || c.type === type) && (includeDisabled || c.enabled))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export function categoryById(id) {
  return state.categories.filter((c) => c.id === id)[0] || null
}

export async function addCategoryAsync(input) {
  const type = input.type === 'income' ? 'income' : 'expense'
  const created = await Api.post('/categories', {
    type,
    name: String(input.name || '').trim(),
    icon: input.icon || (type === 'income' ? 'add_circle' : 'sell'),
    color: input.color || '#7A5FE0'
  })
  const category = mapCategoryFromApi(created)
  state.categories.push(category)
  persist()
  return category
}

export async function updateCategoryAsync(id, patch) {
  const body = {}
  if (patch.name != null) body.name = String(patch.name).trim()
  if (patch.color) body.color = patch.color
  if (patch.icon) body.icon = patch.icon
  if (patch.status) body.status = patch.status
  const updated = await Api.put('/categories/' + encodeURIComponent(id), body)
  const idx = state.categories.findIndex((c) => c.id === id)
  if (idx >= 0) state.categories[idx] = mapCategoryFromApi(updated)
  persist()
  return mapCategoryFromApi(updated)
}

export async function removeCategoryAsync(id) {
  await Api.del('/categories/' + encodeURIComponent(id))
  state.categories = state.categories.filter((c) => c.id !== id)
  delete state.budget.categories[id]
  persist()
  return true
}

export async function toggleCategoryAsync(id) {
  const category = categoryById(id)
  if (!category) throw new Error('分类不存在')
  return updateCategoryAsync(id, { status: category.enabled ? 'disabled' : 'active' })
}

export async function moveCategoryAsync(id, direction) {
  const category = categoryById(id)
  if (!category) return false
  const siblings = categoriesOf(category.type, true).slice()
  const index = siblings.findIndex((c) => c.id === id)
  const target = index + (direction < 0 ? -1 : 1)
  if (target < 0 || target >= siblings.length) return false
  const a = siblings[index]
  const b = siblings[target]
  const temp = a.order
  a.order = b.order
  b.order = temp
  await Api.put('/categories/order', {
    type: category.type,
    orders: siblings.map((c) => ({ id: c.id, sort_order: c.order }))
  })
  persist()
  return true
}

/* ------------------------------ 预算 ------------------------------ */

export function budgetPeriod(reference) {
  const ref = reference ? new Date(reference) : new Date()
  const startDay = state.budget.startDay || 1
  const year = ref.getFullYear()
  const month = ref.getMonth()
  const start = ref.getDate() >= startDay ? new Date(year, month, startDay) : new Date(year, month - 1, startDay)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, startDay - 1)
  return {
    start: iso(start),
    end: iso(end),
    startDay,
    startLabel: start.getFullYear() + '年' + (start.getMonth() + 1) + '月' + start.getDate() + '日',
    endLabel: end.getFullYear() + '年' + (end.getMonth() + 1) + '月' + end.getDate() + '日',
    label: start.getMonth() + 1 + '月' + start.getDate() + '日 – ' + (end.getMonth() + 1) + '月' + end.getDate() + '日'
  }
}

export function budgetUsage() {
  const period = budgetPeriod()
  const list = transactions().filter(
    (tx) => tx.type === 'expense' && tx.date >= period.start && tx.date <= period.end
  )
  const total = Math.round(state.budget.total || 0)
  const used = list.reduce((s, tx) => s + tx.amount, 0)
  const rows = categoriesOf('expense', true).map((cat) => {
    const limit = Math.round(state.budget.categories[cat.id] || 0)
    const spent = list.filter((tx) => tx.categoryId === cat.id).reduce((s, tx) => s + tx.amount, 0)
    return {
      category: cat,
      limit,
      spent,
      percent: limit > 0 ? (spent / limit) * 100 : null
    }
  })
  return {
    period,
    total,
    used,
    remaining: total - used,
    percent: total > 0 ? (used / total) * 100 : null,
    dailyAllowance: (function () {
      const end = new Date(period.end + 'T00:00:00')
      const today = new Date(todayISO() + 'T00:00:00')
      const days = Math.max(1, Math.round((end - today) / 86400000) + 1)
      return Math.max(0, Math.round((total - used) / days))
    })(),
    categories: rows
  }
}

export async function saveBudgetAsync(input) {
  const total = Math.round(Number(input.total || 0))
  const startDay = Number(input.startDay) || 1
  assert(total >= 0, '预算金额不能为负数')
  assert(startDay >= 1 && startDay <= 28, '周期起始日需为 1–28')

  const categoryBudgets = []
  Object.keys(input.categories || {}).forEach((id) => {
    const value = Math.round(Number(input.categories[id] || 0))
    if (value > 0) categoryBudgets.push({ category_id: id, amount_yuan: fromCents(value) })
  })

  const data = await Api.put('/budgets', {
    period_start_day: startDay,
    total_amount_yuan: total > 0 ? fromCents(total) : null,
    category_budgets: categoryBudgets
  })

  state.budget.startDay = Number(data.period_start_day) || 1
  state.budget.total = data.total_amount_yuan == null ? 0 : toCents(data.total_amount_yuan)
  const map = {}
  ;(data.category_budgets || []).forEach((item) => {
    map[item.category_id] = toCents(item.amount_yuan)
  })
  state.budget.categories = map
  persist()
  return state.budget
}

/* ------------------------------ 关联账户 ------------------------------ */

export function visibleAccounts() {
  if (!Array.isArray(state.visibleAccounts) || !state.visibleAccounts.length) {
    const u = currentUser()
    return u ? [{ id: u.id, email: u.email, name: u.name || null }] : []
  }
  return state.visibleAccounts.slice()
}

export function accountLabel(account) {
  if (!account) return ''
  const self = currentUser()
  const mine = self && String(account.email).toLowerCase() === self.email
  const base = account.name || account.email
  return mine ? base + '（我）' : base
}

export async function listLinksAsync() {
  const data = await Api.get('/links')
  const items = (data && data.items) || []
  // 后端用 role: requester/target 标识方向，这里统一补一个 direction 字段
  return items.map((item) =>
    Object.assign({}, item, {
      direction: item.role === 'target' ? 'incoming' : 'outgoing'
    })
  )
}

export async function requestLinkAsync(email, message) {
  await Api.post('/links', { email, message: message || '' })
  return listLinksAsync()
}

export async function acceptLinkAsync(id) {
  await Api.post('/links/' + id + '/accept', {})
  return listLinksAsync()
}

export async function rejectLinkAsync(id) {
  await Api.post('/links/' + id + '/reject', {})
  return listLinksAsync()
}

export async function cancelLinkAsync(id) {
  await Api.post('/links/' + id + '/cancel', {})
  return listLinksAsync()
}

export async function revokeLinkAsync(id) {
  await Api.post('/links/' + id + '/revoke', {})
  return listLinksAsync()
}
