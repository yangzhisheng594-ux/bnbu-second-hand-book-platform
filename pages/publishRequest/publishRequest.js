// pages/publishRequest/publishRequest.js
const app = getApp(); // 如果需要用到全局变量或方法

Page({
  data: {
    requestId: null, // 如果是编辑，则有值
    formData: {
      coverImageUrl: '', // 存储的是云存储的 FileID 或 HTTPS 临时链接
      expectedPrice: '',
      courseCode: '',
      title: '',
      author: '',
      description: ''
    },
    tempFileForUpload: null, // 临时存储用户选择的图片本地路径
    submitting: false,
    // 模拟的待编辑求购数据源 (实际应从云函数 getPurchaseRequestDetail 获取)
    // existingRequestData: { ... } // 这部分可以移除，或仅作本地测试用
  },

  onLoad: async function (options) { // 改为 async 以便使用 await
    if (options.id) {
      this.setData({ requestId: options.id });
      wx.setNavigationBarTitle({ title: '编辑求购' });
      await this.loadRequestDataFromServer(options.id); // 从服务器加载数据
    } else {
      wx.setNavigationBarTitle({ title: '发布求购' });
      this.setData({
        formData: { coverImageUrl: '', expectedPrice: '', courseCode: '', title: '', author: '', description: '' },
        tempFileForUpload: null,
        requestId: null
      });
    }
  },

  goBack: function() { wx.navigateBack(); },

  // 从服务器加载求购数据 (用于编辑)
  loadRequestDataFromServer: async function(requestId) {
    if (!requestId) return;
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getPurchaseRequestDetail', // 假设你有这个云函数
        data: { requestId: requestId }
      });
      wx.hideLoading();
      if (res.result && res.result.success && res.result.data) {
        this.setData({
          formData: { // 假设云函数返回的数据结构与 formData 匹配
            coverImageUrl: res.result.data.coverImageUrl || '',
            expectedPrice: res.result.data.expectedPrice || '',
            courseCode: res.result.data.courseCode || '',
            title: res.result.data.title || '',
            author: res.result.data.author || '',
            description: res.result.data.description || ''
          },
          // 注意：如果 coverImageUrl 是 fileID，前端直接显示可能需要特殊处理或获取临时链接
          // 这里我们假设它已经是可直接显示的URL或fileID能在image标签中直接用
        });
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '加载求购信息失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('加载求购信息失败:', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }
  },

  handleInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 选择封面图片
  chooseCoverImage: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        // 预览并暂存，不立即上传
        this.setData({
          'formData.coverImageUrl': tempFilePath, // 临时显示本地路径供预览
          tempFileForUpload: tempFilePath // 存储真实本地路径用于后续上传
        });
      },
      fail: (err) => {
        if (err.errMsg !== "chooseMedia:fail cancel") {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      }
    });
  },

  // 上传图片到云存储 (在提交表单时调用)
  uploadImageToCloudStorage: async function (filePath) {
    if (!filePath || !filePath.startsWith('wxfile://') && !filePath.startsWith('http://tmp/')) { // 简单判断是否是本地临时文件
      // 如果 filePath 已经是云存储的 FileID 或 HTTPS 链接 (编辑模式下未修改图片)，则直接返回
      if (this.data.formData.coverImageUrl === filePath) {
        return filePath;
      }
      // 如果是空或者无效路径，返回 null 或空字符串
      return null;
    }

    const cloudPath = `purchase_request_covers/${Date.now()}-${Math.floor(Math.random() * 100000)}.jpg`; // 自定义云端路径
    try {
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
      });
      console.log('Upload success, fileID:', uploadResult.fileID);
      return uploadResult.fileID; // 返回云存储的 FileID
    } catch (err) {
      console.error('上传图片到云存储失败:', err);
      wx.showToast({ title: '封面上传失败', icon: 'none' });
      throw err; // 抛出错误，让 submitRequestForm 知道上传失败
    }
  },

  removeCoverImage: function () {
    this.setData({
      'formData.coverImageUrl': '',
      tempFileForUpload: null
    });
  },

  previewUploadedImage: function() {
    const previewUrl = this.data.formData.coverImageUrl;
    if (previewUrl) {
      // 如果是 FileID，可能需要先换取临时链接才能预览，但通常 image 标签能直接用 FileID
      wx.previewImage({
        current: previewUrl,
        urls: [previewUrl]
      });
    }
  },

  submitRequestForm: async function() { // 改为 async
    const values = this.data.formData;
    console.log('Request form data to submit:', values);

    if (!values.title.trim()) {
      wx.showToast({ title: '请输入书名', icon: 'none' });
      return;
    }
    if (!values.expectedPrice.trim() || isNaN(parseFloat(values.expectedPrice)) || parseFloat(values.expectedPrice) <= 0) {
      wx.showToast({ title: '请输入有效的期望价格', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.requestId ? '修改中...' : '发布中...', mask: true });

    let uploadedCoverFileID = values.coverImageUrl; // 默认为当前 formData 中的值 (可能是已有的 fileID 或空)

    // 如果用户新选择了图片 (tempFileForUpload 有值)
    if (this.data.tempFileForUpload) {
      try {
        uploadedCoverFileID = await this.uploadImageToCloudStorage(this.data.tempFileForUpload);
        if (!uploadedCoverFileID) { // 上传失败或返回空
            // uploadImageToCloudStorage 内部已提示，这里可以不再重复提示或给出更具体的
            wx.hideLoading();
            this.setData({ submitting: false });
            return; // 阻止后续提交
        }
      } catch (uploadError) {
        // uploadImageToCloudStorage 内部已提示
        wx.hideLoading();
        this.setData({ submitting: false });
        return; // 阻止后续提交
      }
    } else if (!values.coverImageUrl && this.data.requestId) {
      // 编辑模式下，如果用户移除了原有图片，则 coverImageUrl 为空
      uploadedCoverFileID = '';
    }


    const requestPayload = {
      requestId: this.data.requestId || null,
      requestData: {
        ...values, // 展开 formData 中的所有字段
        coverImageUrl: uploadedCoverFileID // 使用上传后的 FileID 或已有的/清空的
      }
    };

    try {
      const res = await wx.cloud.callFunction({
        name: 'publishOrUpdateRequest', // 确保你有这个云函数
        data: requestPayload
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: res.result.message || (this.data.requestId ? '修改成功' : '发布成功'), icon: 'success' });
        app.globalData.requestListNeedRefresh = true;
        // 触发前一个页面的刷新 (如果“我的求购”列表页需要更新)
        const pages = getCurrentPages();
        if (pages.length > 1) {
          const prevPage = pages[pages.length - 2];
          // 假设求购列表页是 'pages/requestList/requestList' 或 'pages/request/request'
          if ((prevPage.route === 'pages/requestList/requestList' || prevPage.route === 'pages/request/request') && typeof prevPage.onPullDownRefresh === 'function') {
            prevPage.onPullDownRefresh();
          }
        }
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('调用 publishOrUpdateRequest 云函数失败:', err);
      wx.showToast({ title: '请求失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  deleteRequest: function() {
    if (!this.data.requestId) return;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条求购信息吗？',
      confirmColor: '#e64340',
      success: async (res) => { // 改为 async
        if (res.confirm) {
          this.setData({ submitting: true });
          wx.showLoading({ title: '删除中...', mask: true });
          try {
            const delRes = await wx.cloud.callFunction({
              name: 'deletePurchaseRequest', // 确保你有这个云函数
              data: { requestId: this.data.requestId }
            });
            wx.hideLoading();
            if (delRes.result && delRes.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              app.globalData.requestListNeedRefresh = true;
              const pages = getCurrentPages();
              if (pages.length > 1) {
                const prevPage = pages[pages.length - 2];
                if ((prevPage.route === 'pages/requestList/requestList' || prevPage.route === 'pages/request/request') && typeof prevPage.onPullDownRefresh === 'function') {
                  prevPage.onPullDownRefresh();
                }
              }
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({ title: (delRes.result && delRes.result.message) || '删除失败', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            console.error('调用 deletePurchaseRequest 云函数失败:', err);
            wx.showToast({ title: '删除请求失败', icon: 'none' });
          } finally {
            this.setData({ submitting: false });
          }
        }
      }
    });
  }
});
