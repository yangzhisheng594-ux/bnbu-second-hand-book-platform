// cloudfunctions/getBookDetail/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// --- 数据库连接配置 ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4' // 确保字符集正确
};

let pool;
try {
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
        console.error('[getBookDetail] Critical database configuration is missing. ABORTING pool creation.');
    } else {
        console.log('[getBookDetail] Attempting to create MySQL Connection Pool with config:', {
            host: dbConfig.host, user: dbConfig.user, database: dbConfig.database, port: dbConfig.port
        });
        pool = mysql.createPool(dbConfig);
        console.log('[getBookDetail] MySQL Connection Pool possibly created.');
    }
} catch (error) {
    console.error('[getBookDetail] Failed to create MySQL Connection Pool during initialization:', error);
}

exports.main = async (event, context) => {
  console.log('[Cloud Function] [getBookDetail] called, event:', JSON.stringify(event));
  console.log('[getBookDetail] Main function using DB_HOST from env:', process.env.DB_HOST);
  console.log('[getBookDetail] Main function using dbConfig.host:', dbConfig.host);

  if (!pool) {
      console.error('[getBookDetail] MySQL Connection Pool is not available.');
      return {
          success: false,
          message: '数据库服务初始化失败，请联系管理员。',
          errorDetails: 'Pool not initialized or critical config missing.'
      };
  }

  const { bookId } = event;

  if (!bookId) {
    return {
      success: false,
      message: '缺少书籍ID参数 (bookId)'
    };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[getBookDetail] Successfully got a connection from the pool.');

    // 1. 根据 bookId 查询书籍基本信息
    const bookSql = "SELECT * FROM books WHERE book_id = ? AND deleted_at IS NULL AND status = 'selling' LIMIT 1"; // 确保只查询在售且未删除的
    console.log('[getBookDetail] Book SQL:', bookSql, [bookId]);
    const [bookRows] = await connection.execute(bookSql, [bookId]);

    if (bookRows.length === 0) {
      console.log(`[getBookDetail] Book not found or not available for bookId: ${bookId}`);
      return {
        success: false,
        message: '未找到该书籍信息或书籍已下架'
      };
    }
    let bookData = bookRows[0];

    // 2. 查询该书籍的所有图片信息，并确定封面图
    const imagesSql = "SELECT image_url, is_cover FROM book_images WHERE book_id = ? ORDER BY is_cover DESC, sort_order ASC";
    console.log('[getBookDetail] Images SQL:', imagesSql, [bookId]);
    const [imageRows] = await connection.execute(imagesSql, [bookId]);

    let coverUrl = null; // 初始化封面URL
    let imageUrls = [];  // 初始化图片列表

    if (imageRows && imageRows.length > 0) {
        imageUrls = imageRows.map(img => img.image_url); // 获取所有图片的URL
        // 查找被标记为封面的图片
        const coverImage = imageRows.find(img => img.is_cover);
        if (coverImage) {
            coverUrl = coverImage.image_url;
        } else {
            // 如果没有显式标记的封面，默认使用第一张图片作为封面 (通常是 sort_order 最小的)
            coverUrl = imageRows[0].image_url;
        }
    }
    console.log(`[getBookDetail] Fetched images for bookId ${bookId}: Cover - ${coverUrl}, All Images - ${imageUrls.length} items`);


    // 3. (可选) 更新浏览量
    try {
      const updateViewsSql = "UPDATE books SET views = views + 1 WHERE book_id = ?";
      await connection.execute(updateViewsSql, [bookId]);
      console.log(`[getBookDetail] Views incremented for bookId: ${bookId}`);
      bookData.views = (bookData.views || 0) + 1;
    } catch (viewError) {
      console.error('[getBookDetail] Error incrementing views:', viewError);
    }

    // 4. (可选) 获取卖家信息
    if (bookData.user_id) {
      try {
        const sellerSql = "SELECT user_id, nick_name, avatar_url FROM users WHERE user_id = ? AND deleted_at IS NULL LIMIT 1";
        const [sellerRows] = await connection.execute(sellerSql, [bookData.user_id]);
        if (sellerRows.length > 0) {
          bookData.sellerInfo = {
            userId: sellerRows[0].user_id,
            nickName: sellerRows[0].nick_name,
            avatarUrl: sellerRows[0].avatar_url
          };
        } else {
          bookData.sellerInfo = null;
        }
      } catch (sellerError) {
        console.error('[getBookDetail] Error fetching seller info:', sellerError);
        bookData.sellerInfo = null;
      }
    }

    // 5. 准备返回给前端的数据
    const responseData = {
        id: bookData.book_id,
        title: bookData.title,
        author: bookData.author,
        coverUrl: coverUrl, // 使用从 book_images 表获取的封面 URL
        imageUrls: imageUrls, // 使用从 book_images 表获取的所有图片 URL 列表
        price: bookData.price,
        originalPrice: bookData.original_price,
        courseCode: bookData.course_code,
        description: bookData.description,
        status: bookData.status,
        views: bookData.views,
        condition: bookData.condition,
        publisher: bookData.publisher,
        publishDate: bookData.publish_date,
        isbn: bookData.isbn,
        categoryId: bookData.category_id,
        sellerInfo: bookData.sellerInfo || null,
        createdAt: bookData.created_at,
        updatedAt: bookData.updated_at
        // ... 其他你从数据库查询并希望返回给前端的字段
    };

    console.log('[getBookDetail] Successfully fetched book detail, returning data:', JSON.stringify(responseData));
    return {
      success: true,
      data: responseData
    };

  } catch (err) {
    console.error('[Cloud Function] [getBookDetail] Database or Logic Error:', err);
    // ... (保留你之前的错误处理) ...
    return {
      success: false,
      message: '获取书籍详情失败，服务器开小差了~',
      errorDetails: err.message,
      errorCode: err.code
    };
  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('[getBookDetail] Connection released back to the pool.');
      } catch (releaseError) {
        console.error('[getBookDetail] Error releasing connection:', releaseError);
      }
    }
  }
};
