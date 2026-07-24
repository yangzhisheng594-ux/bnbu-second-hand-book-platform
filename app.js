// app.js
const demoService = require('./utils/demoService');
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-5ggo2ebwa1032c7f', // 你的云开发环境 ID
        traceUser: true,
      });
    }
    demoService.install();
    this.globalData.isDemoMode = demoService.isEnabled();
    this.checkUserLoginState();
    // const logs = wx.getStorageSync('logs') || [] // 这部分与登录逻辑关系不大，可保留
    // logs.unshift(Date.now())
    // wx.setStorageSync('logs', logs)
  },

  globalData: {
    userInfo: null,
    isUserLoggedIn: null,
    sellListNeedRefresh: false,
    requestListNeedRefresh: false,
    cartNeedRefresh: false,
    isDemoMode: demoService.isEnabled(),
    // 新增：用于存储页面注册的登录状态回调函数
    pageLoginCallbacks: {}
  },

  // 注册页面登录状态回调
  registerLoginCallback: function (pageName, callback) {
    if (pageName && typeof callback === 'function') {
      this.globalData.pageLoginCallbacks[pageName] = callback;
      console.log(`[App.js] Page '${pageName}' registered login callback.`);
      // 如果注册时已经有登录状态，立即回调一次
      if (this.globalData.isUserLoggedIn !== null) { // 确保状态已确定（true或false）
        callback(this.globalData.isUserLoggedIn, this.globalData.userInfo);
      }
    }
  },

  // 注销页面登录状态回调
  unregisterLoginCallback: function (pageName) {
    if (pageName && this.globalData.pageLoginCallbacks[pageName]) {
      delete this.globalData.pageLoginCallbacks[pageName];
      console.log(`[App.js] Page '${pageName}' unregistered login callback.`);
    }
  },

  // 触发所有已注册页面的登录状态回调
  notifyPagesLoginStateChanged: function (isLoggedIn, userInfo) {
    console.log('[App.js] Notifying pages of login state change:', isLoggedIn);
    for (const pageName in this.globalData.pageLoginCallbacks) {
      if (typeof this.globalData.pageLoginCallbacks[pageName] === 'function') {
        this.globalData.pageLoginCallbacks[pageName](isLoggedIn, userInfo);
      }
    }
  },

  checkUserLoginState: function() {
    const userInfo = wx.getStorageSync('userInfo');
    const openidFromStorage = wx.getStorageSync('openid');

    if (userInfo && userInfo.user_id && openidFromStorage) {
      console.log('[App.js] User info found in storage, setting globalData.');
      this.globalData.userInfo = userInfo;
      this.globalData.isUserLoggedIn = true;
      this.notifyPagesLoginStateChanged(true, userInfo); // 通知页面
    } else {
      console.log('[App.js] No valid user info in storage, attempting to login silently.');
      this.doCloudLogin(null, true); // 静默登录
    }
  },

  doCloudLogin: function(userInfoFromWx = null, isSilent = false) {
    if (!isSilent && !this.isLoggingIn) { // 防止重复的非静默登录
        wx.showLoading({ title: '登录中...' });
        this.isLoggingIn = true; // 标记正在登录
    }

    return wx.cloud.callFunction({
      name: 'login',
      data: { userInfoFromWx: userInfoFromWx }
    }).then(res => {
      if (!isSilent) { wx.hideLoading(); this.isLoggingIn = false; }
      console.log('[App.js] login cloud function result:', res);
      let isLoggedIn = false;
      let currentUserInfo = null;

      if (res.result && res.result.success && res.result.userData && res.result.userData.user_id) {
        currentUserInfo = res.result.userData;
        isLoggedIn = true;
        wx.setStorageSync('userInfo', res.result.userData);
        if (res.result.openid) {
            wx.setStorageSync('openid', res.result.openid);
        }
        if (!isSilent) wx.showToast({ title: '登录成功', icon: 'success', duration: 1000 });
      } else {
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('openid');
        if (!isSilent && res.result && res.result.message) {
          wx.showToast({ title: res.result.message, icon: 'none' });
        } else if (!isSilent) {
          wx.showToast({ title: '登录失败', icon: 'none' });
        }
      }
      // 无论成功失败，都更新全局状态并通知页面
      this.globalData.userInfo = currentUserInfo;
      this.globalData.isUserLoggedIn = isLoggedIn;
      this.notifyPagesLoginStateChanged(isLoggedIn, currentUserInfo);
      return isLoggedIn;

    }).catch(err => {
      if (!isSilent) { wx.hideLoading(); this.isLoggingIn = false; }
      this.globalData.isUserLoggedIn = false;
      this.globalData.userInfo = null;
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('openid');
      console.error('[App.js] login cloud function call error:', err);
      if (!isSilent) wx.showToast({ title: '登录请求失败', icon: 'none' });
      this.notifyPagesLoginStateChanged(false, null); // 通知页面登录失败
      return false;
    });
  }
})
