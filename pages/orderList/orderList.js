// pages/orderList/orderList.js
Page({
  data: {
    currentStatus: 'all', // 当前显示的订单状态
    orders: [],
    // 模拟订单数据
    allMockOrders: [
      { orderId: '2024001', status: 'pendingPayment', statusText: '待付款', statusClass: 'pendingPayment', totalQuantity: 1, totalAmount: 68.00, products: [{ productId: '1', title: '深入浅出Node.js', coverUrl: '/images/placeholder_cover.png', quantity: 1, price: 68.00 }] },
      { orderId: '2024002', status: 'pendingReceipt', statusText: '待收货', statusClass: 'pendingReceipt', totalQuantity: 2, totalAmount: 158.50, products: [{ productId: '3', title: '小程序开发实战', coverUrl: '/images/placeholder_cover.png', quantity: 1, price: 59.50 }, { productId: '2', title: 'JavaScript高级程序设计', coverUrl: '/images/placeholder_cover_rect.png', quantity: 1, price: 99.00 }] },
      { orderId: '2024003', status: 'completed', statusText: '已完成', statusClass: 'completed', totalQuantity: 1, totalAmount: 75.00, products: [{ productId: '101', title: 'Python从入门到实践', coverUrl: '/images/placeholder_cover_rect.png', quantity: 1, price: 75.00 }] },
    ]
  },
  onLoad: function (options) {
    const status = options.status || 'all';
    this.setData({ currentStatus: status });
    wx.setNavigationBarTitle({ title: this.getNavTitleByStatus(status) });
    this.loadOrders(status);
  },
  getNavTitleByStatus(status) {
      switch(status) {
          case 'pendingPayment': return '待付款订单';
          case 'pendingShipment': return '待发货订单';
          case 'pendingReceipt': return '待收货订单';
          case 'afterSales': return '退款/售后';
          default: return '我的订单';
      }
  },
  loadOrders: function(status) {
    wx.showLoading({ title: '加载中...' });
    // 模拟API请求
    // wx.request({ url: `YOUR_API/orders?status=${status}`, ... })
    setTimeout(() => { // 模拟异步
      let filteredOrders = [];
      if (status === 'all') {
        filteredOrders = this.data.allMockOrders;
      } else {
        filteredOrders = this.data.allMockOrders.filter(order => order.status === status);
      }
      this.setData({ orders: filteredOrders });
      wx.hideLoading();
    }, 500);
  },
  // 如果有顶部tab切换功能
  // switchTab: function(e) {
  //   const status = e.currentTarget.dataset.status;
  //   if (status !== this.data.currentStatus) {
  //     this.setData({ currentStatus: status, orders: [] }); // 清空列表以便显示加载
  //     wx.setNavigationBarTitle({ title: this.getNavTitleByStatus(status) });
  //     this.loadOrders(status);
  //   }
  // }
})