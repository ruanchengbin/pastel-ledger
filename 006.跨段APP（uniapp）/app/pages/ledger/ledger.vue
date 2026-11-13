<template>
  <view class="page" :class="'theme-' + theme">
    <view class="appbar appbar--with-avatar">
      <view class="appbar-left">
        <view class="avatar" @tap="goSettings">{{ avatarLetter }}</view>
      </view>
      <view class="appbar__title appbar-title appbar-center">
        <text class="appbar-name">流水</text>
        <text class="appbar__sub appbar-sub">{{ appbarSub }}</text>
      </view>
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

      <view v-if="accounts.length > 1" class="account-filter">
        <scroll-view class="account-filter__scroll" scroll-x>
          <view class="account-filter__inner">
            <view
              class="acc-chip"
              :class="{ 'is-active': accountFilter === '__all__' }"
              @tap="selectAccount('__all__')"
            >全部关联账户</view>
            <view
              v-for="acc in accounts"
              :key="acc.email"
              class="acc-chip"
              :class="{ 'is-active': accountFilter === normEmail(acc.email) }"
              @tap="selectAccount(normEmail(acc.email))"
            >{{ accountLabel(acc) }}</view>
          </view>
        </scroll-view>
      </view>

      <view class="card summary-card">
        <view class="card__head">
          <text class="card__title">本月概览</text>
          <text v-if="accountInfo" class="summary-account muted small">{{ accountInfo }}</text>
        </view>
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
      </view>

      <view v-if="groups.length" class="tx-groups">
        <!-- 明细区域单独滚动，页面本身不滚动 -->
        <scroll-view
          class="tx-scroll"
          scroll-y
          refresher-enabled
          :refresher-triggered="refreshing"
          :lower-threshold="80"
          :scroll-into-view="scrollInto"
          @refresherrefresh="onRefresh"
          @scrolltolower="loadMore"
        >
          <view id="list-top" class="tx-scroll__inner">
            <view v-for="group in groups" :key="group.date" class="day-group">
              <view class="day-group__head">
                <text class="day-group__date">{{ group.title }}</text>
                <text class="day-group__total mono">支出 ¥{{ money(group.expense) }}</text>
              </view>
              <view class="tx-list">
                <view
                  v-for="row in group.items"
                  :key="row.id"
                  class="tx-row"
                  :class="{ 'tx-row--readonly': row.readonly }"
                  @tap="openTx(row)"
                >
                  <view class="tx-row__icon" :style="{ background: row.category.color }">
                    <text class="tx-row__initial">{{ row.category.initial }}</text>
                  </view>
                  <view class="tx-row__main">
                    <view class="tx-row__title">
                      <text class="tx-row__cat">{{ row.category.name }}</text>
                      <text v-if="row.owner" class="tag tx-row__owner">{{ row.owner }}</text>
                    </view>
                    <text v-if="row.note" class="tx-row__note">{{ row.note }}</text>
                  </view>
                  <view class="tx-row__side">
                    <text
                      class="tx-row__amount mono"
                      :class="row.type === 'income' ? 'income' : 'expense'"
                    >{{ row.type === 'income' ? '+' : '' }}¥{{ money(row.amount) }}</text>
                  </view>
                </view>
              </view>
            </view>

            <view class="list-more">
              <text v-if="loadingMore" class="muted small">加载中…</text>
              <text v-else-if="hasMore" class="muted small">上滑加载更多</text>
              <text v-else class="muted small">已经到底啦 · 共 {{ filteredTransactions.length }} 笔</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <view v-else class="empty empty-ledger">
        <view class="empty-illus">
          <text class="empty-illus__symbol">¥</text>
        </view>
        <text class="empty-title">这个月还没有记账</text>
        <text class="empty-desc">记录第一笔收支，月底就能看到完整的结余。</text>
        <button class="btn btn--primary empty-btn" @tap="goRecord">记一笔</button>
      </view>
    </view>

    <view class="fab" @tap="goRecord">
      <text class="fab__plus">+</text>
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
  transactionsOfMonth as storeTransactionsOfMonth,
  monthLabel as storeMonthLabel,
  shiftMonth as storeShiftMonth,
  todayISO,
  formatMoney as storeFormatMoney,
  categoryById as storeCategoryById,
  visibleAccounts as storeVisibleAccounts,
  accountLabel as storeAccountLabel
} from '@/utils/store.js'

