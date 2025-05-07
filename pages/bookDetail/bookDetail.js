// pages/bookDetail/bookDetail.js
Page({
  data: {
    bookId: null,
    book: { // 存放书籍详情的对象
      // 示例结构，你需要根据实际数据调整
      // id: null,
      // title: '',
      // author: '',
      // coverUrl: '', // 用于单张封面图
      // imageUrls: [], // 用于swiper轮播图
      // price: '',
      // originalPrice: '',
      // courseCode: '',
      // description: '', // 普通文本描述
      // richDescription: '' // 富文本描述
    },
    currentSwiper: 0, // 用于显示图片序号
    // 模拟的假数据源，实际项目中你会从全局数据或服务器获取
    allBooksData: {
      // 来自 index.js 的畅销书数据 (简化版)
      '1': { id: 1, title: '深入浅出Node.js', author: '朴灵', coverUrl: '/images/placeholder_cover.png', imageUrls: ['/images/placeholder_cover.png', '/images/placeholder_cover2.png', '/images/placeholder_cover3.png'], price: '68.00', originalPrice: '79.00', courseCode: 'CS001', description: '这是一本深入讲解Node.js原理和实践的书籍。\n包含异步I/O、模块机制等核心内容。' },
      '2': { id: 2, title: 'JavaScript高级程序设计', author: 'Nicholas C. Zakas', coverUrl: '/images/placeholder_cover.png', imageUrls: ['/images/placeholder_cover.png'], price: '99.00', courseCode: 'CS002', description: '经典的JavaScript红宝书，前端开发者必备。' },
      '3': { id: 3, title: '小程序开发实战', author: '某某某', coverUrl: '/images/placeholder_cover.png', imageUrls: [], price: '59.50', courseCode: 'MP001', description: '学习微信小程序开发的入门与进阶。' },
      // 来自 index.js 的最近发布数据 (简化版)
      '101': { id: 101, title: 'Python从入门到实践（第2版）', author: 'Eric Matthes', coverUrl: '/images/placeholder_cover_rect.png', imageUrls: ['/images/placeholder_cover_rect.png'], price: '75.00', originalPrice: '89.00', courseCode: 'PY001', description: 'Python学习的畅销书，包含大量实例。' },
      // ... 其他书籍数据
    }
  },

  onLoad: function (options) {
    const bookId = options.id; // 获取从首页传递过来的书籍ID
    // const bookType = options.type; // 获取书籍类型（如果需要）
    console.log('BookDetail onLoad, bookId:', bookId);

    if (bookId) {
      this.setData({
        bookId: bookId
      });
      this.loadBookDetail(bookId);
    } else {
      console.error('No book ID provided');
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      // 可以考虑返回上一页
      // wx.navigateBack();
    }
  },

  loadBookDetail: function(bookId) {
    // --- 模拟数据获取 ---
    // 实际项目中，你会根据 bookId 从全局状态管理、本地存储或服务器API获取数据
    const bookData = this.data.allBooksData[bookId];

    if (bookData) {
      this.setData({
        book: bookData
      });
      // 如果bookData.title是导航栏标题，可以在这里设置
      // wx.setNavigationBarTitle({ title: bookData.title });
    } else {
      console.error('Book data not found for ID:', bookId);
      wx.showToast({
        title: '书籍信息不存在',
        icon: 'none'
      });
      // wx.navigateBack();
    }
    // --- 模拟数据获取结束 ---

    // --- 真实API请求示例（注释掉） ---
    /*
    wx.showLoading({ title: '加载中...' });
    wx.request({
      url: 'YOUR_API_ENDPOINT/books/' + bookId, // 替换为你的API地址
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.setData({
            book: res.data // 假设返回的数据结构与 this.data.book 一致
          });
          // wx.setNavigationBarTitle({ title: res.data.title });
        } else {
          console.error('Failed to load book detail:', res);
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('API request failed:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
    */
  },

  // Swiper 图片切换事件
  swiperChange: function(e) {
    this.setData({
      currentSwiper: e.detail.current
    });
  },

  // 修改/确保“加入购物车”功能
  addToCart: function() {
    if (!this.data.bookId || !this.data.book || !this.data.book.id) {
      wx.showToast({ title: '商品信息错误', icon: 'none' });
      return;
    }

    const cartItem = {
      id: this.data.book.id,
      title: this.data.book.title,
      coverUrl: this.data.book.coverUrl || (this.data.book.imageUrls && this.data.book.imageUrls[0]) || '/images/placeholder_cover_rect.png',
      price: parseFloat(this.data.book.price), // 确保是数字
      courseCode: this.data.book.courseCode || '',
      quantity: 1, // 购物车中的数量，默认为1
      selected: true // 默认加入时为选中状态
    };

    // 检查购物车中是否已存在该商品
    const existingItemIndex = app.globalData.cart.findIndex(item => item.id === cartItem.id);

    if (existingItemIndex > -1) {
      // 如果已存在，可以选择增加数量或提示已添加
      // app.globalData.cart[existingItemIndex].quantity += 1; // 增加数量示例
      wx.showToast({ title: '已在购物车中', icon: 'none' });
    } else {
      app.globalData.cart.push(cartItem);
    }

    console.log('Current Cart:', app.globalData.cart);
    wx.showToast({
      title: '已加入购物车',
      icon: 'success'
    });
    // 可以考虑跳转到购物车或显示购物车图标上的角标
    // wx.switchTab({ url: '/pages/cart/cart' });
  },

  // 修改/确保“立即购买”功能
  buyNow: function() {
    if (!this.data.bookId || !this.data.book || !this.data.book.id) {
      wx.showToast({ title: '商品信息错误', icon: 'none' });
      return;
    }
    console.log('Buy now:', this.data.book.title);

    const orderItem = {
      id: this.data.book.id,
      title: this.data.book.title,
      coverUrl: this.data.book.coverUrl || (this.data.book.imageUrls && this.data.book.imageUrls[0]) || '/images/placeholder_cover_rect.png',
      price: parseFloat(this.data.book.price),
      courseCode: this.data.book.courseCode || '',
      quantity: 1 // 直接购买数量为1
    };

    // 将单个商品信息传递给结算页面
    // 使用 Storage 传递复杂对象
    wx.setStorageSync('checkoutItems', [orderItem]); // 包装成数组，与购物车结算统一处理

    wx.navigateTo({
      url: '/pages/checkout/checkout?from=buyNow' // 添加一个来源参数
    });
  },

  // 用户点击右上角分享
  onShareAppMessage: function () {
    if (!this.data.book) {
      return {
        title: '分享一本好书给你',
        path: '/pages/index/index' // 默认分享到首页
      }
    }
    return {
      title: '推荐给你《' + this.data.book.title + '》',
      path: '/pages/bookDetail/bookDetail?id=' + this.data.bookId, // 分享出去的链接，别人打开会进入这个详情页
      imageUrl: this.data.book.coverUrl || (this.data.book.imageUrls && this.data.book.imageUrls[0]) // 分享卡片的配图
    }
  },
  // 分享到朋友圈 (如果需要)
  // onShareTimeline: function() {
  //   if (!this.data.book) return {};
  //   return {
  //     title: '推荐给你《' + this.data.book.title + '》',
  //     query: 'id=' + this.data.bookId, // 传递给页面的参数
  //     imageUrl: this.data.book.coverUrl || (this.data.book.imageUrls && this.data.book.imageUrls[0])
  //   }
  // }
})