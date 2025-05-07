// pages/editProfile/editProfile.js
const app = getApp();
Page({
  data: {
    avatarUrl: '',
    nickName: ''
  },
  onLoad: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        avatarUrl: userInfo.avatarUrl,
        nickName: userInfo.nickName
      });
    }
  },
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    // 这里通常需要将 avatarUrl 上传到你的服务器，获取一个永久的URL
    // wx.uploadFile({ url: 'YOUR_UPLOAD_API', filePath: avatarUrl, name: 'file', ...})
    // 假设上传成功后，服务器返回 newAvatarServerUrl
    this.setData({ avatarUrl }); // 临时显示选择的，实际应为上传后的URL
    console.log("Choosen avatar (temp path):", avatarUrl);
  },
  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },
  saveProfile: function() {
    // 1. 校验数据
    if (!this.data.nickName.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    // 2. 调用API将修改后的 this.data.avatarUrl (应为服务器URL) 和 this.data.nickName 保存到后端
    wx.showLoading({ title: '保存中...' });
    // wx.request({ url: 'YOUR_SAVE_PROFILE_API', method: 'POST', data: { avatar: this.data.avatarUrl, nickname: this.data.nickName }, ... })
    setTimeout(() => { // 模拟保存
      wx.hideLoading();
      const newUserInfo = { ...wx.getStorageSync('userInfo'), avatarUrl: this.data.avatarUrl, nickName: this.data.nickName };
      app.globalData.userInfo = newUserInfo;
      wx.setStorageSync('userInfo', newUserInfo);
      wx.showToast({ title: '保存成功' });
      wx.navigateBack();
    }, 1000);
  }
})