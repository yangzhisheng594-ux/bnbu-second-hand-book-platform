// pages/publishRequest/publishRequest.js
Page({
  data: {
    requestId: null, // 如果是编辑，则有值
    formData: {
      expectedPrice: '',
      courseCode: '',
      title: '',
      author: '',
      description: '' // 补充说明
    },
    submitting: false,
    // 模拟的待编辑求购数据源
    existingRequestData: {
      'req1': { id: 'req1', title: '急求一本《现代操作系统》第4版', author: 'Andrew S. Tanenbaum', courseCode: 'CS003', expectedPrice: '30.00', description: '最好是中文版，无过多笔记。' },
      'req2': { id: 'req2', title: '求购《数据密集型应用系统设计》DDIA', author: 'Martin Kleppmann', courseCode: '', expectedPrice: '60.00', description: '英文原版也可。' },
    }
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ requestId: options.id });
      wx.setNavigationBarTitle({ title: '编辑求购' });
      this.loadRequestData(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '发布求购' });
      this.setData({ // 清空表单
        formData: { expectedPrice: '', courseCode: '', title: '', author: '', description: '' }
      });
    }
  },

  loadRequestData: function(requestId) {
    const request = this.data.existingRequestData[requestId];
    if (request) {
      this.setData({
        formData: {
          expectedPrice: request.expectedPrice || '',
          courseCode: request.courseCode || '',
          title: request.title || '',
          author: request.author || '',
          description: request.description || ''
        }
      });
    } else {
      wx.showToast({ title: '求购信息加载失败', icon: 'none' });
    }
  },

  handleInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  submitRequestForm: function(e) {
    const values = this.data.formData;
    console.log('Request form data to submit:', values);

    // 表单校验
    if (!values.title.trim()) {
      wx.showToast({ title: '请输入书名', icon: 'none' });
      return;
    }
    if (!values.expectedPrice.trim() || isNaN(parseFloat(values.expectedPrice)) || parseFloat(values.expectedPrice) <= 0) {
      wx.showToast({ title: '请输入有效的期望价格', icon: 'none' });
      return;
    }
    // 更多校验...

    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.requestId ? '修改中...' : '发布中...', mask: true });

    const submitData = {
      ...values,
      ...(this.data.requestId && { id: this.data.requestId })
    };

    const apiUrl = this.data.requestId ? `YOUR_API/requests/${this.data.requestId}` : 'YOUR_API/requests';
    const method = this.data.requestId ? 'PUT' : 'POST';

    wx.request({
      url: apiUrl, // 替换为你的求购数据提交API
      method: method,
      data: submitData,
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          wx.showToast({ title: this.data.requestId ? '修改成功' : '发布成功', icon: 'success' });
          // getApp().globalData.requestListNeedRefresh = true; // 通知request页面刷新
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          wx.showToast({ title: '操作失败: ' + (res.data.message || '请稍后重试'), icon: 'none' });
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ submitting: false });
        wx.hideLoading();
      }
    });
  },

  deleteRequest: function() {
    if (!this.data.requestId) return;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条求购信息吗？',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          this.setData({ submitting: true });
          wx.showLoading({ title: '删除中...', mask: true });
          wx.request({
            url: `YOUR_API/requests/${this.data.requestId}`, // 替换为你的删除API
            method: 'DELETE',
            success: (delRes) => {
              if (delRes.statusCode === 200 || delRes.statusCode === 204) {
                wx.showToast({ title: '删除成功', icon: 'success' });
                // getApp().globalData.requestListNeedRefresh = true;
                setTimeout(() => {
                  wx.navigateBack();
                }, 1500);
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: () => { wx.showToast({ title: '网络错误', icon: 'none' }); },
            complete: () => {
              this.setData({ submitting: false });
              wx.hideLoading();
            }
          });
        }
      }
    });
  }
})