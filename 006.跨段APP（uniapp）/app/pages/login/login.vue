<template>
  <view class="page" :class="'theme-' + theme">
    <view class="auth-hero">
      <view class="auth-logo">¥</view>
      <text class="auth-name">轻账本</text>
      <text class="auth-slogan">30 秒记一笔，看清每一笔花销与结余</text>
    </view>

    <view class="auth-main">
      <view class="card auth-card">
        <view class="segment auth-segment">
          <view
            v-for="tab in tabs"
            :key="tab.value"
            class="segment__item"
            :class="{ 'is-active': mode === tab.value }"
            @tap="switchMode(tab.value)"
          >{{ tab.label }}</view>
        </view>

        <view class="auth-heading">
          <text class="auth-title">{{ heading }}</text>
          <text class="auth-sub muted small">{{ subheading }}</text>
        </view>

        <view class="field">
          <text class="field__label">邮箱</text>
          <input
            class="input"
            v-model="email"
            type="text"
            placeholder="you@example.com"
            :disabled="loading"
          />
        </view>

        <view v-if="isCodeMode" class="field">
          <text class="field__label">验证码</text>
          <view class="row-in-row">
            <input
              class="input"
              v-model="code"
              type="number"
              maxlength="6"
              placeholder="6 位数字验证码"
              :disabled="loading"
            />
            <button
              class="btn btn--soft btn--sm code-btn"
              :disabled="counting || sendingCode"
              @tap="handleSendCode"
            >{{ codeButtonText }}</button>
          </view>
          <text v-if="codeHint" class="auth-hint small muted">{{ codeHint }}</text>
        </view>

        <view class="field">
          <text class="field__label">{{ mode === 'reset' ? '新密码' : '密码' }}</text>
          <view class="auth-password">
            <input
              class="input"
              v-model="password"
              :password="!showPassword"
              placeholder="8–32 位，含字母和数字"
              :disabled="loading"
            />
            <text class="auth-eye" @tap="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</text>
          </view>
        </view>

        <view v-if="mode === 'register'" class="field">
          <text class="field__label">确认密码</text>
          <input
            class="input"
            v-model="confirm"
            :password="!showPassword"
            placeholder="请再次输入密码"
            :disabled="loading"
          />
        </view>

        <view v-if="mode === 'login'" class="auth-options">
          <view class="row-in-row">
            <switch
              class="auth-switch"
              :checked="remember"
              :color="themeColor"
              @change="onRememberChange"
            />
            <text class="small muted">记住登录状态</text>
          </view>
          <text class="auth-link" @tap="switchMode('reset')">忘记密码？</text>
        </view>

        <button
          class="btn btn--primary submit-btn"
          :disabled="loading"
          @tap="submit"
        >{{ loading ? '处理中…' : submitLabel }}</button>

        <view v-if="mode === 'login'" class="auth-foot">
          <text class="small muted">还没有账号？</text>
          <text class="auth-link" @tap="switchMode('register')">立即注册</text>
        </view>
        <view v-else-if="mode === 'register'" class="auth-foot">
          <text class="small muted">已有账号？</text>
          <text class="auth-link" @tap="switchMode('login')">去登录</text>
        </view>
        <view v-else class="auth-foot">
          <text class="small muted">想起来了？</text>
          <text class="auth-link" @tap="switchMode('login')">返回登录</text>
        </view>
      </view>

      <text class="auth-legal">登录即表示同意用户协议与隐私说明，账号信息将安全存储于服务器。</text>
    </view>
  </view>
</template>

