// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null,
    cart: [], // 初始化购物车为一个空数组
    // sellListNeedRefresh: false, // (之前步骤可能用到)
    // requestListNeedRefresh: false // (之前步骤可能用到)
  }
})