const PAGE_SIZE = 20
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default {
  data() {
    const current = todayISO().slice(0, 7)
    return {
      month: current,
      currentMonth: current,
      accountFilter: '__all__',
      visibleCount: PAGE_SIZE,
      loadingMore: false,
      refreshing: false,
      scrollInto: '',
      user: null,
      syncing: false
    }
  },
  computed: {
    theme() {
      return store.theme
    },
    accounts() {
      return storeVisibleAccounts()
    },
    myEmail() {
      return this.user && this.user.email ? String(this.user.email).toLowerCase() : ''
    },
    avatarLetter() {
      const user = this.user
      const name = user ? user.name || String(user.email || '').split('@')[0] : ''
      return String(name || 'U').slice(0, 1).toUpperCase()
    },
    monthText() {
      return storeMonthLabel(this.month)
    },
    canGoNext() {
      return this.month < this.currentMonth
    },
    monthTransactions() {
      return storeTransactionsOfMonth(this.month).slice().sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return String(a.createdAt || '') < String(b.createdAt || '') ? 1 : -1
      })
    },
    filteredTransactions() {
      if (this.accountFilter === '__all__') return this.monthTransactions
      return this.monthTransactions.filter((tx) => this.ownerEmailOf(tx) === this.accountFilter)
    },
    summaryData() {
      let expense = 0
      let income = 0
      this.filteredTransactions.forEach((tx) => {
        if (tx.type === 'income') income += tx.amount
        else expense += tx.amount
      })
      return {
        expense: expense,
        income: income,
        balance: income - expense,
        count: this.filteredTransactions.length
      }
    },
    appbarSub() {
      return this.monthText + ' · ' + this.summaryData.count + ' 笔记录'
    },
    accountInfo() {
      const accounts = this.accounts
      if (accounts.length <= 1) return ''
      if (this.accountFilter === '__all__') return '全部 ' + accounts.length + ' 个账户'
      const picked = accounts.filter((acc) => this.normEmail(acc.email) === this.accountFilter)[0]
      const label = picked ? picked.name || picked.email : this.accountFilter
      return '· ' + label
    },
    visibleTransactions() {
      return this.filteredTransactions.slice(0, this.visibleCount)
    },
    hasMore() {
      return this.filteredTransactions.length > this.visibleCount
    },
    groups() {
      const map = {}
      const order = []
      this.visibleTransactions.forEach((tx) => {
        if (!map[tx.date]) {
          map[tx.date] = { date: tx.date, expense: 0, items: [] }
          order.push(tx.date)
        }
        map[tx.date].items.push(tx)
        if (tx.type !== 'income') map[tx.date].expense += tx.amount
      })
      return order.map((date) => {
        const group = map[date]
        return {
          date: date,
          title: this.dayTitle(date),
          expense: group.expense,
          items: group.items.map((tx) => ({
            id: tx.id,
            type: tx.type,
            amount: tx.amount,
            note: tx.note || '',
            readonly: !!tx.readonly,
            category: this.resolveCategory(tx),
            owner: this.ownerTag(tx)
          }))
        }
      })
    }
  },
  onLoad() {
    if (!isLoggedIn() || !currentUser()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    this.user = currentUser()
    const current = todayISO().slice(0, 7)
    this.currentMonth = current
    this.month = current
    if (!store.ready) loadData()
    this.ensureAccountFilter()
  },
  onShow() {
    if (!isLoggedIn() || !currentUser()) return
    this.user = currentUser()
    if (!store.ready) loadData()
    this.syncSilently()
  },
  onReachBottom() {
    this.loadMore()
  },
  async onPullDownRefresh() {
    await this.onRefresh()
  },
  methods: {
    toast(title) {
      uni.showToast({ title: String(title || ''), icon: 'none' })
    },
    normEmail(email) {
      return String(email || '').toLowerCase()
    },
    ownerEmailOf(tx) {
      if (tx.ownerEmail) return this.normEmail(tx.ownerEmail)
      return this.myEmail
    },
    ownerTag(tx) {
      const owner = tx.ownerEmail ? this.normEmail(tx.ownerEmail) : ''
      if (!owner || owner === this.myEmail) return ''
      return tx.ownerName || tx.ownerEmail || ''
    },
    resolveCategory(tx) {
      let category = storeCategoryById(tx.categoryId)
      if (!category && (tx.categoryName || tx.categoryColor)) {
        category = {
          name: tx.categoryName || '未分类',
          color: tx.categoryColor || '#8A849D'
        }
      }
      if (!category) category = { name: '未分类', color: '#8A849D' }
      const name = category.name || '未分类'
      return {
        name: name,
        color: category.color || '#8A849D',
        initial: name.slice(0, 1)
      }
    },
    dayTitle(date) {
      const parts = String(date).split('-')
      const parsed = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      let title = Number(parts[1]) + '月' + Number(parts[2]) + '日 ' + WEEKDAYS[parsed.getDay()]
      if (date === todayISO()) title += ' · 今天'
      return title
    },
    money(cents) {
      return storeFormatMoney(cents)
    },
    signedMoney(cents) {
      const value = Number(cents || 0)
      return (value < 0 ? '-¥' : '¥') + storeFormatMoney(Math.abs(value))
    },
    accountLabel(account) {
      return storeAccountLabel(account)
    },
    changeMonth(delta) {
      if (delta > 0 && !this.canGoNext) return
      this.month = storeShiftMonth(this.month, delta)
      this.visibleCount = PAGE_SIZE
      this.resetScroll()
    },
    selectAccount(email) {
      if (this.accountFilter === email) return
      this.accountFilter = email
      this.visibleCount = PAGE_SIZE
      this.resetScroll()
    },
    // 下拉刷新（scroll-view 自带 refresher）
    async onRefresh() {
      if (this.refreshing) return
      this.refreshing = true
      try {
        await syncFromServer()
        this.user = currentUser()
        this.visibleCount = PAGE_SIZE
        this.ensureAccountFilter()
        this.resetScroll()
      } catch (err) {
        this.toast((err && err.message) || '同步失败，请稍后重试')
      } finally {
        this.refreshing = false
        uni.stopPullDownRefresh()
      }
    },
    // 明细区域滚动：触底再加载 20 条
    loadMore() {
      if (!this.hasMore || this.loadingMore) return
      this.loadingMore = true
      setTimeout(() => {
        this.visibleCount += PAGE_SIZE
        this.loadingMore = false
      }, 150)
    },
    // 切换月份/账户后把明细滚回顶部
    resetScroll() {
      this.scrollInto = ''
      this.$nextTick(() => {
        this.scrollInto = 'list-top'
        setTimeout(() => {
          this.scrollInto = ''
        }, 300)
      })
    },
    ensureAccountFilter() {
      if (this.accountFilter === '__all__') return
      const valid = this.accounts.some((acc) => this.normEmail(acc.email) === this.accountFilter)
      if (!valid) this.accountFilter = '__all__'
    },
    async syncSilently() {
      if (this.syncing) return
      this.syncing = true
      try {
        await syncFromServer()
        this.user = currentUser()
        this.ensureAccountFilter()
      } catch (err) {
        /* 离线时继续使用本地缓存 */
      } finally {
        this.syncing = false
      }
    },
    openTx(row) {
      if (row.readonly) {
        this.toast('关联账户流水仅可查看')
        return
      }
      uni.navigateTo({ url: '/pages/record/record?id=' + encodeURIComponent(row.id) })
    },
    goRecord() {
      uni.navigateTo({ url: '/pages/record/record' })
    },
    goSettings() {
      uni.switchTab({ url: '/pages/settings/settings' })
    }
  }
}
</script>

