<template>
  <view class="page" :class="'theme-' + theme">
    <view class="appbar">
      <view class="appbar__title appbar-title">
        <text class="appbar-name">预算</text>
        <text class="appbar__sub appbar-sub">{{ periodLabel }}</text>
      </view>
      <view class="avatar" @tap="goSettings">{{ avatarLetter }}</view>
    </view>

    <view class="container">
      <view class="card hero-card">
        <view class="hero-head">
          <view class="hero-main">
            <text class="hero-label">总预算</text>
            <text class="hero-total mono" :class="{ 'is-unset': !usage.total }">
              {{ usage.total > 0 ? '¥' + money(usage.total) : '未设置' }}
            </text>
          </view>
          <view class="hero-percent">
            <text class="hero-percent__value mono">{{ percentLabel }}</text>
            <text class="hero-percent__label">已使用</text>
          </view>
        </view>

        <view v-if="usage.total > 0" class="progress hero-progress">
          <view
            class="progress__bar"
            :class="{ 'is-strong': usage.percent >= 80 }"
            :style="{ width: barWidth(usage.percent) }"
          ></view>
        </view>

        <text v-if="!usage.total" class="hero-tip">设置一个总预算，掌控每月花销</text>

        <view v-else class="hero-meta">
          <view class="hero-meta__item">
            <text class="hero-meta__label">已用</text>
            <text class="hero-meta__value mono">¥{{ money(usage.used) }}</text>
          </view>
          <view class="hero-meta__item">
            <text class="hero-meta__label">剩余</text>
            <text class="hero-meta__value mono" :class="{ danger: usage.remaining < 0 }">¥{{ money(usage.remaining) }}</text>
          </view>
          <view class="hero-meta__item">
            <text class="hero-meta__label">日均可用</text>
            <text class="hero-meta__value mono">¥{{ money(usage.dailyAllowance) }}</text>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">预算设置</text>
          <text v-if="!editing" class="card__desc">保存后每个周期自动沿用</text>
        </view>

        <view v-if="!editing">
          <view class="setting-row">
            <text class="setting-label">总预算</text>
            <text class="setting-value mono" :class="{ 'is-unset': !usage.total }">
              {{ usage.total > 0 ? '¥' + money(usage.total) : '未设置' }}
            </text>
          </view>
          <view class="setting-divider"></view>
          <view class="setting-row">
            <text class="setting-label">周期起始日</text>
            <picker mode="selector" :range="dayOptions" :value="startDay - 1" @change="onStartDayChange">
              <view class="setting-picker">每月 {{ startDay }} 日 ›</view>
            </picker>
          </view>
          <text class="setting-hint">每月的起始日</text>

          <view class="edit-row">
            <button class="btn btn--soft btn--sm" @tap="startEdit">编辑预算</button>
          </view>
        </view>

        <view v-else>
          <view class="form-field">
            <text class="field__label">每周期总预算（元）</text>
            <input class="input" type="digit" v-model="formTotal" placeholder="例如 6000" />
          </view>

          <view class="form-field">
            <text class="field__label">周期起始日</text>
            <picker mode="selector" :range="dayOptions" :value="formStartDay - 1" @change="onFormStartDayChange">
              <view class="input picker-input">每月 {{ formStartDay }} 日</view>
            </picker>
            <text class="setting-hint">每月的起始日</text>
          </view>

          <view class="form-actions">
            <button class="btn btn--soft btn--sm" @tap="cancelEdit">取消</button>
            <button class="btn btn--primary btn--sm" :disabled="saving" @tap="saveBudget">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">分类预算</text>
          <text class="card__desc">选填，与总预算独立</text>
        </view>

        <view v-if="categoryRows.length" class="cat-list">
          <view v-for="row in categoryRows" :key="row.category.id" class="cat-row" @tap="onCatTap">
            <view class="cat-row__head">
              <view class="cat-block" :style="{ background: row.category.color }">
                <text class="cat-block__initial">{{ initial(row.category) }}</text>
              </view>
              <view class="row__main cat-row__main">
                <view class="cat-row__title">
                  <text class="row__title cat-row__name">{{ row.category.name }}</text>
                  <text v-if="!row.category.enabled" class="tag">已停用</text>
                </view>
                <text class="row__sub cat-row__sub">已用 ¥{{ money(row.spent) }}</text>
              </view>

              <text v-if="!editing" class="cat-row__budget mono" :class="{ 'is-unset': !row.limit }">
                {{ row.limit > 0 ? '预算 ¥' + money(row.limit) : '未设置' }}
              </text>
              <view v-else class="cat-row__input-wrap">
                <input
                  class="cat-input"
                  type="digit"
                  :value="catInputs[row.category.id]"
                  placeholder="未设置"
                  @input="onCatInput(row.category.id, $event)"
                />
              </view>
            </view>

            <view v-if="!editing && row.limit > 0" class="progress cat-row__bar">
              <view
                class="progress__bar"
                :style="{ width: barWidth(row.percent), background: row.category.color }"
              ></view>
            </view>
          </view>
        </view>
        <view v-else class="empty">还没有支出分类</view>
      </view>
    </view>
  </view>
