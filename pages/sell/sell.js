// pages/sell/sell.js
Page({
  data: {
    sellingBooks: [ // 待售书籍 - 示例数据
      { id: 's1', title: '我的算法笔记（精装版）', courseCode: 'CS008', price: '45.00', coverUrl: '/images/placeholder_cover.png' },
      { id: 's2', title: '操作系统概念（龙书）', courseCode: 'CS009', price: '88.00', coverUrl: '/images/placeholder_cover_rect.png' },
    ],
    hasMoreSelling: true, // 是否还有更多待售书籍可加载
    seekingBooks: [ // 最近求购 - 示例数据
      { id: 'r1', title: '求一本《编译原理》第二版', courseCode: 'CS010', seekingPrice: '50.00', coverUrl: '/images/placeholder_cover.png' },
    ],
    hasMoreSeeking: false, // 是否还有更多求购信息可加载
  },

  onLoad: function (options) {
    // 页面加载时获取初始数据
    // this.loadSellingBooks();
    // this.loadSeekingBooks();
  },

  onShow: function() {
    // 每次页面显示时，可以考虑刷新列表数据，特别是从发布/编辑页返回后
    // 例如，如果全局状态或本地存储有更新标志
    // if (getApp().globalData.sellListNeedRefresh) {
    //   this.loadSellingBooks(true); // true表示刷新
    //   getApp().globalData.sellListNeedRefresh = false;
    // }
    console.log("Sell page onShow, refresh data if needed.");
  },

  // 加载待售书籍数据 (分页逻辑需要自己实现)
  loadSellingBooks: function(refresh = false) {
    // wx.showLoading({ title: '加载中...' });
    // 模拟API请求
    // const currentPage = refresh ? 1 : this.data.sellingPage + 1;
    // wx.request({ url: 'YOUR_API/selling_books?page=' + currentPage, ... })
    console.log("Loading selling books...");
    // 假设获取到数据后:
    // const newBooks = ...;
    // this.setData({
    //   sellingBooks: refresh ? newBooks : this.data.sellingBooks.concat(newBooks),
    //   hasMoreSelling: newBooks.length === 10, // 假设每页10条
    //   sellingPage: currentPage
    // });
    // wx.hideLoading();
  },

  // 加载最近求购数据 (分页逻辑需要自己实现)
  loadSeekingBooks: function(refresh = false) {
    console.log("Loading seeking books...");
  },

  // 点击“管理”按钮
  manageBook: function(event) {
    const bookId = event.currentTarget.dataset.id;
    console.log('Manage book with ID:', bookId);
    // 跳转到发布/编辑页面，并传递书籍ID用于编辑
    wx.navigateTo({
      url: '/pages/publish/publish?id=' + bookId
    });
  },

  // 点击“我有此书” (示例)
  respondToSeek: function(event) {
    const seekId = event.currentTarget.dataset.id;
    wx.showToast({
      title: '响应求购: ' + seekId,
      icon: 'none'
    });
    // 后续可以跳转到聊天或特定处理页面
  },

  // 点击“点击发布”按钮
  navigateToPublishNew: function() {
    console.log('Navigate to publish new book');
    // 跳转到发布/编辑页面，不传递ID表示新建
    wx.navigateTo({
      url: '/pages/publish/publish'
    });
  },

  // 模拟上拉加载更多
  onReachBottom: function() {
    // 根据当前tab或可见区域判断是加载待售还是求购
    // if (this.data.hasMoreSelling) {
    //   this.loadSellingBooks();
    // } else if (this.data.hasMoreSeeking) {
    //   this.loadSeekingBooks();
    // } else {
    //   console.log("No more data to load on reach bottom");
    // }
    console.log("Sell page onReachBottom");
  }
})