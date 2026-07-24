// cloudfunctions/publishBook/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// --- Database Connection Pool (Consistent with other functions) ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool;
try {
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database || !dbConfig.password) {
        console.error('[publishBook] Critical database configuration is missing.');
    } else {
        pool = mysql.createPool(dbConfig);
        console.log('[publishBook] MySQL Connection Pool created.');
    }
} catch (error) {
    console.error('[publishBook] Failed to create MySQL Connection Pool:', error);
}


/**
 * publishBook Cloud Function: Creates or updates a book listing.
 *
 * event parameters:
 * - formData {object}: Object containing book details (title, author, price, etc.)
 * - imageFileIDs {string[]}: Array of Cloud Storage file IDs for the book images.
 * - bookIdToEdit {number} (optional): ID of the book to update. If absent, create new.
 * - userInfo {object}: Automatically injected, contains openId.
 */
exports.main = async (event, context) => {
  console.log('[publishBook] Function invoked. Event:', JSON.stringify(event));
  const { formData, imageFileIDs, bookIdToEdit } = event;
  const { OPENID: openId } = cloud.getWXContext();

  // 1. Basic Input Validation
  if (!pool) {
      return { success: false, message: '数据库服务异常 (Pool init failed)', errorDetails: 'Connection Pool not available.' };
  }
  if (!formData) {
      return { success: false, message: '缺少表单数据 (formData)' };
  }
  if (!Array.isArray(imageFileIDs) || imageFileIDs.length === 0) {
      return { success: false, message: '缺少图片信息 (imageFileIDs)' };
  }
  if (!openId) {
      return { success: false, message: '无法获取用户信息 (openId)' };
  }

  // Basic validation on required form data fields
  if (!formData.title || !formData.price || !formData.description) {
      return { success: false, message: '缺少必填项 (书名、价格或描述)' };
  }
   // Price should already be a number from frontend, double check
   if (typeof formData.price !== 'number' || formData.price <= 0) {
       return { success: false, message: '价格无效' };
   }
   if (formData.originalPrice !== null && (typeof formData.originalPrice !== 'number' || formData.originalPrice < 0)) {
       return { success: false, message: '原价无效' };
   }


  // 2. Get Database Connection and Start Transaction
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    console.log('[publishBook] Database connection acquired and transaction started.');

    // 3. Get user_id based on openId
    let userId;
    try {
        const [userRows] = await connection.execute('SELECT user_id FROM users WHERE open_id = ? LIMIT 1', [openId]);
        if (userRows.length === 0) {
            throw new Error(`用户未找到 (openId: ${openId})`);
        }
        userId = userRows[0].user_id;
        console.log(`[publishBook] Found user_id: ${userId} for openId: ${openId}`);
    } catch (userError) {
        throw new Error(`获取用户信息失败: ${userError.message}`); // Propagate error to rollback
    }


    let targetBookId; // Will hold the ID of the book (new or edited)
    const now = new Date(); // Use for consistent timestamps if needed (MySQL handles CURRENT_TIMESTAMP)

    // 4. Determine Mode: Create or Update
    if (bookIdToEdit) {
      // --- UPDATE MODE ---
      targetBookId = bookIdToEdit;
      console.log(`[publishBook] UPDATE mode for bookId: ${targetBookId}`);

      // 4a. Verify ownership (Security Check!)
      const [ownerCheck] = await connection.execute(
        'SELECT user_id, status FROM books WHERE book_id = ? AND deleted_at IS NULL FOR UPDATE',
        [targetBookId]
      );
      if (ownerCheck.length === 0) {
          throw new Error('尝试编辑的书籍不存在');
      }
      if (ownerCheck[0].user_id !== userId) {
        throw new Error('无权编辑此书籍');
      }
      if (ownerCheck[0].status !== 'selling') {
        throw new Error('已售出或下架的书籍不能重新发布');
      }

      // 4b. Update `books` table
      const updateBookSql = `
        UPDATE books SET
          title = ?, author = ?, isbn = ?, publisher = ?, \`condition\` = ?,
          price = ?, original_price = ?, course_code = ?, description = ?,
          category_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE book_id = ? AND user_id = ?`; // Include userId in WHERE for safety
      const bookParams = [
        formData.title, formData.author || null, formData.isbn || null, formData.publisher || null, formData.condition || null,
        formData.price, formData.originalPrice, formData.courseCode || null, formData.description,
        formData.categoryId,
        targetBookId, userId
      ];
      console.log('[publishBook] Executing book UPDATE SQL:', updateBookSql, bookParams);
      const [updateResult] = await connection.execute(updateBookSql, bookParams);
      console.log('[publishBook] Book update result:', updateResult);
      if (updateResult.affectedRows === 0) {
          // Should not happen due to ownership check, but good to have
          throw new Error('更新书籍信息失败 (可能书籍不存在或权限问题)');
      }

      // 4c. Delete old images for this book
      const deleteImagesSql = 'DELETE FROM book_images WHERE book_id = ?';
      console.log('[publishBook] Executing image DELETE SQL:', deleteImagesSql, [targetBookId]);
      const [deleteImagesResult] = await connection.execute(deleteImagesSql, [targetBookId]);
      console.log(`[publishBook] Deleted ${deleteImagesResult.affectedRows} old images for bookId: ${targetBookId}`);

    } else {
      // --- CREATE MODE ---
      console.log('[publishBook] CREATE mode');

      // 4a. Insert into `books` table
      const insertBookSql = `
        INSERT INTO books (
          user_id, title, author, isbn, publisher, \`condition\`,
          price, original_price, course_code, description, category_id,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      const bookParams = [
        userId, formData.title, formData.author || null, formData.isbn || null, formData.publisher || null, formData.condition || null,
        formData.price, formData.originalPrice, formData.courseCode || null, formData.description,
        formData.categoryId, 'selling' // Default status, adjust if review needed
      ];
      console.log('[publishBook] Executing book INSERT SQL:', insertBookSql, bookParams);
      const [insertResult] = await connection.execute(insertBookSql, bookParams);
      console.log('[publishBook] Book insert result:', insertResult);
      if (!insertResult.insertId) {
          throw new Error('创建书籍记录失败');
      }
      targetBookId = insertResult.insertId; // Get the newly created book_id
      console.log(`[publishBook] New book created with bookId: ${targetBookId}`);
    }


    // 5. Insert new images into `book_images` table (for both Create and Update)
    if (targetBookId && imageFileIDs.length > 0) {
        const insertImagesSql = 'INSERT INTO book_images (book_id, image_url, is_cover, sort_order, created_at) VALUES ?';
        const imageValues = imageFileIDs.map((fileID, index) => [
            targetBookId,
            fileID,          // Store the Cloud Storage fileID
            index === 0,     // Mark the first image as cover (is_cover = true)
            index,           // Use index as sort_order
            now              // Consistent created_at timestamp (optional, DB default works too)
        ]);
        console.log('[publishBook] Executing image INSERT SQL with values:', imageValues);
        const [insertImagesResult] = await connection.query(insertImagesSql, [imageValues]); // Use .query for bulk insert VALUES ?
        console.log(`[publishBook] Inserted ${insertImagesResult.affectedRows} new images for bookId: ${targetBookId}`);
        if (insertImagesResult.affectedRows !== imageFileIDs.length) {
            console.warn(`[publishBook] Warning: Expected to insert ${imageFileIDs.length} images, but inserted ${insertImagesResult.affectedRows}.`);
            // Decide if this is critical enough to cause a rollback
            // throw new Error('部分图片信息保存失败');
        }
    } else {
        // Should not happen due to earlier check, but log if it does
        console.warn(`[publishBook] No targetBookId or imageFileIDs to insert images. targetBookId: ${targetBookId}, imageFileIDs: ${imageFileIDs.length}`);
        throw new Error('无法关联图片，书籍ID或图片信息丢失');
    }


    // 6. Commit Transaction
    await connection.commit();
    console.log('[publishBook] Transaction committed successfully.');

    // 7. Return Success
    return {
      success: true,
      message: bookIdToEdit ? '书籍修改成功' : '书籍发布成功',
      bookId: targetBookId // Return the ID of the created/updated book
    };

  } catch (err) {
    // 8. Handle Errors and Rollback Transaction
    console.error('[publishBook] Error occurred:', err);
    if (connection) {
      console.log('[publishBook] Rolling back transaction due to error.');
      await connection.rollback(); // Rollback on any error
    }
    return {
      success: false,
      message: err.message || '发布书籍时发生未知错误', // Provide error message to frontend
      errorDetails: err.stack // Include stack trace for detailed debugging if needed
    };
  } finally {
    // 9. Release Connection
    if (connection) {
      try {
        await connection.release();
        console.log('[publishBook] Database connection released.');
      } catch (releaseError) {
        console.error('[publishBook] Error releasing connection:', releaseError);
      }
    }
  }
};
