<template>
  <view class="page" :class="'theme-' + theme">
    <view class="record-head">
      <view class="record-back" @tap="goBack">
        <text class="record-back__icon">‹</text>
      </view>
      <view class="record-head__main">
        <text class="record-title">{{ txId ? '编辑记录' : '记一笔' }}</text>
        <text class="record-sub">{{ typeLabel }} · {{ date }}</text>
      </view>
      <text v-if="readonly" class="tag">仅查看</text>
    </view>

    <view class="container">
      <view class="segment record-type">
        <view
          class="segment__item"
          :class="{ 'is-active': type === 'expense' }"
          @tap="switchType('expense')"
        >支出</view>
        <view
          class="segment__item"
          :class="{ 'is-active': type === 'income' }"
          @tap="switchType('income')"
        >收入</view>
      </view>

      <view class="card amount-card">
        <view class="amount-head">
          <text class="card__title">金额</text>
          <text class="muted small">{{ typeLabel }}（元）</text>
        </view>
        <view class="amount-row">
          <text class="amount-currency" :class="type === 'income' ? 'income' : 'expense'">¥</text>
          <input
            class="amount-input"
            type="digit"
            :value="amount"
            placeholder="0.00"
            @input="onAmountInput"
          />
          <text v-if="amount" class="amount-clear" @tap="clearAmount">清空</text>
        </view>
      </view>

      <view class="card">
        <view class="card__head">
          <text class="card__title">选择分类</text>
          <text class="muted small">{{ selectedCategoryName }}</text>
        </view>
        <view class="cat-grid">
          <view
            v-for="category in categories"
            :key="category.id"
            class="cat-option"
            :class="{ 'is-active': category.id === categoryId }"
            @tap="selectCategory(category.id)"
          >
            <view class="cat-option__icon" :style="{ background: category.color }">{{ categoryInitial(category) }}</view>
            <text class="cat-option__name">{{ category.name }}</text>
          </view>
        </view>
        <view v-if="!categories.length" class="empty">当前类型还没有可用分类</view>
      </view>

      <view class="card">
        <view class="meta-row">
          <text class="meta-label">日期</text>
          <picker mode="date" :value="date" :end="maxDate" @change="onDateChange">
            <view class="meta-value">{{ date }}</view>
          </picker>
        </view>
        <view class="meta-divider"></view>
        <view class="meta-row meta-row--top">
          <text class="meta-label">备注</text>
          <view class="note-wrap">
            <input class="input note-input" v-model="note" maxlength="50" placeholder="选填，最多 50 字" />
            <text class="note-count muted">{{ note.length }}/50</text>
          </view>
        </view>
      </view>

      <button
        class="btn btn--primary submit-btn"
        :disabled="saving"
        @tap="save"
      >{{ saving ? '保存中…' : (txId ? '保存修改' : '保存') }}</button>

      <button v-if="txId" class="btn btn--danger submit-btn delete-btn" @tap="remove">删除这笔记录</button>
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
  fromCents,
  findTransaction,
  addTransaction,
  updateTransaction,
  softDelete,
  categoriesOf
} from '@/utils/store.js'

export default {
  data() {
    return {
      txId: '',
      type: 'expense',
      categoryId: '',
      amount: '',
      date: todayISO(),
      maxDate: todayISO(),
      note: '',
      readonly: false,
      saving: false
    }
  },
  computed: {
    theme() {
      return store.theme
    },
    categories() {
      return categoriesOf(this.type)
    },
    typeLabel() {
      return this.type === 'income' ? '收入' : '支出'
    },
    selectedCategoryName() {
      const category = this.categories.filter((item) => item.id === this.categoryId)[0]
      return category ? category.name : '未选择'
    }
  },
  async onLoad(options) {
    if (!isLoggedIn() || !currentUser()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }

    if (!store.ready) loadData()
    try {
      await syncFromServer()
    } catch (err) {
      /* 离线时继续使用本地缓存 */
    }

    this.maxDate = todayISO()
    const id = options && options.id ? String(options.id) : ''

    if (id) {
      const tx = findTransaction(id)
      if (!tx || tx.deleted) {
        this.toast('记录不存在或已删除')
        setTimeout(() => this.goBack(), 600)
        return
      }
      this.txId = tx.id
      this.type = tx.type === 'income' ? 'income' : 'expense'
      this.categoryId = tx.categoryId || ''
      this.amount = fromCents(tx.amount).toFixed(2)
      this.date = String(tx.date || todayISO()).slice(0, 10)
      this.note = tx.note || ''
      this.readonly = !!tx.readonly
      if (this.readonly) this.toast('关联账户流水仅可查看')
      return
    }

    this.date = todayISO()
    this.applyDefaultCategory()
  },
  methods: {
    toast(title) {
      uni.showToast({ title: String(title || ''), icon: 'none' })
    },
    categoryInitial(category) {
      const name = category && category.name ? String(category.name) : ''
      return name.slice(0, 1)
    },
    applyDefaultCategory() {
      const list = categoriesOf(this.type)
      const recentId = store.recent[this.type]
      const recent = list.filter((item) => item.id === recentId)[0]
      this.categoryId = recent ? recent.id : list[0] ? list[0].id : ''
    },
    switchType(next) {
      if (this.type === next) return
      this.type = next
      this.applyDefaultCategory()
    },
    selectCategory(id) {
      if (!id) return
      this.categoryId = id
    },
    sanitizeAmount(raw) {
      let value = String(raw || '').replace(/[^\d.]/g, '')
      const dot = value.indexOf('.')
      if (dot >= 0) {
        const head = value.slice(0, dot).slice(0, 7)
        const tail = value.slice(dot + 1).replace(/\./g, '').slice(0, 2)
        value = head + '.' + tail
        if (value.charAt(0) === '.') value = '0' + value
      } else {
        value = value.slice(0, 7).replace(/^0+(?=\d)/, '')
      }
      return value
    },
    onAmountInput(event) {
      const raw = event && event.detail ? event.detail.value : ''
      this.amount = this.sanitizeAmount(raw)
    },
    clearAmount() {
      this.amount = ''
    },
    onDateChange(event) {
      const value = event && event.detail ? event.detail.value : ''
      if (!value) return
      if (value > todayISO()) {
        this.toast('不能选择未来的日期')
        return
      }
      this.date = value
    },
    async save() {
      if (this.saving) return
      if (this.readonly) {
        this.toast('关联账户流水仅可查看')
        return
      }

      const amount = Math.round(parseFloat(this.amount) * 100)
      if (!this.amount || isNaN(amount) || amount <= 0) {
        this.toast('请输入金额')
        return
      }
      if (!this.categoryId) {
        this.toast('请选择分类')
        return
      }

      const payload = {
        type: this.type,
        amount,
        categoryId: this.categoryId,
        date: this.date,
        note: this.note.trim().slice(0, 50)
      }

      this.saving = true
      try {
        if (this.txId) {
          await updateTransaction(this.txId, payload)
          this.toast('记录已更新')
        } else {
          await addTransaction(payload)
          this.toast('记录已保存')
        }
        setTimeout(() => this.goBack(), 500)
      } catch (err) {
        this.toast((err && err.message) || '保存失败')
        this.saving = false
      }
    },
    remove() {
      if (!this.txId) return
      if (this.readonly) {
        this.toast('关联账户流水仅可查看')
        return
      }
      uni.showModal({
        title: '删除这笔记录？',
        content: '删除后不可恢复。',
        confirmText: '删除',
        success: (res) => {
          if (res.confirm) this.doDelete()
        }
      })
    },
    async doDelete() {
      try {
        await softDelete(this.txId)
        this.toast('已删除')
        setTimeout(() => this.goBack(), 500)
      } catch (err) {
        this.toast((err && err.message) || '删除失败')
      }
    },
    goBack() {
      uni.navigateBack({
        fail: () => {
          uni.switchTab({ url: '/pages/ledger/ledger' })
        }
      })
    }
  }
}
</script>

