// cloudfunctions/getCartItems/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// --- 数据库连接配置 (确保与项目中其他云函数一致，并且环境变量配置正确) ---
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
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
        console.error('[getCartItems] Critical DB config missing. ABORTING pool creation.');
    } else {
        console.log('[getCartItems] Attempting to create MySQL Pool with config:', {
            host: dbConfig.host, user: dbConfig.user, database: dbConfig.database, port: dbConfig.port
        });
        pool = mysql.createPool(dbConfig);
        console.log('[getCartItems] MySQL Pool created.'); // 确认连接池创建成功
    }
} catch (error) {
    console.error('[getCartItems] Failed to create MySQL Pool during initialization:', error);
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  console.log('[getCartItems] Called for openid:', openid);

  if (!pool) {
    console.error('[getCartItems] MySQL Pool is not available.');
    return { success: false, message: '数据库服务错误(GC01-Pool)' }; // 增加后缀区分
  }
  if (!openid) {
    console.error('[getCartItems] OpenID not available.');
    return { success: false, message: '无法获取用户信息(GC02)' };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[getCartItems] DB Connection acquired.');

    const [userRows] = await connection.execute('SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1', [openid]);
    if (userRows.length === 0) {
      console.warn('[getCartItems] User not found for openid:', openid);
      return { success: false, message: '用户不存在(GC03)' };
    }
    const userId = userRows[0].user_id;
    console.log('[getCartItems] User ID:', userId);

    const cartSql = `
      SELECT
        ci.cart_item_id as cartItemId,
        ci.book_id as id,         -- book_id 作为 id 给前端
        ci.quantity,
        ci.price_at_add as priceAtAdd,
        b.title,
        b.course_code as spec,
        b.price as currentPrice,  -- 书籍当前价格 (来自 books 表)
        b.status as bookStatus,
        b.deleted_at as bookDeletedAt,
        img.image_url as coverUrl
      FROM cart_items ci
      JOIN books b ON ci.book_id = b.book_id
      LEFT JOIN book_images img ON b.book_id = img.book_id AND img.is_cover = TRUE
      WHERE ci.user_id = ?
        AND b.status = 'selling'
        AND b.deleted_at IS NULL
      ORDER BY ci.added_at DESC
    `;
    console.log('[getCartItems] Executing SQL:', cartSql, 'with userId:', userId);
    const [cartItemRows] = await connection.execute(cartSql, [userId]);
    console.log(`[getCartItems] SQL result - ${cartItemRows.length} items fetched from DB.`);

    const itemsWithProcessedPrice = cartItemRows.map(item => {
      const numericCurrentPrice = parseFloat(item.currentPrice);
      const numericPriceAtAdd = parseFloat(item.priceAtAdd);
      const finalPrice = !isNaN(numericCurrentPrice) ? numericCurrentPrice : (!isNaN(numericPriceAtAdd) ? numericPriceAtAdd : 0);

      // console.log(`[getCartItems] Processing item: id=${item.id}, currentPrice=${item.currentPrice}, priceAtAdd=${item.priceAtAdd}, finalPrice=${finalPrice}`);

      return {
        ...item,
        selected: false,
        price: finalPrice, // 确保 price 是数字
        // 确保 quantity 也是数字
        quantity: 1,
        // currentPrice 和 priceAtAdd 保持从数据库读取的原始值（或已parseFloat的数字）
        currentPrice: !isNaN(numericCurrentPrice) ? numericCurrentPrice : null,
        priceAtAdd: !isNaN(numericPriceAtAdd) ? numericPriceAtAdd : null,
      };
    });

    console.log(`[getCartItems] Processed ${itemsWithProcessedPrice.length} items for userId ${userId}. Data to return:`, JSON.stringify(itemsWithProcessedPrice));
    return { success: true, data: itemsWithProcessedPrice };

  } catch (err) {
    console.error('[getCartItems] Error during DB operation or processing:', err);
    // 检查是否是 ECONNREFUSED 错误
    if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
        console.error(`[getCartItems] ECONNREFUSED error. Host: ${dbConfig.host}, Port: ${dbConfig.port}.`);
        return {
            success: false,
            message: '无法连接到数据库，请检查网络配置和主机地址。(GC09)',
            errorDetails: err.message,
            errorCode: err.code
        };
    }
    return { success: false, message: '获取购物车失败(GC04)', errorDetails: err.message, errorCode: err.code };
  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('[getCartItems] DB Connection released.');
      } catch (releaseError) {
        console.error('[getCartItems] Error releasing DB connection:', releaseError);
      }
    }
  }
};
