// pages/cart/cart.js
const app = getApp();

Page({
  data: {
    cartItems: [],
    isManaging: false, // 是否处于管理模式
    isAllSelected: false,
    totalPrice: 0,
    selectedCount: 0
  },

  onShow: function () {
    // 每次进入页面都从全局数据加载购物车并重新计算
    this.loadCartData();
  },

  loadCartData: function() {
    const cart = app.globalData.cart || [];
    // 确保每个商品都有 selected 状态，如果没有，默认为 true
    const processedCart = cart.map(item => ({
      ...item,
      selected: item.selected === undefined ? true : item.selected,
      price: parseFloat(item.price) || 0 // 确保价格是数字
    }));
    this.setData({
      cartItems: processedCart
    });
    this.calculateTotals();
  },

  toggleManageMode: function () {
    this.setData({
      isManaging: !this.data.isManaging
    });
    // 退出管理模式时，可能需要重置选择状态或按需处理
    if (!this.data.isManaging) {
       this.calculateTotals(); // 确保合计价格正确
    } else {
        this.setData({selectedCount: 0}); // 管理模式下初始已选为0
    }
  },

  toggleSelectItem: function (e) {
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    cartItems[index].selected = !cartItems[index].selected;
    this.setData({ cartItems });
    this.calculateTotals();
  },

  toggleSelectAll: function () {
    const isAllSelected = !this.data.isAllSelected;
    const cartItems = this.data.cartItems.map(item => {
      item.selected = isAllSelected;
      return item;
    });
    this.setData({
      cartItems,
      isAllSelected
    });
    this.calculateTotals();
  },

  calculateTotals: function () {
    let totalPrice = 0;
    let selectedCount = 0;
    let allSelectedInItems = true; // 假设所有商品都被选中了

    this.data.cartItems.forEach(item => {
      if (item.selected) {
        totalPrice += item.price * (item.quantity || 1); // 乘以数量
        selectedCount++;
      } else {
        allSelectedInItems = false; // 只要有一个未选中，全选就不是 true
      }
    });

    this.setData({
      totalPrice,
      selectedCount,
      // 如果购物车为空，isAllSelected 应为 false
      isAllSelected: this.data.cartItems.length > 0 ? allSelectedInItems : false
    });
  },

  // // 如果有数量调整功能
  // decreaseQuantity: function(e) { /* ...实现数量减少并更新购物车和总价... */ },
  // increaseQuantity: function(e) { /* ...实现数量增加并更新购物车和总价... */ },

  deleteSelectedItems: function () {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请选择要删除的商品', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定要删除选中的 ${this.data.selectedCount} 件商品吗？`,
      success: (res) => {
        if (res.confirm) {
          const remainingItems = this.data.cartItems.filter(item => !item.selected);
          app.globalData.cart = remainingItems; // 更新全局购物车
          this.setData({
            cartItems: remainingItems
          });
          this.calculateTotals(); // 重新计算
          wx.showToast({ title: '删除成功', icon: 'success' });
        }
      }
    });
  },

  checkout: function () {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请选择要结算的商品', icon: 'none' });
      return;
    }
    const itemsToCheckout = this.data.cartItems.filter(item => item.selected);
    console.log('Items to checkout:', itemsToCheckout);

    // 使用 Storage 传递复杂对象
    wx.setStorageSync('checkoutItems', itemsToCheckout);

    wx.navigateTo({
      url: '/pages/checkout/checkout?from=cart'
    });
  },

  goShopping: function() {
    wx.switchTab({
      url: '/pages/index/index' // 跳转到首页或其他商品列表页
    });
  }
});