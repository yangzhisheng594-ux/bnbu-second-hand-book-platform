// pages/index/index.js
Page({
  data: {
    bestsellers: [],
    recentReleases: [],
    keyword: '',
    isLoading: false,
    loadFailed: false,
    courseOptions: [],
    selectedCourseIndex: 0,
    selectedCourseLabel: '',
    courseMatches: [],
    courseRequests: [],
    courseRequestMatches: [],
    courseMatchMessage: '正在为你准备课程教材…',
    isCourseMatching: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.fetchHomepageBooks();
  },

  /**
   * 生命周期函数--监听页面显示
   * 每次进入页面都刷新可以考虑放在这里，但 onLoad 通常用于首次加载
   */
  onShow: function () {
    // 如果需要每次进入页面都刷新，可以在这里调用 this.fetchHomepageBooks();
    // 但要注意可能带来的性能影响和用户体验（频繁loading）
    // 如果 onLoad 已经加载，可以根据具体需求决定是否在 onShow 中再次加载
  },

  /**
   * 获取首页书籍数据
   */
  fetchHomepageBooks: async function(showLoading = true) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true, loadFailed: false });
    if (showLoading) wx.showLoading({ title: '加载中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getBooksForHomepage' // 调用你新创建的云函数
        // data: {} // 如果云函数需要参数，在这里传递
      });
      if (showLoading) wx.hideLoading();

      console.log('[Homepage] fetchHomepageBooks result:', res);

      if (res.result && res.result.success && res.result.data) {
        const bestsellers = res.result.data.bestsellers || [];
        const recentReleases = res.result.data.recentReleases || [];
        let courseRequests = [];
        try {
          const seekingRes = await wx.cloud.callFunction({
            name: 'getSeekingPosts',
            data: { page: 1, pageSize: 30 }
          });
          if (seekingRes.result && seekingRes.result.success) courseRequests = seekingRes.result.data || [];
        } catch (requestError) {
          console.warn('[Homepage] unable to load course requests:', requestError);
        }
        this.setData({
          bestsellers,
          recentReleases,
          courseRequests,
          loadFailed: false
        });
        this.prepareCourseMatcher(bestsellers, recentReleases, courseRequests);
      } else {
        console.error('Failed to fetch homepage books:', res.result);
        wx.showToast({
          title: (res.result && res.result.message) || '加载首页数据失败',
          icon: 'none',
          duration: 2000
        });
        this.setData({ loadFailed: true });
      }
    } catch (err) {
      if (showLoading) wx.hideLoading();
      console.error('Error calling getBooksForHomepage cloud function (catch block):', err);
      let errMsg = '网络请求失败';
      if (err.errMsg && err.errMsg.includes('functions execute fail')) {
          // 可以尝试从 err.errMsg 中提取更具体的云函数错误信息
          // 但通常云函数内部的业务错误会在 res.result.message 中
      }
      wx.showToast({
        title: errMsg + '，请稍后重试',
        icon: 'none',
        duration: 2000
      });
      this.setData({ loadFailed: true });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    console.log('[Homepage] User pulled down to refresh.');
    // 下拉刷新时重新加载数据
    this.fetchHomepageBooks(false).then(() => {
      wx.stopPullDownRefresh(); // 数据加载完成后停止下拉刷新动画
      if (!this.data.loadFailed) wx.showToast({ title: '刷新成功', icon: 'success', duration: 1000 });
    }).catch(() => {
      wx.stopPullDownRefresh();
      // 错误已在 fetchHomepageBooks 中提示
    });
  },

  // 跳转到书籍详情页的事件处理函数 (这个函数保持不变)
  navigateToBookDetail: function(event) {
    const bookId = event.currentTarget.dataset.id;
    if (!bookId) {
      console.warn('navigateToBookDetail called without a bookId.');
      wx.showToast({ title: '无法打开书籍详情', icon: 'none'});
      return;
    }
    console.log('Navigating to detail for book ID:', bookId);
    wx.navigateTo({
      url: '/pages/bookDetail/bookDetail?id=' + bookId
    });
  },

  handleKeywordInput: function(event) {
    this.setData({ keyword: event.detail.value });
  },

  prepareCourseMatcher: function(bestsellers, recentReleases, courseRequests = []) {
    const allBooks = [];
    const seenBookIds = new Set();
    [...bestsellers, ...recentReleases].forEach(book => {
      if (book && book.id && !seenBookIds.has(book.id)) {
        seenBookIds.add(book.id);
        allBooks.push(book);
      }
    });
    this.homepageBooks = allBooks;

    const seenCourses = new Set();
    const courseOptions = allBooks.reduce((options, book) => {
      const code = String(book.courseCode || '').trim();
      if (!code || seenCourses.has(code)) return options;
      seenCourses.add(code);
      options.push({ value: code, label: `${code} · ${book.title}` });
      return options;
    }, []);
    courseRequests.forEach(request => {
      const code = String(request.courseCode || '').trim();
      if (!code || seenCourses.has(code)) return;
      seenCourses.add(code);
      courseOptions.push({ value: code, label: `${code} · 求购：${request.title}` });
    });

    const previousCourse = this.data.selectedCourseLabel;
    const selectedCourseIndex = Math.max(courseOptions.findIndex(item => item.value === previousCourse), 0);
    const selected = courseOptions[selectedCourseIndex];
    this.setData({
      courseOptions,
      selectedCourseIndex,
      selectedCourseLabel: selected ? selected.value : '',
      courseMatches: [],
      courseRequestMatches: []
    }, () => {
      if (selected) {
        this.fetchCourseMatches(selected.value);
        this.filterCourseRequests(selected.value);
      }
    });
  },

  handleCourseChange: function(event) {
    const selectedCourseIndex = Number(event.detail.value) || 0;
    const selected = this.data.courseOptions[selectedCourseIndex];
    if (!selected) return;
    this.setData({
      selectedCourseIndex,
      selectedCourseLabel: selected.value,
      courseMatches: [],
      courseRequestMatches: [],
      courseMatchMessage: '正在进行精准匹配…'
    }, () => {
      this.fetchCourseMatches(selected.value);
      this.filterCourseRequests(selected.value);
    });
  },

  filterCourseRequests: function(courseCode) {
    const courseRequestMatches = (this.data.courseRequests || [])
      .filter(request => request.courseCode === courseCode)
      .slice(0, 2);
    this.setData({ courseRequestMatches });
  },

  respondToCourseRequest: function(event) {
    const { courseCode, title } = event.currentTarget.dataset;
    if (!courseCode) return;
    wx.showModal({
      title: '回应同学求购',
      content: `发布一本 ${courseCode} 课程教材，系统会自动帮你带入课程信息。`,
      confirmText: '去发布',
      success: result => {
        if (!result.confirm) return;
        wx.navigateTo({
          url: `/pages/publish/publish?courseCode=${encodeURIComponent(courseCode)}&title=${encodeURIComponent(title || '')}&fromRequest=1`
        });
      }
    });
  },

  matchSelectedCourse: function() {
    if (!this.data.selectedCourseLabel) {
      wx.showToast({ title: '请先选择课程代码', icon: 'none' });
      return;
    }
    this.fetchCourseMatches(this.data.selectedCourseLabel);
  },

  fetchCourseMatches: async function(courseCode) {
    if (!courseCode || this.data.isCourseMatching) return;
    this.setData({ isCourseMatching: true, courseMatchMessage: `正在匹配 ${courseCode} 课程教材…` });
    let matches = [];
    let total = 0;
    try {
      const res = await wx.cloud.callFunction({
        name: 'getBooks',
        data: { type: 'recent', courseCode, page: 1, pageSize: 3 }
      });
      if (res.result && res.result.success) {
        matches = res.result.data || [];
        total = Number(res.result.pagination && res.result.pagination.totalItems) || matches.length;
      } else {
        throw new Error('课程匹配服务未返回结果');
      }
    } catch (error) {
      console.warn('[Homepage] course match fallback:', error);
      matches = (this.homepageBooks || []).filter(book => book.courseCode === courseCode);
      total = matches.length;
    }
    this.setData({
      isCourseMatching: false,
      courseMatches: matches.slice(0, 3),
      courseMatchMessage: total > 0
        ? `已为 ${courseCode} 精准找到 ${total} 本可交易教材`
        : `暂未找到 ${courseCode} 的在售教材`
    });
  },

  submitSearch: function() {
    const keyword = this.data.keyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入书名、课程号或作者', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/search/search?keyword=${encodeURIComponent(keyword)}` });
  },

  goToCollection: function(event) {
    const collection = event.currentTarget.dataset.collection;
    if (!['hot', 'recent'].includes(collection)) return;
    wx.navigateTo({ url: `/pages/search/search?collection=${collection}` });
  },

  retryLoad: function() {
    this.fetchHomepageBooks();
  }
});
