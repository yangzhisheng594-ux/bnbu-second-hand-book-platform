// pages/checkout/checkout.js
const app = getApp();

Page({
  data: {
    orderItems: [],
    totalOrderPrice: 0,
    source: '' // 记录来源 'cart' 或 'buyNow'
  },

  onLoad: function (options) {
    const items = wx.getStorageSync('checkoutItems');
    wx.removeStorageSync('checkoutItems'); // 获取后立即删除，避免下次误用

    if (items && items.length > 0) {
      let totalPrice = 0;
      items.forEach(item => {
        totalPrice += (parseFloat(item.price) || 0) * (item.quantity || 1);
      });
      this.setData({
        orderItems: items,
        totalOrderPrice: totalPrice,
        source: options.from || 'cart' // 记录来源
      });
    } else {
      wx.showToast({ title: '订单信息错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  handlePayment: function() {
    // 按图3描述：当前账号无法使用收款功能，点击“支付”按钮后，会弹出确认框。
    // 点击确认支付，后端将删除对应商品，以此表示商品已售出。
    wx.showModal({
      title: '确认支付',
      content: `总计 ¥${this.data.totalOrderPrice.toFixed(2)}。确认后将模拟支付并标记商品为已售出。`,
      success: (res) => {
        if (res.confirm) {
          console.log('用户确认支付');
          // 模拟后端处理：
          // 1. 如果是从购物车来的，需要从全局购物车中移除这些已购买的商品
          if (this.data.source === 'cart') {
            const currentCart = app.globalData.cart || [];
            const idsToBuy = this.data.orderItems.map(item => item.id);
            const updatedCart = currentCart.filter(cartItem => !idsToBuy.includes(cartItem.id));
            app.globalData.cart = updatedCart;
            console.log('Cart updated after payment:', app.globalData.cart);
          }

          // 2. 标记商品已售出 (这通常是后端操作，前端仅模拟成功)
          //    例如，如果这些商品是用户发布的，可以更新其状态
          //    或者通知卖家商品已售出

          wx.showToast({
            title: '支付成功 (模拟)',
            icon: 'success',
            duration: 2000
          });

          // 跳转到订单成功页或返回首页/个人中心
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/index/index' // 或跳转到“我的订单”页面
            });
          }, 2000);
        } else if (res.cancel) {
          console.log('用户取消支付');
        }
      }
    });
  }
})