<template>
  <view class="page" :class="'theme-' + theme">
    <view class="appbar">
      <view class="appbar-left">
        <view class="back-btn" @tap="goBack">
          <text class="back-btn__icon">‹</text>
        </view>
        <view class="appbar__title appbar-title">
          <text class="appbar-name">分类</text>
          <text class="appbar__sub appbar-sub">支出和收入分类管理</text>
        </view>
      </view>
    </view>

    <view class="container">
      <view class="segment type-segment">
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

      <view class="card">
        <view class="card__head">
          <text class="card__title">{{ typeLabel }}分类</text>
          <text class="card__desc">{{ list.length }} 个</text>
        </view>

        <view v-if="list.length" class="list">
          <view
            v-for="cat in list"
            :key="cat.id"
            class="list__row cat-row"
            :class="{ 'is-disabled': !cat.enabled }"
          >
            <view class="cat-dot" :style="{ background: cat.color }">
              <text class="cat-dot__text">{{ initial(cat.name) }}</text>
            </view>

            <view class="row__main cat-main">
              <view class="cat-title-row">
                <text class="row__title cat-name">{{ cat.name }}</text>
                <text v-if="cat.builtin" class="tag cat-tag">内置</text>
              </view>
              <text class="row__sub">{{ cat.enabled ? '启用中' : '已停用' }}</text>
            </view>

            <view class="cat-actions">
              <view class="status-tag" :class="{ 'is-off': !cat.enabled }" @tap.stop="toggle(cat)">
                {{ cat.enabled ? '已启用' : '已停用' }}
              </view>
              <view class="move-btn" @tap.stop="move(cat, -1)">↑</view>
              <view class="move-btn" @tap.stop="move(cat, 1)">↓</view>
              <button class="btn btn--ghost btn--sm cat-edit" @tap.stop="openEdit(cat)">编辑</button>
            </view>
          </view>
        </view>
        <view v-else class="empty">还没有{{ typeLabel }}分类</view>
      </view>

      <button class="btn btn--primary add-btn" @tap="openCreate">+ 新增分类</button>

      <text class="footnote muted small">内置分类不可删除，可停用；停用只影响新建记录，历史流水与统计不变。</text>
    </view>

    <view v-if="showEditor" class="modal-mask" @tap="closeEditor">
      <view class="modal-card" @tap.stop>
        <view class="card__head">
          <text class="card__title">{{ isNew ? '新增' + typeLabel + '分类' : '编辑分类' }}</text>
          <text class="modal-close" @tap="closeEditor">×</text>
        </view>

        <view class="field">
          <text class="field__label">分类名称</text>
          <input
            class="input"
            v-model="form.name"
            maxlength="10"
            placeholder="1–10 个字符"
          />
        </view>

        <view class="field">
          <text class="field__label">颜色</text>
          <view class="color-row">
            <view
              v-for="color in colors"
              :key="color"
              class="color-dot"
              :class="{ 'is-active': form.color === color }"
              :style="{ background: color }"
              @tap="selectColor(color)"
            ></view>
          </view>
        </view>

        <view class="field">
          <text class="field__label">图标</text>
          <view class="icon-preview">
            <view class="cat-dot" :style="{ background: form.color }">
              <text class="cat-dot__text">{{ initial(form.name) || '分' }}</text>
            </view>
            <text class="muted small">图标使用分类名首字，以白色文字显示在色块上</text>
          </view>
        </view>

        <text v-if="formError" class="danger small form-error">{{ formError }}</text>

        <view class="modal-actions">
          <button class="btn btn--soft modal-btn" @tap="closeEditor">取消</button>
          <button class="btn btn--primary modal-btn" :disabled="saving" @tap="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </view>

        <button v-if="!isNew && !editingBuiltin" class="btn btn--danger modal-delete" @tap="removeCurrent">
          删除分类
        </button>
        <view v-if="!isNew && editingBuiltin" class="builtin-hint" @tap="removeCurrent">
          <text class="muted small">内置分类不可删除，可停用</text>
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
  categoriesOf,
  addCategoryAsync,
  updateCategoryAsync,
  removeCategoryAsync,
  toggleCategoryAsync,
  moveCategoryAsync,
  syncFromServer
} from '@/utils/store.js'

