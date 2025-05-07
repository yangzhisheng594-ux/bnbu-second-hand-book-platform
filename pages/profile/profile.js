// pages/profile/profile.js
const app = getApp();

Page({
  data: {
    userInfo: {}, // 从全局或本地存储获取
    orderCounts: { // 订单数量，应从API获取
      pendingPayment: 0,
      pendingShipment: 0,
      pendingReceipt: 0,
      // afterSales: 0
    }
  },

  onShow: function () {
    // 每次进入页面都尝试获取/更新用户信息和订单数量
    this.loadUserInfo();
    this.loadOrderCounts(); // 你需要实现这个函数来从后端获取订单数量
  },

  loadUserInfo: function() {
    const storedUserInfo = wx.getStorageSync('userInfo');
    if (storedUserInfo && storedUserInfo.nickName) {
      this.setData({ userInfo: storedUserInfo });
    } else {
      // 如果希望每次都尝试从 app.globalData 更新
      if (app.globalData.userInfo && app.globalData.userInfo.nickName) {
        this.setData({ userInfo: app.globalData.userInfo });
        wx.setStorageSync('userInfo', app.globalData.userInfo); // 更新本地存储
      } else {
        this.setData({ userInfo: {} }); // 清空，显示登录提示
      }
    }
  },

  // 模拟获取订单各类数量
  loadOrderCounts: function() {
    // 实际项目中，这里会调用API获取
    // wx.request({ url: 'YOUR_API/order_counts', ... })
    // 模拟数据：
    setTimeout(() => { // 模拟异步
      this.setData({
        orderCounts: {
          pendingPayment: Math.floor(Math.random() * 5), // 0到4的随机数
          pendingShipment: Math.floor(Math.random() * 3),
          pendingReceipt: Math.floor(Math.random() * 2),
        }
      });
    }, 500);
  },

  handleLoginOrViewProfile: function() {
    if (!this.data.userInfo.nickName) {
      // 如果未登录，可以引导用户点击下方的登录按钮，或者直接在此处触发登录
      console.log('User not logged in, prompt to login.');
    } else {
      // 如果已登录，点击头像/用户名区域可以考虑跳转到编辑资料页或不做任何事
      // this.navigateToEditProfile();
      console.log('User already logged in.');
    }
  },

  // 微信新版获取用户信息推荐方式是使用 button 的 open-type="getUserInfo"
  // bindgetuserinfo 事件回调
  onGetUserInfo: function(e) {
    console.log(e.detail.userInfo);
    if (e.detail.userInfo) {
      // 用户允许授权
      app.globalData.userInfo = e.detail.userInfo;
      wx.setStorageSync('userInfo', e.detail.userInfo); // 存入本地存储
      this.setData({
        userInfo: e.detail.userInfo
      });
      // 这里可以调用你的登录接口，将微信用户信息（如code, encryptedData, iv）发送到后端
      // wx.login({ success: res => { /* wx.request({ url: 'YOUR_LOGIN_API', data: { code: res.code, ...e.detail.userInfo } }) */ } })
      wx.showToast({ title: '登录成功', icon: 'success' });
    } else {
      // 用户拒绝授权
      wx.showToast({ title: '授权失败', icon: 'none' });
    }
  },

  navigateToEditProfile: function(event) {
    // 阻止事件冒泡，避免触发 handleLoginOrViewProfile
    if (event && event.stopPropagation) {
        event.stopPropagation();
    }
    if (!this.data.userInfo.nickName && !this.data.userInfo.avatarUrl) {
        wx.showToast({title: '请先登录', icon: 'none'});
        return;
    }
    wx.navigateTo({
      url: '/pages/editProfile/editProfile'
    });
  },

  navigateToOrderList: function(e) {
    const status = e.currentTarget.dataset.status || 'all'; // 获取订单状态
    if (!this.data.userInfo.nickName) {
        wx.showToast({title: '请先登录', icon: 'none'});
        return;
    }
    wx.navigateTo({
      url: `/pages/orderList/orderList?status=${status}` // 将状态作为参数传递
    });
  },

  logout: function() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.userInfo = null;
          wx.removeStorageSync('userInfo');
          this.setData({ userInfo: {} });
          wx.showToast({ title: '已退出', icon: 'none' });
        }
      }
    });
  }
})