/*
  api.js — 后端 REST API 客户端（uni.request 版）
  与 003.前端代码/assets/js/api.js 保持同一套协议：
  { code, data, message }，401 时用 refresh_token 静默续期并重试一次
*/

export const BASE_URL = 'http://127.0.0.1:3000/api/v1'
const TOKEN_KEY = 'ledger.tokens.v1'

function apiError(message, code, status) {
  const err = new Error(message)
  err.code = code
  err.status = status
  err.isApiError = true
  return err
}

export function readTokens() {
  try {
    return uni.getStorageSync(TOKEN_KEY) || null
  } catch (e) {
    return null
  }
}

export function writeTokens(tokens) {
  try {
    if (!tokens) uni.removeStorageSync(TOKEN_KEY)
    else uni.setStorageSync(TOKEN_KEY, tokens)
  } catch (e) {
    /* 忽略存储异常 */
  }
}

function request({ method, path, data, headers }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + path,
      method,
      data,
      header: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      timeout: 15000,
      success: (res) => resolve(res),
      fail: () => reject(apiError('无法连接服务器，请确认后端已启动（' + BASE_URL + '）', 'NETWORK', 0))
    })
  })
}

function tryRefresh(refreshToken) {
  return request({
    method: 'POST',
    path: '/auth/refresh',
    data: { refresh_token: refreshToken }
  }).then((res) => {
    const payload = res.data
    if (res.statusCode !== 200 || !payload || payload.code !== 0 || !payload.data) {
      writeTokens(null)
      return false
    }
    const prev = readTokens() || {}
    writeTokens({
      access_token: payload.data.access_token,
      refresh_token: prev.refresh_token,
      expires_at: Date.now() + (payload.data.expires_in || 900) * 1000
    })
    return true
  }).catch(() => false)
}

async function send(method, path, data, useAuth, retried) {
  const headers = {}
  const tokens = readTokens()
  if (useAuth && tokens && tokens.access_token) {
    headers.Authorization = 'Bearer ' + tokens.access_token
  }

  let res
  try {
    res = await request({ method, path, data, headers })
  } catch (err) {
    throw err
  }

  const payload = res.data

  if (res.statusCode === 401 && useAuth && !retried && tokens && tokens.refresh_token) {
    const renewed = await tryRefresh(tokens.refresh_token)
    if (renewed) return send(method, path, data, useAuth, true)
  }

  if (res.statusCode < 200 || res.statusCode >= 300 || !payload || payload.code !== 0) {
    const message = (payload && payload.message) || '请求失败（HTTP ' + res.statusCode + '）'
    throw apiError(message, payload && payload.code, res.statusCode)
  }

  return payload.data
}

const Api = {
  BASE_URL,
  tokens: readTokens,
  setTokens: writeTokens,
  clearTokens() {
    writeTokens(null)
  },

  // 账号
  sendCode(email, purpose) {
    return send('POST', '/auth/send-code', { email, purpose }, false)
  },
  register(payload) {
    return send('POST', '/auth/register', payload, false)
  },
  login(email, password, remember) {
    return send('POST', '/auth/login', { email, password, remember: remember !== false }, false)
  },
  resetPassword(payload) {
    return send('POST', '/auth/reset-password', payload, false)
  },
  logout() {
    return send('POST', '/auth/logout', {}, true)
  },
  me() {
    return send('GET', '/account/me', null, true)
  },
  deleteAccount() {
    return send('DELETE', '/account', { confirm_text: '注销' }, true)
  },
  updateTheme(theme) {
    return send('PUT', '/account/theme', { theme }, true)
  },
  updateName(name) {
    return send('PUT', '/account/name', { name }, true)
  },

  get(path) {
    return send('GET', path, null, true)
  },
  post(path, body) {
    return send('POST', path, body, true)
  },
  put(path, body) {
    return send('PUT', path, body, true)
  },
  del(path, body) {
    return send('DELETE', path, body, true)
  }
}

export default Api