const COLORS = ['#a78bfa', '#8fbce8', '#86cfb8', '#f0b58c', '#f19aa8', '#7fc8d8', '#c3a4e8', '#9ab87a']

export default {
  data() {
    return {
      type: 'expense',
      colors: COLORS,
      showEditor: false,
      editingId: '',
      form: { name: '', color: COLORS[0] },
      formError: '',
      saving: false,
      syncing: false
    }
  },
  computed: {
    theme() {
      return store.theme
    },
    typeLabel() {
      return this.type === 'income' ? '收入' : '支出'
    },
    list() {
      return categoriesOf(this.type, true)
    },
    isNew() {
      return !this.editingId
    },
    editingBuiltin() {
      const target = this.list.filter((item) => item.id === this.editingId)[0]
      return !!(target && target.builtin)
    }
  },
  onLoad() {
    if (!isLoggedIn() || !currentUser()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    if (!store.ready) loadData()
  },
  onShow() {
    if (!isLoggedIn() || !currentUser()) return
    if (!store.ready) loadData()
    this.syncSilently()
  },
  methods: {
    toast(title) {
      uni.showToast({ title: String(title || ''), icon: 'none' })
    },
    initial(name) {
      return String(name || '').slice(0, 1)
    },
    selectColor(color) {
      this.form.color = color
    },
    goBack() {
      if (getCurrentPages().length > 1) {
        uni.navigateBack()
      } else {
        uni.switchTab({ url: '/pages/settings/settings' })
      }
    },
    switchType(next) {
      if (this.type === next) return
      this.type = next
      this.showEditor = false
    },
    async syncSilently() {
      if (this.syncing) return
      this.syncing = true
      try {
        await syncFromServer()
      } catch (err) {
        /* 离线时继续使用本地缓存 */
      } finally {
        this.syncing = false
      }
    },
    openCreate() {
      this.editingId = ''
      this.formError = ''
      this.form = {
        name: '',
        color: this.colors[this.list.length % this.colors.length]
      }
      this.showEditor = true
    },
    openEdit(category) {
      this.editingId = category.id
      this.formError = ''
      this.form = {
        name: category.name,
        color: category.color || this.colors[0]
      }
      this.showEditor = true
    },
    closeEditor() {
      if (this.saving) return
      this.showEditor = false
      this.formError = ''
    },
    async save() {
      const name = String(this.form.name || '').trim()
      if (!name) {
        this.formError = '请输入分类名称'
        return
      }
      if (name.length > 10) {
        this.formError = '分类名称最多 10 个字符'
        return
      }

      this.saving = true
      this.formError = ''
      try {
        if (this.isNew) {
          await addCategoryAsync({ name: name, type: this.type, color: this.form.color })
        } else {
          await updateCategoryAsync(this.editingId, { name: name, color: this.form.color })
        }
        this.showEditor = false
        this.toast(this.isNew ? '分类已创建' : '分类已更新')
      } catch (err) {
        this.formError = (err && err.message) || '保存失败'
      } finally {
        this.saving = false
      }
    },
    removeCurrent() {
      if (this.editingBuiltin) {
        this.toast('内置分类不可删除，可停用')
        return
      }
      const id = this.editingId
      if (!id) return
      uni.showModal({
        title: '删除「' + this.form.name + '」？',
        content: '删除后不可恢复。如果已有流水，请改为停用。',
        confirmText: '删除',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await removeCategoryAsync(id)
            this.showEditor = false
            this.toast('分类已删除')
          } catch (err) {
            this.formError = (err && err.message) || '删除失败'
          }
        }
      })
    },
    async toggle(category) {
      try {
        const updated = await toggleCategoryAsync(category.id)
        this.toast((updated.enabled ? '已启用 ' : '已停用 ') + updated.name)
      } catch (err) {
        this.toast((err && err.message) || '操作失败')
      }
    },
    async move(category, direction) {
      try {
        await moveCategoryAsync(category.id, direction)
      } catch (err) {
        /* 排序失败静默 */
      }
    }
  }
}
</script>

