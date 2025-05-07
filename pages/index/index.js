// pages/index/index.js
Page({
  data: {
    // 畅销书籍 - 示例数据
    bestsellers: [
      {
        id: 1,
        coverUrl: '/images/placeholder_cover.png', // 建议尺寸 220x280 或类似比例
        title: '深入浅出Node.js',
        courseCode: 'CS001',
        price: '68.00'
      },
      {
        id: 2,
        coverUrl: '/images/placeholder_cover.png',
        title: 'JavaScript高级程序设计',
        courseCode: 'CS002',
        price: '99.00'
      },
      {
        id: 3,
        coverUrl: '/images/placeholder_cover.png',
        title: '小程序开发实战',
        courseCode: 'MP001',
        price: '59.50'
      },
      {
        id: 4,
        coverUrl: '/images/placeholder_cover.png',
        title: '算法导论',
        courseCode: 'CS003',
        price: '128.00'
      }
    ],
    // 最近新发布 - 示例数据
    recentReleases: [
      {
        id: 101,
        coverUrl: '/images/placeholder_cover_rect.png', // 建议尺寸 180x240 或类似比例
        title: 'Python从入门到实践（第2版）',
        courseCode: 'PY001',
        originalPrice: '89.00',
        price: '75.00'
      },
      {
        id: 102,
        coverUrl: '/images/placeholder_cover_rect.png',
        title: '你不知道的JavaScript（上卷）精装版',
        courseCode: 'JS005',
        originalPrice: '79.00',
        price: '65.00'
      },
      {
        id: 103,
        coverUrl: '/images/placeholder_cover_rect.png',
        title: '云原生架构：原理与实践',
        courseCode: 'CLOUD002',
        originalPrice: '98.00',
        price: '82.50'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 页面加载时可以从服务器获取数据，这里我们使用预设的假数据
    // 例如： this.fetchBestsellers();
    //       this.fetchRecentReleases();
  },

   // 新增：跳转到书籍详情页的事件处理函数
   navigateToBookDetail: function(event) {
    const bookId = event.currentTarget.dataset.id; // 获取通过 data-id 传递过来的书籍ID
    // const bookType = event.currentTarget.dataset.type; // 获取书籍类型（如果需要）

    console.log('Navigating to detail for book ID:', bookId);

    wx.navigateTo({
      url: '/pages/bookDetail/bookDetail?id=' + bookId // 将书籍ID作为参数传递给详情页
      // 如果还需要传递 type:
      // url: '/pages/bookDetail/bookDetail?id=' + bookId + '&type=' + bookType
    });
  }

  // 你可以在这里添加其他事件处理函数，例如：
  // handleSearchInput: function(e) {
  //   console.log('搜索内容：', e.detail.value);
  // },
  // tapSearchIcon: function() {
  //   console.log('点击了搜索图标');
  //   // 执行搜索逻辑
  // },
  // navigateToBookDetail: function(e) {
  //   const bookId = e.currentTarget.dataset.id;
  //   console.log('跳转到书籍详情页，ID：', bookId);
  //   // wx.navigateTo({ url: '/pages/bookDetail/bookDetail?id=' + bookId });
  // }
})