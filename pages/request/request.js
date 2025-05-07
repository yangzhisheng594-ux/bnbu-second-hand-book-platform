// pages/request/request.js
Page({
  data: {
    myRequests: [ // 我的求购 - 示例数据
      { id: 'req1', title: '急求一本《现代操作系统》第4版', courseCode: 'CS003', expectedPrice: '30.00', coverUrl: '/images/placeholder_cover.png' },
      { id: 'req2', title: '求购《数据密集型应用系统设计》DDIA', courseCode: '', expectedPrice: '60.00', coverUrl: '/images/placeholder_cover_rect.png' },
    ],
    hasMoreRequests: true, // 是否还有更多求购可加载
    requestPage: 1 // 当前求购列表页码
  },

  onLoad: function (options) {
    // this.loadMyRequests();
  },

  onShow: function() {
    // 每次页面显示时，可以考虑刷新列表数据
    // if (getApp().globalData.requestListNeedRefresh) {
    //   this.loadMyRequests(true); // true表示刷新
    //   getApp().globalData.requestListNeedRefresh = false;
    // }
    console.log("Request page onShow, refresh data if needed.");
  },

  // 加载我的求购数据
  loadMyRequests: function(refresh = false) {
    // wx.showLoading({ title: '加载中...' });
    // const currentPage = refresh ? 1 : this.data.requestPage;
    // wx.request({ url: 'YOUR_API/my_requests?page=' + currentPage, ... })
    console.log("Loading my requests...");
    // 假设获取到数据后:
    // const newRequests = ...;
    // this.setData({
    //   myRequests: refresh ? newRequests : this.data.myRequests.concat(newRequests),
    //   hasMoreRequests: newRequests.length === 10, // 假设每页10条
    //   requestPage: currentPage
    // });
    // wx.hideLoading();
  },

  // 点击“管理”按钮
  manageRequest: function(event) {
    const requestId = event.currentTarget.dataset.id;
    console.log('Manage request with ID:', requestId);
    // 跳转到发布/编辑求购页面，并传递ID用于编辑
    wx.navigateTo({
      url: '/pages/publishRequest/publishRequest?id=' + requestId
    });
  },

  // 点击“点击发布”按钮
  navigateToPublishNewRequest: function() {
    console.log('Navigate to publish new request');
    // 跳转到发布/编辑求购页面，不传递ID表示新建
    wx.navigateTo({
      url: '/pages/publishRequest/publishRequest'
    });
  },

  onReachBottom: function() {
    // if (this.data.hasMoreRequests) {
    //   this.setData({ requestPage: this.data.requestPage + 1 });
    //   this.loadMyRequests();
    // } else {
    //   console.log("No more requests to load");
    // }
    console.log("Request page onReachBottom");
  }
})