</template>

<script>
import {
  state as store,
  isLoggedIn,
  currentUser,
  loadData,
  syncFromServer,
  formatMoney,
  fromCents,
  budgetUsage,
  saveBudgetAsync
} from '@/utils/store.js'

export default {
  data() {
    return {
      editing: false,
      saving: false,
      formTotal: '',
      formStartDay: 1,
      catInputs: {},
      user: null,
      syncing: false
    }
  },
  computed: {
    theme() {
      return store.theme
    },
    avatarLetter() {
      const user = this.user
      const name = user ? user.name || String(user.email || '').split('@')[0] : ''
      return String(name || 'U').slice(0, 1).toUpperCase()
    },
    usage() {
      return budgetUsage()
    },
    periodLabel() {
      return this.usage.period.label
    },
    startDay() {
      return store.budget.startDay || 1
    },
    dayOptions() {
      const list = []
      for (let day = 1; day <= 28; day += 1) list.push('每月 ' + day + ' 日')
      return list
    },
    percentLabel() {
      if (!this.usage.total) return '—'
      return Math.round(this.usage.percent) + '%'
    },
    categoryRows() {
      return this.usage.categories
    }
  },
  onLoad() {
    if (!this.ensureAuth()) return
    this.user = currentUser()
    if (!store.ready) loadData()
  },
  onShow() {
    if (!this.ensureAuth()) return
    this.user = currentUser()
    if (!store.ready) loadData()
    this.syncSilently()
  },
  methods: {
    ensureAuth() {
      if (!isLoggedIn() || !currentUser()) {
        uni.reLaunch({ url: '/pages/login/login' })
        return false
      }
      return true
    },
    async syncSilently() {
      if (this.syncing) return
      this.syncing = true
      try {
        await syncFromServer()
        this.user = currentUser()
      } catch (err) {
        /* 离线时继续使用本地缓存 */
      } finally {
        this.syncing = false
      }
    },
    toast(title) {
      uni.showToast({ title: String(title || ''), icon: 'none' })
    },
    money(cents) {
      return formatMoney(cents)
    },
    initial(category) {
      const name = category && category.name ? String(category.name) : ''
      return name.slice(0, 1)
    },
    barWidth(percent) {
      const value = Math.max(0, Math.min(100, Number(percent || 0)))
      return value + '%'
    },
    onStartDayChange(event) {
      const day = Number(event.detail.value) + 1
      if (!day || day === this.startDay) return
      this.persistBudget(this.usage.total, day, Object.assign({}, store.budget.categories), '周期已更新')
    },
    onFormStartDayChange(event) {
      this.formStartDay = Number(event.detail.value) + 1
    },
    onCatTap() {
      if (this.editing) return
      this.startEdit()
    },
    onCatInput(id, event) {
      this.catInputs[id] = event.detail.value
    },
    startEdit() {
      const inputs = {}
      this.categoryRows.forEach((row) => {
        inputs[row.category.id] = row.limit > 0 ? String(fromCents(row.limit)) : ''
      })
      this.catInputs = inputs
      this.formTotal = this.usage.total > 0 ? String(fromCents(this.usage.total)) : ''
      this.formStartDay = this.startDay
      this.editing = true
    },
    cancelEdit() {
      this.editing = false
      this.catInputs = {}
      this.formTotal = ''
    },
    saveBudget() {
      const totalRaw = String(this.formTotal || '').trim()
      const total = totalRaw ? Math.round(Number(totalRaw) * 100) : 0
      if (totalRaw && (isNaN(Number(totalRaw)) || total < 0)) {
        this.toast('请输入有效的预算金额')
        return
      }

      const categories = {}
      let invalid = false
      Object.keys(this.catInputs).forEach((id) => {
        const raw = String(this.catInputs[id] || '').trim()
        if (!raw) return
        const value = Math.round(Number(raw) * 100)
        if (isNaN(Number(raw)) || value < 0) {
          invalid = true
          return
        }
        if (value > 0) categories[id] = value
      })
      if (invalid) {
        this.toast('分类预算需为不小于 0 的数字')
        return
      }

      this.persistBudget(total, this.formStartDay, categories, '预算已保存', true)
    },
    async persistBudget(total, startDay, categories, successText, exitEdit) {
      if (this.saving) return
      this.saving = true
      try {
        await saveBudgetAsync({ total: total, startDay: startDay, categories: categories })
        this.catInputs = {}
        this.formTotal = ''
        if (exitEdit) this.editing = false
        this.toast(successText)
      } catch (err) {
        this.toast((err && err.message) || '保存失败')
      } finally {
        this.saving = false
      }
    },
    goSettings() {
      uni.switchTab({ url: '/pages/settings/settings' })
    }
  }
}
</script>