<style scoped>
  .page {
    padding-bottom: calc(env(safe-area-inset-bottom) + 60rpx);
  }

  .btn::after {
    border: none;
  }

  .appbar-left {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .back-btn {
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

  .back-btn__icon {
    font-size: 40rpx;
    line-height: 1;
    color: var(--text-2);
    margin-top: -4rpx;
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

  .type-segment {
    margin: 8rpx 0 24rpx;
  }

  .cat-row {
    align-items: center;
  }

  .cat-row.is-disabled {
    opacity: 0.58;
  }

  .cat-dot {
    width: 68rpx;
    height: 68rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 20rpx;
    flex-shrink: 0;
  }

  .cat-dot__text {
    color: #fff;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1;
  }

  .cat-main {
    padding-right: 8rpx;
  }

  .cat-title-row {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .cat-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat-tag {
    margin-left: 10rpx;
    flex-shrink: 0;
  }

  .cat-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .status-tag {
    padding: 4rpx 14rpx;
    border-radius: 999rpx;
    font-size: 20rpx;
    background: var(--brand-soft);
    color: var(--brand-strong);
    white-space: nowrap;
  }

  .status-tag.is-off {
    background: var(--surface-2);
    color: var(--text-3);
    border: 1rpx solid var(--border);
  }

  .move-btn {
    width: 44rpx;
    height: 44rpx;
    margin-left: 8rpx;
    border-radius: 12rpx;
    background: var(--surface-2);
    color: var(--text-2);
    font-size: 24rpx;
    line-height: 44rpx;
    text-align: center;
  }

  .cat-edit {
    margin-left: 8rpx;
    height: 52rpx;
    line-height: 52rpx;
    padding: 0 18rpx;
    font-size: 22rpx;
  }

  .add-btn {
    margin-top: 24rpx;
  }

  .footnote {
    display: block;
    margin-top: 20rpx;
    padding: 0 8rpx;
    line-height: 1.6;
  }

  .modal-mask {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48rpx;
    background: rgba(0, 0, 0, 0.45);
  }

  .modal-card {
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    padding: 32rpx;
    border-radius: 32rpx;
    background: var(--surface);
    border: 1rpx solid var(--border);
    box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.18);
  }

  .modal-close {
    width: 56rpx;
    height: 56rpx;
    line-height: 52rpx;
    text-align: center;
    border-radius: 50%;
    font-size: 36rpx;
    color: var(--text-3);
    background: var(--surface-2);
  }

  .color-row {
    display: flex;
    flex-wrap: wrap;
  }

  .color-dot {
    width: 60rpx;
    height: 60rpx;
    border-radius: 50%;
    margin: 0 20rpx 20rpx 0;
    border: 4rpx solid var(--surface);
    box-shadow: 0 0 0 2rpx var(--border);
  }

  .color-dot.is-active {
    box-shadow: 0 0 0 4rpx var(--brand-strong);
  }

  .icon-preview {
    display: flex;
    align-items: center;
  }

  .icon-preview .cat-dot {
    margin-right: 16rpx;
  }

  .icon-preview .small {
    flex: 1;
    min-width: 0;
    line-height: 1.5;
  }

  .form-error {
    display: block;
    margin-bottom: 16rpx;
  }

  .modal-actions {
    display: flex;
    margin-top: 8rpx;
  }

  .modal-btn {
    flex: 1;
  }

  .modal-btn + .modal-btn {
    margin-left: 20rpx;
  }

  .modal-delete {
    margin-top: 20rpx;
  }

  .builtin-hint {
    margin-top: 20rpx;
    padding: 16rpx 0;
    text-align: center;
  }
</style>