<style>
  .page {
    padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
  }

  .input {
    width: 100%;
    box-sizing: border-box;
  }

  .record-head {
    position: sticky;
    top: 0;
    z-index: 30;
    background: var(--bg);
    padding: calc(var(--status-bar-height) + 20rpx) 32rpx 20rpx;
    display: flex;
    align-items: center;
  }

  .record-back {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: var(--surface);
    border: 1rpx solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 20rpx;
    flex-shrink: 0;
  }

  .record-back__icon {
    font-size: 44rpx;
    line-height: 1;
    color: var(--text-2);
    margin-top: -4rpx;
  }

  .record-head__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .record-title {
    font-size: 36rpx;
    font-weight: 700;
    color: var(--text);
  }

  .record-sub {
    margin-top: 6rpx;
    font-size: 22rpx;
    color: var(--text-3);
  }

  .record-type {
    margin-bottom: 24rpx;
  }

  .amount-card {
    padding: 28rpx 32rpx 24rpx;
  }

  .amount-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12rpx;
  }

  .amount-row {
    display: flex;
    align-items: center;
  }

  .amount-currency {
    font-size: 44rpx;
    font-weight: 700;
    margin-right: 14rpx;
  }

  .amount-input {
    flex: 1;
    height: 96rpx;
    font-size: 64rpx;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .amount-clear {
    font-size: 22rpx;
    color: var(--text-3);
    padding: 10rpx 0 10rpx 16rpx;
    flex-shrink: 0;
  }

  .cat-grid {
    display: flex;
    flex-wrap: wrap;
    margin: 0 -8rpx;
  }

  .cat-option {
    width: 25%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12rpx 8rpx 16rpx;
  }

  .cat-option__icon {
    width: 82rpx;
    height: 82rpx;
    border-radius: 50%;
    color: var(--surface);
    font-size: 32rpx;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cat-option.is-active .cat-option__icon {
    box-shadow: 0 0 0 4rpx var(--brand);
  }

  .cat-option__name {
    margin-top: 10rpx;
    max-width: 100%;
    font-size: 22rpx;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat-option.is-active .cat-option__name {
    color: var(--brand-strong);
    font-weight: 700;
  }

  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8rpx 0;
  }

  .meta-row--top {
    align-items: flex-start;
  }

  .meta-label {
    font-size: 26rpx;
    color: var(--text-2);
    margin-right: 24rpx;
    flex-shrink: 0;
  }

  .meta-value {
    font-size: 26rpx;
    color: var(--text);
    padding: 14rpx 24rpx;
    border-radius: 18rpx;
    background: var(--surface-2);
    border: 1rpx solid var(--border);
  }

  .meta-divider {
    height: 1rpx;
    background: var(--border);
    margin: 12rpx 0;
  }

  .note-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .note-input {
    flex: 1;
    min-width: 0;
  }

  .note-count {
    width: 80rpx;
    margin-left: 16rpx;
    font-size: 22rpx;
    text-align: right;
    flex-shrink: 0;
  }

  .submit-btn {
    width: 100%;
    box-sizing: border-box;
    padding: 0;
    margin-top: 24rpx;
  }

  .submit-btn::after {
    border: none;
  }

  .delete-btn {
    margin-top: 20rpx;
  }
</style>
