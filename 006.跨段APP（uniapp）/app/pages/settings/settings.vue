<template>
  <view class="page" :class="'theme-' + theme">
    <view class="appbar">
      <view class="appbar__title appbar-title">
        <text class="appbar-name">设置</text>
        <text class="appbar__sub appbar-sub">账号与偏好</text>
      </view>
      <view class="avatar">{{ avatarLetter }}</view>
    </view>

    <view class="container">
      <view class="card">
        <view class="card__head">
          <text class="card__title">账号</text>
          <text class="card__desc">头像显示名字首字</text>
        </view>

        <view class="account-head">
          <view class="avatar account-avatar">{{ avatarLetter }}</view>
          <view class="account-main">
            <text class="account-email">{{ user ? user.email : '—' }}</text>
            <text class="row__sub">{{ sinceLabel }}</text>
          </view>
        </view>

        <view class="field">
          <text class="field__label">名字</text>
          <view class="row-in-row">
            <input
              class="input"
              v-model="nameInput"
              maxlength="20"
              placeholder="显示在头像与关联账户中"
            />
            <button class="btn btn--soft btn--sm" :disabled="savingName" @tap="saveName">
              {{ savingName ? '保存中…' : '保存' }}
            </button>
          </view>
          <text class="field-hint muted small">头像会显示名字的第一个字；关联账户在流水中也能看到这个名字。</text>
        </view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">关联账户</text>
          <text class="card__desc">{{ acceptedLinks.length }} 个已关联</text>
        </view>

        <view class="field">
          <text class="field__label">向另一个账户发送关联请求</text>
          <view class="row-in-row">
            <input
              class="input"
              v-model="linkEmail"
              maxlength="120"
              placeholder="对方的邮箱地址"
            />
            <button class="btn btn--primary btn--sm" :disabled="sendingLink" @tap="sendLink">
              {{ sendingLink ? '发送中…' : '发送关联请求' }}
            </button>
          </view>
          <text class="field-hint muted small">双方都确认关联后，可在流水页一起查看各账户的流水。对方账户数据仅可读。</text>
        </view>

        <view v-if="!linksLoaded" class="empty">正在加载关联账户…</view>
        <view v-else-if="!pendingLinks.length && !acceptedLinks.length" class="empty">
          还没有关联账户，输入对方邮箱发起请求吧
        </view>
        <view v-else class="link-groups">
          <view v-if="pendingLinks.length" class="link-group">
            <text class="link-group__title">待确认</text>
            <view class="list link-list">
              <view v-for="item in pendingLinks" :key="item.id" class="list__row link-row">
                <view class="link-avatar">
                  <text class="link-avatar__text">{{ partnerInitial(item) }}</text>
                </view>
                <view class="row__main link-main">
                  <text class="row__title link-name">{{ partnerName(item) }}</text>
                  <text class="row__sub link-sub">{{ partnerSub(item) }}</text>
                </view>
                <view class="link-actions">
                  <button
                    v-if="item.direction === 'incoming'"
                    class="btn btn--primary btn--sm"
                    :disabled="busyLinkId === item.id"
                    @tap="runLinkAction(item, 'accept')"
                  >接受</button>
                  <button
                    v-if="item.direction === 'incoming'"
                    class="btn btn--ghost btn--sm"
                    :disabled="busyLinkId === item.id"
                    @tap="runLinkAction(item, 'reject')"
                  >拒绝</button>
                  <button
                    v-else
                    class="btn btn--ghost btn--sm"
                    :disabled="busyLinkId === item.id"
                    @tap="runLinkAction(item, 'cancel')"
                  >取消请求</button>
                </view>
              </view>
            </view>
          </view>

          <view v-if="acceptedLinks.length" class="link-group">
            <text class="link-group__title">已关联</text>
            <view class="list link-list">
              <view v-for="item in acceptedLinks" :key="item.id" class="list__row link-row">
                <view class="link-avatar">
                  <text class="link-avatar__text">{{ partnerInitial(item) }}</text>
                </view>
                <view class="row__main link-main">
                  <text class="row__title link-name">{{ partnerName(item) }}</text>
                  <text class="row__sub link-sub">{{ partnerSub(item) }}</text>
                </view>
                <view class="link-actions">
                  <button
                    class="btn btn--ghost btn--sm"
                    :disabled="busyLinkId === item.id"
                    @tap="confirmRevoke(item)"
                  >解除关联</button>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">外观</text>
          <text class="card__desc">切换后立即生效</text>
        </view>
        <view class="theme-grid">
          <view
            v-for="t in themes"
            :key="t"
            class="theme-card"
            :class="{ 'is-active': theme === t }"
            @tap="selectTheme(t)"
          >
            <view class="theme-swatch" :style="{ background: themeMeta[t].color }"></view>
            <text class="theme-name">{{ themeMeta[t].name }}</text>
            <text class="theme-desc">{{ themeMeta[t].desc }}</text>
            <text v-if="theme === t" class="theme-check">✓</text>
          </view>
        </view>
        <text class="field-hint muted small">默认主题为马卡龙紫，切换后立即生效并保存在当前设备。</text>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">账本</text>
          <text class="card__desc">分类与偏好</text>
        </view>
        <view class="list">
          <view class="list__row link-row" @tap="goCategories">
            <view class="link-avatar brand-avatar">
              <text class="link-avatar__text">分</text>
            </view>
            <view class="row__main link-main">
              <text class="row__title">分类管理</text>
              <text class="row__sub">管理支出与收入分类、颜色与顺序</text>
            </view>
            <text class="chevron">›</text>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">数据</text>
          <text class="card__desc">本月概览</text>
        </view>
        <view class="stats-grid">
          <view class="stat">
            <text class="stat__value mono">{{ categoryCount }}</text>
            <text class="stat__label">分类数</text>
          </view>
          <view class="stat">
            <text class="stat__value mono">{{ monthCount }}</text>
            <text class="stat__label">本月流水笔数</text>
          </view>
          <view class="stat">
            <text class="stat__value mono">¥{{ monthExpense }}</text>
            <text class="stat__label">本月支出</text>
          </view>
          <view class="stat">
            <text class="stat__value mono">¥{{ monthIncome }}</text>
            <text class="stat__label">本月收入</text>
          </view>
        </view>
      </view>

      <button class="btn btn--ghost full-btn" :disabled="accountBusy" @tap="confirmLogout">退出登录</button>
      <button class="btn btn--danger full-btn danger-btn" :disabled="accountBusy" @tap="confirmDeleteAccount">
        注销账户
      </button>
      <text class="danger-hint muted small">注销将永久删除该账号下的全部流水、分类与预算。</text>
    </view>
  </view>
