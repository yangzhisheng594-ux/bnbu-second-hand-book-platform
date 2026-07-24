// pages/publish/publish.js
const app = getApp(); // 用于获取全局数据，如用户信息

Page({
  data: {
    bookId: null, // null if creating, holds ID if editing
    imageUrls: [], // Stores URLs/fileIDs for display and existing images
    tempFilePathsForUpload: [], // Stores new local file paths selected by user
    formData: { // Initialize all expected fields
      title: '',
      author: '',
      isbn: '',
      publisher: '',
      condition: '',
      price: '',
      originalPrice: '',
      courseCode: '',
      description: '',
      categoryId: null,
    },
    categories: [],
    selectedCategoryIndex: null,
    selectedCategoryName: '',
    submitting: false, // Flag to prevent double submission
  },

  onLoad: async function (options) {
    console.log('[PublishPage] onLoad, options:', options);
    await this.loadCategories();

    if (options.id) {
      // Edit mode
      this.setData({ bookId: options.id });
      wx.setNavigationBarTitle({ title: '编辑书籍' });
      this.loadBookDataForEdit(options.id);
    } else {
      // Create mode - Ensure form is reset
      wx.setNavigationBarTitle({ title: '发布书籍' });
      this.resetForm();
      if (options.courseCode) {
        const courseCode = decodeURIComponent(options.courseCode);
        const title = options.title ? decodeURIComponent(options.title) : '';
        this.setData({
          'formData.courseCode': courseCode,
          'formData.title': title,
          'formData.description': `回应课程求购：${courseCode}，支持校内面交与当面验书。`
        });
        wx.showToast({ title: '已带入课程求购信息', icon: 'success' });
      }
    }
  },

  goBack: function() { wx.navigateBack(); },

  async loadCategories() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getCategories' });
      if (res.result && res.result.success) {
        this.setData({ categories: res.result.data || [] });
      }
    } catch (error) {
      console.warn('[PublishPage] Unable to load categories:', error);
    }
  },

  // --- Form Reset Function ---
  resetForm: function() {
    this.setData({
      bookId: null,
      imageUrls: [],
      tempFilePathsForUpload: [],
      formData: {
        title: '',
        author: '',
        isbn: '',
        publisher: '',
        condition: '',
        price: '',
        originalPrice: '',
        courseCode: '',
        description: '',
        categoryId: null,
      },
      selectedCategoryIndex: null,
      selectedCategoryName: '',
      submitting: false
    });
  },

  // --- Data Loading for Edit Mode ---
  async loadBookDataForEdit(bookId) {
    console.log(`[PublishPage] Loading data for editing bookId: ${bookId}`);
    wx.showLoading({ title: '加载数据...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getBookDetail',
        data: { bookId: bookId }
      });
      wx.hideLoading();
      console.log('[PublishPage] getBookDetail result:', res.result);

      if (res.result && res.result.success && res.result.data) {
        const book = res.result.data;
        // Find category index
        let categoryIndex = null;
        if (book.categoryId && this.data.categories.length > 0) {
          const foundIndex = this.data.categories.findIndex(cat => cat.category_id === book.categoryId);
          if (foundIndex > -1) {
            categoryIndex = foundIndex;
          }
        }
        this.setData({
          formData: { // Populate form with existing data
            title: book.title || '',
            author: book.author || '',
            isbn: book.isbn || '',
            publisher: book.publisher || '',
            condition: book.condition || '',
            // Ensure prices are strings for the input fields if needed, or handle conversion
            price: book.price !== null && book.price !== undefined ? String(book.price) : '',
            originalPrice: book.originalPrice !== null && book.originalPrice !== undefined ? String(book.originalPrice) : '',
            courseCode: book.courseCode || '',
            description: book.description || '',
            categoryId: book.categoryId || null,
          },
          // Assume imageUrls from backend are valid URLs/fileIDs
          imageUrls: book.imageUrls || (book.coverUrl ? [book.coverUrl] : []),
          tempFilePathsForUpload: [], // Reset temp files for new uploads
          selectedCategoryIndex: categoryIndex,
          selectedCategoryName: categoryIndex !== null ? this.data.categories[categoryIndex].name : '',
        });
      } else {
        wx.showToast({ title: '书籍信息加载失败', icon: 'none' });
        console.error("Failed to load book data:", res.result ? res.result.message : "No result object");
        // Optionally navigate back if loading fails critically
        // setTimeout(() => { wx.navigateBack(); }, 1500);
      }
    } catch (e) {
      wx.hideLoading();
      console.error("Error loading book data for edit:", e);
      wx.showToast({ title: '加载数据出错', icon: 'none' });
    }
  },

  // --- Input Handling ---
  // Generic input handler - updates corresponding field in formData
  handleInputChange: function(e) {
    const field = e.currentTarget.dataset.field; // e.g., "title", "author"
    if (field) {
      this.setData({
        [`formData.${field}`]: e.detail.value // Update the specific field
      });
    } else {
      console.warn("Input change event missing data-field attribute:", e);
    }
  },

  // Category Picker Change Handler
  onCategoryChange: function(e) {
    const index = e.detail.value;
    if (this.data.categories[index]) { // Check if index is valid
      this.setData({
        selectedCategoryIndex: index,
        selectedCategoryName: this.data.categories[index].name,
        'formData.categoryId': this.data.categories[index].category_id
      });
    } else {
       console.error("Invalid category index selected:", index);
       this.setData({ // Reset if invalid selection occurs
        selectedCategoryIndex: null,
         selectedCategoryName: '',
         'formData.categoryId': null
       });
    }
  },

  // --- Image Handling ---
  chooseImage: function() {
    // Calculate how many more images can be selected
    const currentTotalImages = this.data.imageUrls.length; // Only count displayed images for limit
    const count = 9 - currentTotalImages;
    if (count <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'], // Use compressed images
      success: (res) => {
        const newTempFiles = res.tempFiles.map(file => file.tempFilePath);
        console.log('[PublishPage] Images chosen:', newTempFiles);
        this.setData({
          // Add to list for uploading
          tempFilePathsForUpload: this.data.tempFilePathsForUpload.concat(newTempFiles),
          // Add to list for display (immediately show selection)
          imageUrls: this.data.imageUrls.concat(newTempFiles)
        });
      },
      fail: (err) => {
          console.log("[PublishPage] chooseMedia failed:", err);
          if (err.errMsg !== "chooseMedia:fail cancel") { // Ignore user cancellation
             wx.showToast({ title: '选择图片失败', icon: 'none' });
          }
      }
    });
  },

  previewImage: function(e) {
    const currentUrl = e.currentTarget.dataset.url;
    // Filter out potential non-URL/non-fileID strings if necessary
    const urlsToPreview = this.data.imageUrls.filter(url => typeof url === 'string' && url.length > 0);
    wx.previewImage({
      current: currentUrl, // Current image URL to show
      urls: urlsToPreview // List of URLs to preview
    });
  },

  deleteImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const targetUrl = this.data.imageUrls[index];
    console.log(`[PublishPage] Deleting image at index ${index}:`, targetUrl);

    const newImageUrls = [...this.data.imageUrls];
    newImageUrls.splice(index, 1); // Remove from display list

    // Also remove from the list of *new* files to be uploaded, if it was there
    const newTempFilePaths = this.data.tempFilePathsForUpload.filter(path => path !== targetUrl);

    this.setData({
      imageUrls: newImageUrls,
      tempFilePathsForUpload: newTempFilePaths
    });
    console.log('[PublishPage] Image lists after deletion:', this.data.imageUrls, this.data.tempFilePathsForUpload);

    // Note: If editing, deleting an *existing* image (already a fileID/URL)
    // requires calling a cloud function to delete the file from cloud storage.
    // This example only handles removing it from the frontend list.
    // A more robust implementation would check if targetUrl is a fileID and call a deleteFile function.
  },

  // --- Form Submission ---
  submitForm: async function() {
    if (this.data.submitting) {
      console.log('[PublishPage] Submission already in progress.');
      return; // Prevent double submission
    }

    // --- *** FIX POINT: Safely Access and Trim Data *** ---
    // Create a cleaned data object to avoid modifying this.data directly before validation
    const cleanedFormData = {};
    const rawFormData = this.data.formData;

    // Trim string fields safely
    cleanedFormData.title = (rawFormData.title || '').trim();
    cleanedFormData.author = (rawFormData.author || '').trim();
    cleanedFormData.isbn = (rawFormData.isbn || '').trim();
    cleanedFormData.publisher = (rawFormData.publisher || '').trim();
    cleanedFormData.condition = (rawFormData.condition || '').trim();
    cleanedFormData.courseCode = (rawFormData.courseCode || '').trim();
    cleanedFormData.description = (rawFormData.description || '').trim();

    // Handle numeric fields (Price is required, Original Price is optional)
    cleanedFormData.price = (rawFormData.price || '').trim();
    cleanedFormData.originalPrice = (rawFormData.originalPrice || '').trim();

    // Category ID
    cleanedFormData.categoryId = rawFormData.categoryId; // Already handled by picker

    console.log('[PublishPage] Cleaned form data for validation:', cleanedFormData);
    console.log('[PublishPage] Current imageUrls (for display):', this.data.imageUrls);
    console.log('[PublishPage] New tempFilePaths for upload:', this.data.tempFilePathsForUpload);


    // --- Form Validation (using cleaned data) ---
    if (!cleanedFormData.title) { wx.showToast({ title: '请输入书名', icon: 'none' }); return; }
    if (!cleanedFormData.description) { wx.showToast({ title: '请输入书籍描述', icon: 'none' }); return; } // Example: Add description validation
    if (!cleanedFormData.price || isNaN(parseFloat(cleanedFormData.price)) || parseFloat(cleanedFormData.price) <= 0) {
      wx.showToast({ title: '请输入有效的售卖价格', icon: 'none' }); return;
    }
    // Validate optional original price if entered
    if (cleanedFormData.originalPrice && (isNaN(parseFloat(cleanedFormData.originalPrice)) || parseFloat(cleanedFormData.originalPrice) < 0)) {
        wx.showToast({ title: '请输入有效的原价或留空', icon: 'none' }); return;
    }
    // Image validation: Must have at least one image (either existing or newly added)
    if (this.data.imageUrls.length === 0) { // Check the display list length
      wx.showToast({ title: '请至少上传一张图片', icon: 'none' }); return;
    }
    // Add more specific validations as needed (e.g., ISBN format, course code format)


    // --- Start Submission Process ---
    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.bookId ? '修改中...' : '发布中...', mask: true });

    try {
      // 1. Upload NEW images (if any)
      let uploadedNewFileIDs = [];
      if (this.data.tempFilePathsForUpload.length > 0) {
        console.log('[PublishPage] Uploading new images...');
        const uploadPromises = this.data.tempFilePathsForUpload.map(filePath => {
          const timestamp = Date.now();
          const randomSuffix = Math.floor(Math.random() * 1000);
          // Construct a unique cloud path
          const cloudPath = `book_images/${app.globalData.userInfo?.open_id || 'public'}/${timestamp}_${randomSuffix}.${filePath.split('.').pop() || 'jpg'}`;

          console.log(`[PublishPage] Uploading: ${filePath} to ${cloudPath}`);
          return wx.cloud.uploadFile({ cloudPath, filePath });
        });
        // Wait for all uploads to complete
        const uploadResults = await Promise.all(uploadPromises);
        // Check for upload errors (basic check)
        if (uploadResults.some(result => !result.fileID)) {
            throw new Error('部分图片上传失败'); // Throw error to be caught below
        }
        uploadedNewFileIDs = uploadResults.map(result => result.fileID);
        console.log('[PublishPage] New images uploaded. FileIDs:', uploadedNewFileIDs);
      } else {
        console.log('[PublishPage] No new images to upload.');
      }

      // 2. Determine the final list of image fileIDs to save
      // Combine existing valid fileIDs/URLs (if editing) with newly uploaded ones
      // Filter out local temporary paths from the existing imageUrls list
      const existingFileIDsOrURLs = this.data.imageUrls.filter(url =>
          typeof url === 'string' && !url.startsWith('http://tmp/') && !url.startsWith('wxfile://')
      );
      const finalImageFileIDs = existingFileIDsOrURLs.concat(uploadedNewFileIDs);

      console.log('[PublishPage] Final image fileIDs/URLs for submission:', finalImageFileIDs);

      // Re-check if after processing, there are still no images
      if (finalImageFileIDs.length === 0) {
        throw new Error('没有有效的图片信息'); // Throw error
      }

      // 3. Prepare data for the cloud function, including cleaned form data
      const cloudFunctionData = {
        // Use the cleaned and validated data
        formData: {
            ...cleanedFormData, // Spread cleaned string fields
            // Ensure numeric fields are sent as numbers
            price: parseFloat(cleanedFormData.price),
            originalPrice: cleanedFormData.originalPrice ? parseFloat(cleanedFormData.originalPrice) : null, // Send null if empty
            categoryId: cleanedFormData.categoryId,
        },
        imageFileIDs: finalImageFileIDs, // Send the combined list
        // Send bookId only if in edit mode
        ...(this.data.bookId && { bookIdToEdit: this.data.bookId })
      };

      console.log('[PublishPage] Calling publishBook cloud function with data:', JSON.stringify(cloudFunctionData));

      // 4. Call the cloud function
      const submitRes = await wx.cloud.callFunction({
        name: 'publishBook', // Ensure this cloud function exists and handles create/update
        data: cloudFunctionData
      });
      console.log('[PublishPage] publishBook cloud function result:', submitRes);

      // 5. Process cloud function result
      if (submitRes.result && submitRes.result.success) {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: this.data.bookId ? '修改成功' : '发布成功', icon: 'success', duration: 1500 });

        app.globalData.sellListNeedRefresh = true; // Notify sell page to refresh
        app.globalData.profileNeedRefresh = true; // Also notify profile page if needed

        // Clear the form after successful submission (especially for create mode)
        // this.resetForm(); // Optional: reset form or just navigate back

        setTimeout(() => {
          wx.navigateBack(); // Go back to the previous page
        }, 1500);
      } else {
        // Handle business logic failure from cloud function
        throw new Error((submitRes.result && submitRes.result.message) || '发布操作失败');
      }

    } catch (err) {
      // 6. Handle errors from upload or cloud function call
      wx.hideLoading();
      this.setData({ submitting: false });
      console.error('[PublishPage] Error during submitForm:', err);
      let errMsg = '发布失败，请稍后重试'; // Default error message
      if (err instanceof Error) { // Check if it's an Error object
         errMsg = err.message || errMsg; // Use error message if available
      } else if (err.errMsg) { // Handle wx API error format
         if (err.errMsg.includes('uploadFile:fail')) errMsg = '图片上传出错，请检查网络或图片';
         else if (err.errMsg.includes('callFunction:fail')) errMsg = '提交数据出错，请检查网络';
         else errMsg = err.errMsg; // Use Weixin API error message
      }
      wx.showToast({ title: errMsg, icon: 'none' });
    }
  },

  // Placeholder for delete book function (requires a cloud function)
  deleteBook: async function() {
    if (!this.data.bookId) return; // Can only delete if editing

    wx.showModal({
        title: '确认删除',
        content: '确定要删除这本发布的书籍吗？此操作不可恢复。',
        success: async (res) => {
            if (res.confirm) {
                wx.showLoading({ title: '删除中...', mask: true });
                try {
                    const deleteRes = await wx.cloud.callFunction({
                        name: 'deletePublishedBook',
                        data: { bookId: this.data.bookId }
                    });
                    if (!deleteRes.result || !deleteRes.result.success) {
                      throw new Error((deleteRes.result && deleteRes.result.message) || '删除失败');
                    }
                    wx.hideLoading();
                    app.globalData.sellListNeedRefresh = true;
                    wx.showToast({ title: '已下架', icon: 'success' });
                    setTimeout(() => wx.navigateBack(), 1200);
                } catch (err) {
                    wx.hideLoading();
                    console.error("Error deleting book:", err);
                    wx.showToast({ title: err.message || '删除失败', icon: 'none' });
                }
            }
        }
    });
  }
});