<script>
import {
  state as store,
  isLoggedIn,
  currentUser,
  login,
  register,
  sendCode,
  resetPassword,
  THEME_META
} from '@/utils/store.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default {
  data() {
    return {
      mode: 'login',
      tabs: [
        { value: 'login', label: '登录' },
        { value: 'register', label: '注册' },
        { value: 'reset', label: '找回密码' }
      ],
      email: '',
      password: '',
      confirm: '',
      code: '',
      remember: true,
      showPassword: false,
      loading: false,
      sendingCode: false,
      codeSent: false,
      codeHint: '',
      countdown: 0,
      timer: null
    }
  },
  computed: {
    theme() {
      return store.theme
    },
    themeColor() {
      return ((THEME_META[this.theme] || THEME_META.macaron) || {}).color
    },
    isCodeMode() {
      return this.mode === 'register' || this.mode === 'reset'
    },
    counting() {
      return this.countdown > 0
    },
    codeButtonText() {
      return this.counting ? this.countdown + ' 秒后重发' : '获取验证码'
    },
    heading() {
      if (this.mode === 'register') return '创建账号'
      if (this.mode === 'reset') return '找回密码'
      return '欢迎回来'
    },
    subheading() {
      if (this.mode === 'register') return '注册后即可云同步你的账本。'
      if (this.mode === 'reset') return '通过邮箱验证码重置登录密码。'
      return '登录后继续记录今天的收支。'
    },
    submitLabel() {
      if (this.mode === 'register') return '注册'
      if (this.mode === 'reset') return '重置密码'
      return '登录'
    }
  },
  onLoad() {
    if (isLoggedIn() && currentUser()) {
      uni.reLaunch({ url: '/pages/ledger/ledger' })
    }
  },
  onUnload() {
    this.stopTimer()
  },
  methods: {
    toast(title) {
      uni.showToast({ title: String(title || ''), icon: 'none' })
    },
    validEmail(value) {
      return EMAIL_RE.test(String(value || '').trim())
    },
    validPassword(value) {
      const text = String(value || '')
      return text.length >= 8 && text.length <= 32 && /[A-Za-z]/.test(text) && /\d/.test(text)
    },
    switchMode(mode) {
      if (this.mode === mode || this.loading || this.sendingCode) return
      this.mode = mode
      this.password = ''
      this.confirm = ''
      this.code = ''
      this.codeSent = false
      this.codeHint = ''
      this.stopTimer()
      this.countdown = 0
    },
    onRememberChange(event) {
      this.remember = !!(event && event.detail && event.detail.value)
    },
    startTimer() {
      this.stopTimer()
      this.countdown = 60
      this.timer = setInterval(() => {
        this.countdown -= 1
        if (this.countdown <= 0) this.stopTimer()
      }, 1000)
    },
    stopTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },
    async handleSendCode() {
      if (this.sendingCode || this.counting) return
      const email = this.email.trim()
      if (!this.validEmail(email)) {
        this.toast('请先输入正确的邮箱地址')
        return
      }
      this.sendingCode = true
      try {
        const purpose = this.mode === 'register' ? 'register' : 'reset_password'
        const data = await sendCode(email, purpose)
        this.codeSent = true
        this.codeHint =
          data && data.delivered === false
            ? '开发模式：验证码已输出到后端控制台'
            : '验证码已发送至 ' + email + '，10 分钟内有效'
        this.startTimer()
        this.toast('验证码已发送，请查收邮箱')
      } catch (err) {
        this.toast((err && err.message) || '验证码发送失败')
      } finally {
        this.sendingCode = false
      }
    },
    async submit() {
      if (this.loading) return
      const email = this.email.trim()

      if (!this.validEmail(email)) {
        this.toast('请输入正确的邮箱地址')
        return
      }

      if (this.mode === 'login') {
        if (!this.password) {
          this.toast('请输入密码')
          return
        }
        this.loading = true
        try {
          await login(email, this.password, this.remember)
          uni.reLaunch({ url: '/pages/ledger/ledger' })
        } catch (err) {
          this.toast((err && err.message) || '登录失败')
          this.loading = false
        }
        return
      }

      if (!this.codeSent) {
        this.toast('请先获取邮箱验证码')
        return
      }
      const code = this.code.trim()
      if (!/^\d{6}$/.test(code)) {
        this.toast('请输入 6 位数字验证码')
        return
      }
      if (!this.validPassword(this.password)) {
        this.toast('密码需为 8–32 位，且包含字母与数字')
        return
      }

      if (this.mode === 'register') {
        if (this.password !== this.confirm) {
          this.toast('两次输入的密码不一致')
          return
        }
        this.loading = true
        try {
          await register(email, this.password, code)
          uni.reLaunch({ url: '/pages/ledger/ledger' })
        } catch (err) {
          this.toast((err && err.message) || '注册失败')
          this.loading = false
        }
        return
      }

      this.loading = true
      try {
        await resetPassword({ email, code, new_password: this.password })
        uni.showToast({ title: '密码已重置，请使用新密码登录', icon: 'none' })
        this.loading = false
        this.switchMode('login')
      } catch (err) {
        this.toast((err && err.message) || '重置失败')
        this.loading = false
      }
    }
  }
}
</script>