</template>

<script>
import {
  state as store,
  isLoggedIn,
  currentUser,
  loadData,
  fetchMeAsync,
  updateNameAsync,
  updateThemeAsync,
  setTheme,
  logout,
  deleteAccount,
  listLinksAsync,
  requestLinkAsync,
  acceptLinkAsync,
  rejectLinkAsync,
  cancelLinkAsync,
  revokeLinkAsync,
  THEMES,
  THEME_META,
  transactionsOfMonth,
  formatMoney,
  todayISO
} from '@/utils/store.js'

export default {
  data() {
    return {
      user: null,
      nameInput: '',
      savingName: false,
      linkEmail: '',
      sendingLink: false,
      links: [],
      linksLoaded: false,
      busyLinkId: '',
      accountBusy: false
    }
  },
  computed: {
    theme() {
      return store.theme
    },
    themes() {
      return THEMES
    },
    themeMeta() {
      return THEME_META
    },
    avatarLetter() {
      const user = this.user
      const name = user ? user.name || String(user.email || '').split('@')[0] : ''
      return String(name || 'U').slice(0, 1).toUpperCase()
    },
    sinceLabel() {
      const createdAt = this.user && this.user.createdAt
      return createdAt ? '注册于 ' + String(createdAt).slice(0, 10) : '注册时间未知'
    },
    pendingLinks() {
      return this.links.filter((item) => item.status === 'pending')
    },
    acceptedLinks() {
      return this.links.filter((item) => item.status === 'accepted')
    },
    categoryCount() {
      return store.categories.length
    },
    monthStats() {
      const list = transactionsOfMonth(todayISO().slice(0, 7))
      let expense = 0
      let income = 0
      list.forEach((tx) => {
        if (tx.type === 'income') income += tx.amount
        else expense += tx.amount
      })
      return { count: list.length, expense: expense, income: income }
    },
    monthCount() {
      return this.monthStats.count
    },
    monthExpense() {
      return formatMoney(this.monthStats.expense)
    },
    monthIncome() {
      return formatMoney(this.monthStats.income)
    }
  },
  onLoad() {
    if (!isLoggedIn() || !currentUser()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    if (!store.ready) loadData()
    this.user = currentUser()
    this.nameInput = this.user.name || ''
    this.loadLinks()
  },
  onShow() {
    if (!isLoggedIn() || !currentUser()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    if (!store.ready) loadData()
    this.user = currentUser()
    this.nameInput = this.user.name || ''
    this.refreshMe()
  },
  methods: {
    toast(title) {
      uni.showToast({ title: String(title || ''), icon: 'none' })
    },
    async refreshMe() {
      try {
        const user = await fetchMeAsync()
        this.user = user
        this.nameInput = user.name || ''
      } catch (err) {
        /* 后端失败时继续使用本地缓存 */
      }
    },
    async saveName() {
      const name = String(this.nameInput || '').trim()
      if (!name) {
        this.toast('请输入名字')
        return
      }
      if (this.savingName) return
      this.savingName = true
      try {
        const saved = await updateNameAsync(name)
        this.user = currentUser()
        this.nameInput = saved || name
        this.toast('名字已保存：' + (saved || name))
      } catch (err) {
        this.toast((err && err.message) || '保存名字失败')
      } finally {
        this.savingName = false
      }
    },
    partnerName(item) {
      const partner = item.partner || {}
      return partner.name || partner.email || '未知账户'
    },
    partnerSub(item) {
      const partner = item.partner || {}
      const status = this.statusText(item)
      return partner.name && partner.email ? partner.email + ' · ' + status : status
    },
    partnerInitial(item) {
      const partner = item.partner || {}
      return String(partner.name || partner.email || '?').slice(0, 1).toUpperCase()
    },
    statusText(item) {
      if (item.status === 'accepted') return '已关联'
      if (item.status === 'pending') return item.direction === 'incoming' ? '待你确认' : '等待对方确认'
      if (item.status === 'rejected') return '对方已拒绝'
      if (item.status === 'cancelled') return '已取消'
      if (item.status === 'revoked') return '已解除'
      return item.status || ''
    },
    async loadLinks() {
      try {
        const items = await listLinksAsync()
        this.links = items || []
      } catch (err) {
        this.links = []
        this.toast((err && err.message) || '关联账户加载失败')
      } finally {
        this.linksLoaded = true
      }
    },
    async sendLink() {
      const email = String(this.linkEmail || '').trim().toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.toast('请输入有效邮箱')
        return
      }
      if (this.sendingLink) return
      this.sendingLink = true
      try {
        const items = await requestLinkAsync(email)
        this.links = items || []
        this.linksLoaded = true
        this.linkEmail = ''
        this.toast('请求已发送')
      } catch (err) {
        this.toast((err && err.message) || '发送失败')
      } finally {
        this.sendingLink = false
      }
    },
    async runLinkAction(item, action) {
      if (this.busyLinkId) return
      this.busyLinkId = item.id
      try {
        let items = null
        if (action === 'accept') items = await acceptLinkAsync(item.id)
        else if (action === 'reject') items = await rejectLinkAsync(item.id)
        else if (action === 'cancel') items = await cancelLinkAsync(item.id)
        else if (action === 'revoke') items = await revokeLinkAsync(item.id)
        if (items) {
          this.links = items
          this.linksLoaded = true
          this.toast('操作已完成')
        }
      } catch (err) {
        this.toast((err && err.message) || '操作失败')
      } finally {
        this.busyLinkId = ''
      }
    },
    confirmRevoke(item) {
      uni.showModal({
        title: '解除与 ' + this.partnerName(item) + ' 的关联？',
        content: '解除后双方将不再在流水页看到彼此的账户。',
        confirmText: '解除',
        success: (res) => {
          if (res.confirm) this.runLinkAction(item, 'revoke')
        }
      })
    },
    async selectTheme(next) {
      if (next === this.theme) return
      try {
        await updateThemeAsync(next)
        this.user = currentUser()
      } catch (err) {
        setTheme(next)
        this.toast('服务器未响应，已在本机生效')
      }
    },
    goCategories() {
      uni.navigateTo({ url: '/pages/categories/categories' })
    },
    confirmLogout() {
      uni.showModal({
        title: '退出登录？',
        content: '本地数据将保留，下次登录可继续使用。',
        confirmText: '退出',
        success: async (res) => {
          if (!res.confirm || this.accountBusy) return
          this.accountBusy = true
          try {
            await logout()
            uni.reLaunch({ url: '/pages/login/login' })
          } catch (err) {
            this.toast((err && err.message) || '退出失败')
          } finally {
            this.accountBusy = false
          }
        }
      })
    },
    confirmDeleteAccount() {
      uni.showModal({
        title: '注销账户',
        content: '注销后将永久删除账户与所有流水、分类和预算，且无法恢复。',
        confirmText: '注销',
        success: async (res) => {
          if (!res.confirm || this.accountBusy) return
          this.accountBusy = true
          try {
            await deleteAccount()
            uni.reLaunch({ url: '/pages/login/login' })
          } catch (err) {
            this.toast((err && err.message) || '注销失败')
          } finally {
            this.accountBusy = false
          }
        }
      })
    }
  }
}
</script>

<style scoped>
  .page {
    padding-bottom: calc(var(--window-bottom, 0px) + 140rpx + env(safe-area-inset-bottom));
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

  .account-head {
    display: flex;
    align-items: center;
    margin-bottom: 28rpx;
  }

  .account-avatar {
    flex-shrink: 0;
  }

  .account-main {
    flex: 1;
    min-width: 0;
    margin-left: 24rpx;
  }

  .account-email {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-hint {
    display: block;
    margin-top: 12rpx;
    line-height: 1.5;
  }

  .link-groups {
    margin-top: 8rpx;
  }

  .link-group + .link-group {
    margin-top: 28rpx;
  }

  .link-group__title {
    display: block;
    margin-bottom: 12rpx;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .link-list {
    background: var(--surface-2);
    border-radius: 24rpx;
  }

  .link-row {
    padding: 24rpx;
  }

  .link-avatar {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: var(--brand-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 18rpx;
    flex-shrink: 0;
  }

  .brand-avatar {
    background: var(--brand);
  }

  .brand-avatar .link-avatar__text {
    color: #fff;
  }

  .link-avatar__text {
    font-size: 28rpx;
    font-weight: 700;
    color: var(--brand-strong);
    line-height: 1;
  }

  .link-main {
    padding-right: 8rpx;
  }

  .link-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .link-actions .btn {
    height: 56rpx;
    line-height: 56rpx;
    padding: 0 20rpx;
    font-size: 22rpx;
  }

  .link-actions .btn + .btn {
    margin-left: 12rpx;
  }

  .chevron {
    flex-shrink: 0;
    margin-left: 12rpx;
    font-size: 40rpx;
    line-height: 1;
    color: var(--text-3);
  }

  .theme-grid {
    display: flex;
    flex-wrap: wrap;
  }

  .theme-card {
    position: relative;
    width: calc(50% - 10rpx);
    margin-bottom: 20rpx;
    padding: 24rpx;
    border-radius: 24rpx;
    background: var(--surface-2);
    border: 2rpx solid var(--border);
  }

  .theme-card:nth-child(2n) {
    margin-left: 20rpx;
  }

  .theme-card.is-active {
    border-color: var(--brand-strong);
    background: var(--brand-soft);
  }

  .theme-swatch {
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    margin-bottom: 14rpx;
  }

  .theme-name {
    display: block;
    font-size: 26rpx;
    font-weight: 700;
    color: var(--text);
  }

  .theme-desc {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .theme-check {
    position: absolute;
    top: 16rpx;
    right: 20rpx;
    font-size: 30rpx;
    font-weight: 700;
    color: var(--brand-strong);
  }

  .stats-grid {
    display: flex;
    flex-wrap: wrap;
  }

  .stat {
    width: 50%;
    padding: 12rpx 0;
  }

  .stat__value {
    display: block;
    font-size: 32rpx;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat__label {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .full-btn {
    margin-top: 8rpx;
  }

  .danger-btn {
    margin-top: 20rpx;
  }

  .danger-hint {
    display: block;
    margin-top: 14rpx;
    text-align: center;
    line-height: 1.5;
  }
</style>
