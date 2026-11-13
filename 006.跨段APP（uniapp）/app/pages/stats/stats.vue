<template>
  <view class="page" :class="'theme-' + theme">
    <view class="appbar">
      <view class="appbar__title appbar-title">
        <text class="appbar-name">统计</text>
        <text class="appbar__sub appbar-sub">{{ monthText }}</text>
      </view>
      <view class="avatar" @tap="goSettings">{{ avatarLetter }}</view>
    </view>

    <view class="container">
      <view class="monthbar">
        <view class="month-nav" @tap="changeMonth(-1)">
          <text class="month-nav__icon">‹</text>
        </view>
        <text class="monthbar__label mono">{{ monthText }}</text>
        <view class="month-nav" :class="{ 'is-disabled': !canGoNext }" @tap="changeMonth(1)">
          <text class="month-nav__icon">›</text>
        </view>
      </view>

      <view class="card summary-card">
        <view class="summary-grid">
          <view class="summary-item">
            <text class="summary-label">支出</text>
            <text class="summary-value expense mono">¥{{ money(summaryData.expense) }}</text>
          </view>
          <view class="summary-item">
            <text class="summary-label">收入</text>
            <text class="summary-value income mono">¥{{ money(summaryData.income) }}</text>
          </view>
          <view class="summary-item">
            <text class="summary-label">结余</text>
            <text class="summary-value mono" :class="{ danger: summaryData.balance < 0 }">{{ signedMoney(summaryData.balance) }}</text>
          </view>
        </view>

        <view class="summary-meta">
          <text class="muted small">本月 {{ summaryData.count }} 笔</text>
          <text class="muted small">日均支出 ¥{{ money(summaryData.dailyAvg) }}</text>
        </view>
        <text class="mom-line small" :class="momClass">{{ momText }}</text>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">{{ breakdownTitle }}</text>
          <view class="segment breakdown-tabs">
            <view
              class="segment__item"
              :class="{ 'is-active': breakdownType === 'expense' }"
              @tap="switchBreakdown('expense')"
            >支出</view>
            <view
              class="segment__item"
              :class="{ 'is-active': breakdownType === 'income' }"
              @tap="switchBreakdown('income')"
            >收入</view>
          </view>
        </view>

        <view v-if="breakdownRows.length" class="breakdown-list">
          <view v-for="row in breakdownRows" :key="row.category.id" class="breakdown-row">
            <view class="breakdown-row__head">
              <view class="breakdown-row__dot" :style="{ background: row.category.color }"></view>
              <text class="breakdown-row__name">{{ row.category.name }}</text>
              <text class="breakdown-row__amount mono">¥{{ money(row.amount) }}</text>
              <text class="breakdown-row__percent mono">{{ percentText(row.percent) }}</text>
            </view>
            <view class="progress breakdown-row__bar">
              <view
                class="progress__bar"
                :style="{ width: barWidth(row.percent), background: row.category.color }"
              ></view>
            </view>
          </view>
        </view>
        <view v-else class="empty">{{ emptyText }}</view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">近 6 个月趋势</text>
          <view class="legend">
            <view class="legend__dot"></view>
            <text class="legend__text">支出最高 ¥{{ money(trendMax) }}</text>
          </view>
        </view>

        <view class="trend">
          <view
            v-for="item in trendData"
            :key="item.key"
            class="trend__col"
            :class="{ 'is-active': item.key === month }"
          >
            <view class="trend__bars">
              <view class="trend__bar" :style="{ height: barHeight(item.expense) }"></view>
            </view>
            <text class="trend__label">{{ item.label }}</text>
          </view>
        </view>
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
  todayISO,
  monthLabel,
  shiftMonth,
  formatMoney,
  summary,
  breakdown,
  trend,
  comparison
} from '@/utils/store.js'

