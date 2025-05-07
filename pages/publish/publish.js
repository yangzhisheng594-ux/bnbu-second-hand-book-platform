// pages/publish/publish.js
Page({
  data: {
    bookId: null, // 如果是编辑，则有值
    imageUrls: [], // 已选择的图片本地路径
    formData: {
      description: '',
      price: '',
      courseCode: '',
      title: '',
      author: ''
    },
    submitting: false, // 防止重复提交
    // 模拟的待编辑书籍数据源
    existingBookData: {
      's1': { id: 's1', title: '我的算法笔记（精装版）', author: '张三', courseCode: 'CS008', price: '45.00', description: '9成新，少量笔记。', coverUrl: '/images/placeholder_cover.png', images: ['/images/placeholder_cover.png', '/images/placeholder_cover2.png'] },
      's2': { id: 's2', title: '操作系统概念（龙书）', author: '李四', courseCode: 'CS009', price: '88.00', description: '几乎全新。', coverUrl: '/images/placeholder_cover_rect.png', images: ['/images/placeholder_cover_rect.png'] },
    }
  },

  onLoad: function (options) {
    if (options.id) { // 如果有id，说明是编辑模式
      this.setData({ bookId: options.id });
      wx.setNavigationBarTitle({ title: '编辑书籍' });
      this.loadBookData(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '发布书籍' });
      // 清空表单，确保新建时是干净的
      this.setData({
        imageUrls: [],
        formData: { description: '', price: '', courseCode: '', title: '', author: '' }
      });
    }
  },

  loadBookData: function(bookId) {
    // 模拟加载待编辑书籍数据
    const book = this.data.existingBookData[bookId];
    if (book) {
      this.setData({
        formData: {
          description: book.description || '',
          price: book.price || '',
          courseCode: book.courseCode || '',
          title: book.title || '',
          author: book.author || ''
        },
        imageUrls: book.images || (book.coverUrl ? [book.coverUrl] : []) // 如果有images数组用它，否则用coverUrl
      });
    } else {
      wx.showToast({ title: '书籍信息加载失败', icon: 'none' });
      // 考虑返回上一页
    }
  },

  handleInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
    if (field === 'description') { // 实时更新字数
      // WXML中已通过 formData.description.length 实现
    }
  },

  chooseImage: function() {
    const count = 9 - this.data.imageUrls.length; // 最多还可以选择几张
    if (count <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({ // chooseMedia 支持图片和视频，这里我们只用图片
      count: count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePaths = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          imageUrls: this.data.imageUrls.concat(tempFilePaths)
        });
      },
      fail: (err) => {
        console.log('Choose image failed', err);
      }
    });
  },

  previewImage: function(e) {
    const currentSrc = e.currentTarget.dataset.src;
    wx.previewImage({
      current: currentSrc,
      urls: this.data.imageUrls
    });
  },

  deleteImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const newImageUrls = [...this.data.imageUrls];
    newImageUrls.splice(index, 1);
    this.setData({ imageUrls: newImageUrls });
  },

  submitForm: function(e) {
    const values = this.data.formData; // 使用 data-field 双向绑定的数据
    console.log('Form data to submit:', values);
    console.log('Images to upload:', this.data.imageUrls);

    // 1. 表单校验
    if (!values.title.trim()) {
      wx.showToast({ title: '请输入书名', icon: 'none' });
      return;
    }
    if (!values.price.trim() || isNaN(parseFloat(values.price)) || parseFloat(values.price) <= 0) {
      wx.showToast({ title: '请输入有效的价格', icon: 'none' });
      return;
    }
    if (this.data.imageUrls.length === 0) {
      wx.showToast({ title: '请至少上传一张图片', icon: 'none' });
      return;
    }
    // 更多校验...

    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.bookId ? '修改中...' : '发布中...', mask: true });

    // 2. 上传图片 (如果图片是本地临时路径)
    //    你需要一个服务器端点来接收图片上传
    //    这里仅为示例，实际上传逻辑会更复杂，可能需要 Promise.all
    const uploadTasks = this.data.imageUrls.map(filePath => {
      if (filePath.startsWith('http')) { // 如果已经是网络图片 (编辑时可能出现)
        return Promise.resolve(filePath);
      }
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: 'YOUR_IMAGE_UPLOAD_API_ENDPOINT', // 替换为你的图片上传API
          filePath: filePath,
          name: 'file', // 后端接收文件的字段名
          // formData: { 'user': 'test' }, // 其他额外参数
          success: (uploadRes) => {
            if (uploadRes.statusCode === 200) {
              const serverUrl = JSON.parse(uploadRes.data).url; // 假设后端返回 { "url": "http://..." }
              resolve(serverUrl);
            } else {
              reject('Upload failed: ' + uploadRes.errMsg);
            }
          },
          fail: (err) => {
            reject('Upload request failed: ' + err.errMsg);
          }
        });
      });
    });

    Promise.all(uploadTasks)
      .then(uploadedImageUrls => {
        console.log('All images uploaded:', uploadedImageUrls);
        const submitData = {
          ...values,
          coverUrl: uploadedImageUrls[0], // 假设第一张是封面
          imageUrls: uploadedImageUrls, // 所有图片的网络地址
          // 如果是编辑，还需要 bookId
          ...(this.data.bookId && { id: this.data.bookId })
        };

        // 3. 提交表单数据到后端
        const apiUrl = this.data.bookId ? `YOUR_API/books/${this.data.bookId}` : 'YOUR_API/books';
        const method = this.data.bookId ? 'PUT' : 'POST';

        wx.request({
          url: apiUrl, // 替换为你的数据提交API
          method: method,
          data: submitData,
          success: (res) => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              wx.showToast({ title: this.data.bookId ? '修改成功' : '发布成功', icon: 'success' });
              // getApp().globalData.sellListNeedRefresh = true; // 通知sell页面刷新
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
      })
      .catch(err => {
        console.error('Image upload or data submit error:', err);
        wx.showToast({ title: '图片上传失败，请重试', icon: 'none' });
        this.setData({ submitting: false });
        wx.hideLoading();
      });
  },

  deleteBook: function() {
    if (!this.data.bookId) return;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这本书的发布信息吗？此操作不可撤销。',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          this.setData({ submitting: true });
          wx.showLoading({ title: '删除中...', mask: true });
          // 调用删除API
          wx.request({
            url: `YOUR_API/books/${this.data.bookId}`, // 替换为你的删除API
            method: 'DELETE',
            success: (delRes) => {
              if (delRes.statusCode === 200 || delRes.statusCode === 204) {
                wx.showToast({ title: '删除成功', icon: 'success' });
                // getApp().globalData.sellListNeedRefresh = true; // 通知sell页面刷新
                setTimeout(() => {
                  wx.navigateBack();
                }, 1500);
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '网络错误', icon: 'none' });
            },
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