<style>
  .auth-hero {
    padding: calc(var(--status-bar-height) + 56rpx) 48rpx 56rpx;
    background: linear-gradient(150deg, var(--brand-soft), var(--brand-mist) 58%, var(--bg));
    border-bottom-left-radius: 48rpx;
    border-bottom-right-radius: 48rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .auth-logo {
    width: 108rpx;
    height: 108rpx;
    border-radius: 32rpx;
    background: linear-gradient(140deg, var(--brand), var(--brand-strong));
    color: var(--surface);
    font-size: 52rpx;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16rpx 32rpx -16rpx var(--brand-strong);
  }

  .auth-name {
    margin-top: 22rpx;
    font-size: 44rpx;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 1rpx;
  }

  .auth-slogan {
    margin-top: 12rpx;
    font-size: 24rpx;
    line-height: 1.6;
    text-align: center;
    color: var(--text-2);
  }

  .auth-main {
    margin-top: -24rpx;
    padding: 0 32rpx calc(48rpx + env(safe-area-inset-bottom));
  }

  .auth-card {
    border-radius: 32rpx;
  }

  .input {
    width: 100%;
    box-sizing: border-box;
  }

  .auth-segment {
    margin-bottom: 32rpx;
  }

  .auth-segment .segment__item {
    height: 60rpx;
    line-height: 60rpx;
    font-size: 24rpx;
  }

  .auth-heading {
    margin-bottom: 28rpx;
  }

  .auth-title {
    display: block;
    font-size: 36rpx;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.5rpx;
  }

  .auth-sub {
    display: block;
    margin-top: 8rpx;
  }

  .auth-hint {
    display: block;
    margin-top: 10rpx;
  }

  .auth-password {
    position: relative;
  }

  .auth-password .input {
    padding-right: 120rpx;
    box-sizing: border-box;
  }

  .auth-eye {
    position: absolute;
    right: 24rpx;
    top: 50%;
    transform: translateY(-50%);
    font-size: 24rpx;
    font-weight: 600;
    color: var(--brand-strong);
  }

  .auth-options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32rpx;
  }

  .auth-switch {
    transform: scale(0.72);
    transform-origin: left center;
    margin-right: 6rpx;
  }

  .auth-link {
    font-size: 24rpx;
    font-weight: 600;
    color: var(--brand-strong);
  }

  .code-btn {
    width: 220rpx;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    flex-shrink: 0;
    font-size: 24rpx;
  }

  .submit-btn {
    width: 100%;
    box-sizing: border-box;
    padding: 0;
    margin: 8rpx 0 0;
  }

  .submit-btn::after,
  .code-btn::after {
    border: none;
  }

  .auth-foot {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 28rpx;
  }

  .auth-foot .auth-link {
    margin-left: 8rpx;
  }

  .auth-legal {
    display: block;
    margin-top: 32rpx;
    padding: 0 24rpx;
    font-size: 22rpx;
    line-height: 1.6;
    text-align: center;
    color: var(--text-3);
  }
</style>