export default {
  data() {
    const current = todayISO().slice(0, 7)
    return {
      month: current,
      currentMonth: current,
      breakdownType: 'expense',
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
    monthText() {
      return monthLabel(this.month)
    },
    canGoNext() {
      return this.month < this.currentMonth
    },
    summaryData() {
      return summary(this.month)
    },
    comparisonData() {
      return comparison(this.month)
    },
    momText() {
      const value = this.comparisonData.expensePercent
      if (value == null) return '上月暂无支出记录，无法对比'
      if (value === 0) return '支出与上月持平'
      const word = value > 0 ? '增加' : '减少'
      return '支出较上月' + word + ' ' + Math.abs(value).toFixed(1) + '%'
    },
    momClass() {
      const value = this.comparisonData.expensePercent
      if (value == null || value === 0) return 'muted'
      return value > 0 ? 'danger' : 'income'
    },
    breakdownTitle() {
      return this.breakdownType === 'expense' ? '支出构成' : '收入构成'
    },
    breakdownRows() {
      return breakdown(this.month, this.breakdownType)
    },
    emptyText() {
      if (!this.summaryData.count) return '这个月还没有数据'
      return '本月还没有' + (this.breakdownType === 'expense' ? '支出' : '收入') + '记录'
    },
    trendData() {
      return trend(this.month, 6).map((item) => ({
        key: item.key,
        expense: item.expense,
        label: Number(String(item.key).slice(5, 7)) + '月'
      }))
    },
    trendMax() {
      return this.trendData.reduce((max, item) => Math.max(max, item.expense), 0)
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
    money(cents) {
      return formatMoney(cents)
    },
    signedMoney(cents) {
      const value = Number(cents || 0)
      return (value < 0 ? '-¥' : '¥') + formatMoney(Math.abs(value))
    },
    percentText(percent) {
      return Number(percent || 0).toFixed(1) + '%'
    },
    barWidth(percent) {
      const value = Math.max(0, Math.min(100, Number(percent || 0)))
      return value + '%'
    },
    barHeight(cents) {
      const value = Number(cents || 0)
      if (!value) return '6rpx'
      const max = this.trendMax || 1
      return Math.max(8, Math.round((value / max) * 240)) + 'rpx'
    },
    changeMonth(delta) {
      if (delta > 0 && !this.canGoNext) return
      this.month = shiftMonth(this.month, delta)
    },
    switchBreakdown(type) {
      this.breakdownType = type
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

  .monthbar {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8rpx 0 24rpx;
  }

  .month-nav {
    width: 68rpx;
    height: 68rpx;
    border-radius: 50%;
    background: var(--surface);
    border: 1rpx solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .month-nav.is-disabled {
    opacity: 0.35;
  }

  .month-nav__icon {
    font-size: 40rpx;
    line-height: 1;
    color: var(--text-2);
    margin-top: -4rpx;
  }

  .monthbar__label {
    min-width: 240rpx;
    text-align: center;
    font-size: 32rpx;
    font-weight: 700;
    color: var(--text);
  }

  .summary-card {
    padding: 28rpx 24rpx;
  }

  .summary-grid {
    display: flex;
  }

  .summary-item {
    flex: 1;
    min-width: 0;
    text-align: center;
    padding: 4rpx 8rpx;
  }

  .summary-item + .summary-item {
    border-left: 1rpx solid var(--border);
  }

  .summary-label {
    display: block;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .summary-value {
    display: block;
    margin-top: 8rpx;
    font-size: 34rpx;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 24rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid var(--border);
  }

  .mom-line {
    display: block;
    margin-top: 12rpx;
  }

  .breakdown-tabs {
    width: 240rpx;
  }

  .breakdown-tabs .segment__item {
    height: 56rpx;
    line-height: 56rpx;
    font-size: 24rpx;
  }

  .breakdown-list {
    display: flex;
    flex-direction: column;
  }

  .breakdown-row + .breakdown-row {
    margin-top: 24rpx;
  }

  .breakdown-row__head {
    display: flex;
    align-items: center;
  }

  .breakdown-row__dot {
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .breakdown-row__name {
    flex: 1;
    min-width: 0;
    margin-left: 12rpx;
    font-size: 26rpx;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .breakdown-row__amount {
    margin-left: 12rpx;
    font-size: 26rpx;
    font-weight: 700;
    color: var(--text);
  }

  .breakdown-row__percent {
    width: 100rpx;
    margin-left: 8rpx;
    text-align: right;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .progress.breakdown-row__bar {
    height: 12rpx;
    margin-top: 10rpx;
  }

  .legend {
    display: flex;
    align-items: center;
  }

  .legend__dot {
    width: 12rpx;
    height: 12rpx;
    border-radius: 50%;
    background: var(--brand);
    margin-right: 8rpx;
  }

  .legend__text {
    font-size: 22rpx;
    color: var(--text-3);
  }

  .trend {
    display: flex;
    align-items: flex-end;
    padding-top: 16rpx;
  }

  .trend__col + .trend__col {
    margin-left: 12rpx;
  }

  .trend__col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8rpx 0;
    border-radius: 20rpx;
  }

  .trend__col.is-active {
    background: var(--brand-soft);
  }

  .trend__bars {
    width: 100%;
    height: 240rpx;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .trend__bar {
    width: 36rpx;
    min-height: 6rpx;
    border-radius: 999rpx 999rpx 6rpx 6rpx;
    background: var(--brand);
  }

  .trend__col.is-active .trend__bar {
    background: var(--brand-strong);
  }

  .trend__label {
    margin-top: 10rpx;
    font-size: 22rpx;
    color: var(--text-3);
    white-space: nowrap;
  }

  .trend__col.is-active .trend__label {
    color: var(--brand-strong);
    font-weight: 700;
  }
</style>