<style scoped>
  .page {
    padding-bottom: calc(var(--window-bottom, 0px) + 200rpx + env(safe-area-inset-bottom));
  }

  .btn::after {
    border: none;
  }

  .appbar-title {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .appbar-name {
    font-size: 40rpx;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text);
  }

  .appbar-sub {
    margin-top: 6rpx;
    font-size: 24rpx;
    font-weight: 400;
    color: var(--text-3);
  }

  .hero-card {
    background: linear-gradient(150deg, var(--surface), var(--brand-soft));
  }

  .hero-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .hero-main {
    flex: 1;
    min-width: 0;
  }

  .hero-label {
    display: block;
    font-size: 24rpx;
    color: var(--text-3);
  }

  .hero-total {
    display: block;
    margin-top: 8rpx;
    font-size: 48rpx;
    font-weight: 700;
    color: var(--brand-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hero-total.is-unset {
    color: var(--text-2);
  }

  .hero-percent {
    flex-shrink: 0;
    margin-left: 20rpx;
    padding: 16rpx 24rpx;
    border-radius: 24rpx;
    background: var(--surface);
    border: 1rpx solid var(--border);
    text-align: center;
  }

  .hero-percent__value {
    display: block;
    font-size: 36rpx;
    font-weight: 700;
    color: var(--brand-strong);
    line-height: 1.2;
  }

  .hero-percent__label {
    display: block;
    margin-top: 4rpx;
    font-size: 20rpx;
    color: var(--text-3);
  }

  .progress.hero-progress {
    margin-top: 28rpx;
    height: 20rpx;
  }

  .progress__bar.is-strong {
    background: var(--brand-strong);
  }

  .hero-tip {
    display: block;
    margin-top: 24rpx;
    padding: 20rpx;
    border-radius: 20rpx;
    background: var(--surface);
    font-size: 24rpx;
    color: var(--text-2);
    text-align: center;
  }

  .hero-meta {
    display: flex;
    margin-top: 24rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid var(--border);
  }

  .hero-meta__item {
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .hero-meta__item + .hero-meta__item {
    border-left: 1rpx solid var(--border);
  }

  .hero-meta__label {
    display: block;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .hero-meta__value {
    display: block;
    margin-top: 6rpx;
    font-size: 28rpx;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16rpx 0;
  }

  .setting-label {
    font-size: 26rpx;
    color: var(--text-2);
  }

  .setting-value {
    font-size: 26rpx;
    font-weight: 700;
    color: var(--text);
  }

  .setting-value.is-unset {
    color: var(--text-3);
    font-weight: 400;
  }

  .setting-picker {
    font-size: 26rpx;
    font-weight: 600;
    color: var(--brand-strong);
  }

  .setting-divider {
    height: 1rpx;
    background: var(--border);
  }

  .setting-hint {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .edit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 24rpx;
  }

  .edit-row .btn {
    padding: 0 40rpx;
  }

  .form-field {
    margin-bottom: 24rpx;
  }

  .picker-input {
    display: flex;
    align-items: center;
    color: var(--text);
  }

  .form-actions {
    display: flex;
    margin-top: 8rpx;
  }

  .form-actions .btn {
    flex: 1;
  }

  .form-actions .btn + .btn {
    margin-left: 20rpx;
  }

  .cat-list {
    display: flex;
    flex-direction: column;
  }

  .cat-row + .cat-row {
    margin-top: 20rpx;
  }

  .cat-row {
    padding: 20rpx;
    border-radius: 24rpx;
    background: var(--surface-2);
  }

  .cat-row__head {
    display: flex;
    align-items: center;
  }

  .cat-block {
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    margin-right: 16rpx;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cat-block__initial {
    color: #fff;
    font-size: 26rpx;
    font-weight: 700;
    line-height: 1;
  }

  .cat-row__main {
    flex: 1;
    min-width: 0;
  }

  .cat-row__title {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .row__title.cat-row__name {
    min-width: 0;
    font-size: 26rpx;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat-row__title .tag {
    margin-left: 10rpx;
    flex-shrink: 0;
  }

  .row__sub.cat-row__sub {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .cat-row__budget {
    margin-left: 12rpx;
    flex-shrink: 0;
    font-size: 24rpx;
    font-weight: 600;
    color: var(--text-2);
  }

  .cat-row__budget.is-unset {
    font-weight: 400;
    color: var(--text-3);
  }

  .cat-row__input-wrap {
    margin-left: 12rpx;
    flex-shrink: 0;
  }

  .cat-input {
    width: 160rpx;
    height: 56rpx;
    padding: 0 14rpx;
    border-radius: 14rpx;
    background: var(--surface);
    border: 1rpx solid var(--border);
    font-size: 24rpx;
    color: var(--text);
    text-align: right;
  }

  .progress.cat-row__bar {
    height: 12rpx;
    margin-top: 14rpx;
  }
</style>