<style scoped>
  /* 页面不整体滚动：头部固定，只有明细区域滚动 */
  .page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: 0;
  }

  .container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .tx-scroll {
    flex: 1;
    height: 0;
    width: 100%;
    min-height: 0;
  }

  /* 头部区域不参与伸缩，保证不被挤压 */
  .appbar,
  .monthbar,
  .account-filter,
  .summary-card {
    flex-shrink: 0;
  }

  .tx-scroll__inner {
    padding: 8rpx 0 calc(200rpx + env(safe-area-inset-bottom));
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

  .account-filter {
    margin-bottom: 24rpx;
  }

  .account-filter__scroll {
    width: 100%;
    height: 68rpx;
    white-space: nowrap;
  }

  .account-filter__inner {
    display: inline-block;
    white-space: nowrap;
    padding: 4rpx 0;
  }

  .acc-chip {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    height: 60rpx;
    padding: 0 28rpx;
    margin-right: 16rpx;
    border-radius: 999rpx;
    background: var(--surface);
    border: 1rpx solid var(--border);
    color: var(--text-2);
    font-size: 24rpx;
    font-weight: 600;
    white-space: nowrap;
  }

  .acc-chip.is-active {
    background: var(--brand);
    border-color: var(--brand);
    color: #fff;
  }

  .summary-card {
    padding: 28rpx 24rpx;
  }

  .summary-account {
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    font-size: 32rpx;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-groups {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 8rpx;
  }

  .day-group + .day-group {
    margin-top: 32rpx;
  }

  .day-group__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 8rpx 12rpx;
  }

  .day-group__date {
    font-size: 24rpx;
    font-weight: 600;
    color: var(--text-2);
  }

  .day-group__total {
    font-size: 22rpx;
    color: var(--text-3);
  }

  .tx-list {
    display: flex;
    flex-direction: column;
  }

  .tx-row {
    display: flex;
    align-items: center;
    padding: 24rpx;
    margin-bottom: 12rpx;
    border-radius: 24rpx;
    border: 1rpx solid var(--border);
    background: var(--surface);
  }

  .tx-row:active {
    background: var(--surface-2);
  }

  .tx-row--readonly {
    opacity: 0.7;
  }

  .tx-row__icon {
    width: 76rpx;
    height: 76rpx;
    border-radius: 50%;
    margin-right: 20rpx;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tx-row__initial {
    color: #fff;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1;
  }

  .tx-row__main {
    flex: 1;
    min-width: 0;
  }

  .tx-row__title {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .tx-row__cat {
    min-width: 0;
    font-size: 28rpx;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-row__owner {
    margin-left: 10rpx;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tx-row__note {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-row__side {
    margin-left: 16rpx;
    flex-shrink: 0;
    text-align: right;
  }

  .tx-row__amount {
    font-size: 30rpx;
    font-weight: 700;
    white-space: nowrap;
  }

  .list-more {
    padding: 16rpx 0 8rpx;
    text-align: center;
  }

  .empty-ledger {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 80rpx 24rpx 40rpx;
  }

  .empty-illus {
    width: 160rpx;
    height: 160rpx;
    border-radius: 50%;
    background: var(--brand-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 28rpx;
  }

  .empty-illus__symbol {
    font-size: 64rpx;
    font-weight: 700;
    color: var(--brand-strong);
  }

  .empty-title {
    font-size: 30rpx;
    font-weight: 700;
    color: var(--text-2);
  }

  .empty-desc {
    margin-top: 10rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: var(--text-3);
    text-align: center;
  }

  .empty-btn {
    display: inline-block;
    width: auto;
    margin-top: 32rpx;
    padding: 0 56rpx;
  }

  .empty-btn::after {
    border: none;
  }

  .fab {
    position: fixed;
    right: 40rpx;
    bottom: calc(var(--window-bottom, 0px) + 40rpx + env(safe-area-inset-bottom));
    width: 108rpx;
    height: 108rpx;
    border-radius: 50%;
    background: var(--brand);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12rpx 28rpx -8rpx var(--brand-strong);
    z-index: 20;
  }

  .fab__plus {
    color: #fff;
    font-size: 60rpx;
    font-weight: 300;
    line-height: 1;
    margin-top: -6rpx;
  }
</style>
