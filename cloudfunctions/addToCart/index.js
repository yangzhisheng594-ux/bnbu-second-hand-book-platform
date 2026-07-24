// cloudfunctions/addToCart/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbConfig = {
  host: process.env.DB_HOST, // 确保这个环境变量是你完整的 RDS 地址
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool; // 全局或模块级变量存储连接池

// 在模块加载时（云函数冷启动时）就尝试创建连接池
try {
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
        console.error('[addToCart] Critical database configuration (host, user, database) is missing from environment variables. ABORTING pool creation.');
        // pool 会保持 undefined
    } else {
        console.log('[addToCart] Attempting to create MySQL Connection Pool with config:', {
            host: dbConfig.host, // 打印实际使用的 host
            user: dbConfig.user,
            database: dbConfig.database,
            port: dbConfig.port
            // 不要打印密码
        });
        pool = mysql.createPool(dbConfig); // !!! 实际创建连接池 !!!
        console.log('[addToCart] MySQL Connection Pool possibly created (check logs for errors if any during creation).');
    }
} catch (error) {
    console.error('[addToCart] Failed to create MySQL Connection Pool during initialization:', error);
    // pool 会保持 undefined
}


exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { bookId, quantity = 1 } = event;
  const normalizedBookId = Number(bookId);
  const normalizedQuantity = Number(quantity);

  console.log('[addToCart] Called. bookId:', bookId, 'quantity:', quantity, 'openid:', openid);
  // 再次打印关键配置，帮助调试
  console.log('[addToCart] Main function using DB_HOST from env:', process.env.DB_HOST);
  console.log('[addToCart] Main function using dbConfig.host:', dbConfig.host);

  if (!pool) {
      console.error('[addToCart] MySQL Connection Pool is not available (was not created or failed during init). Please check environment variables and pool creation logs.');
      return {
          success: false,
          message: '数据库服务初始化失败(AC01-P)', // 增加一个后缀 P 表示 Pool 问题
          errorDetails: 'Pool not initialized or critical config missing.'
      };
  }

  if (!openid) {
      console.error('[addToCart] OpenID not available from wxContext.');
      return { success: false, message: '请先登录(AC02)' };
  }
  if (!Number.isInteger(normalizedBookId) || normalizedBookId <= 0 || normalizedQuantity !== 1) {
      console.error('[addToCart] Invalid parameters. bookId:', bookId, 'quantity:', quantity);
      return { success: false, message: '参数错误(AC03)' };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[addToCart] DB Connection acquired.');
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1', [openid]);
    if (userRows.length === 0) {
      await connection.rollback();
      console.warn('[addToCart] User not found for openid:', openid);
      return { success: false, message: '用户不存在(AC04)' };
    }
    const userId = userRows[0].user_id;
    console.log('[addToCart] User ID:', userId);

    const [bookRows] = await connection.execute('SELECT user_id, price, status FROM books WHERE book_id = ? AND deleted_at IS NULL LIMIT 1', [normalizedBookId]);
    if (bookRows.length === 0) {
      await connection.rollback();
      console.warn('[addToCart] Book not found for bookId:', bookId);
      return { success: false, message: '书籍不存在(AC05)' };
    }
    if (bookRows[0].status !== 'selling') {
      await connection.rollback();
      console.warn(`[addToCart] Book ${bookId} status is ${bookRows[0].status}, not 'selling'.`);
      return { success: false, message: '该书籍暂不可购买(AC06)' };
    }
    if (Number(bookRows[0].user_id) === Number(userId)) {
      await connection.rollback();
      return { success: false, message: '不能将自己发布的书籍加入购物车' };
    }
    const priceAtAdd = bookRows[0].price;

    const [existingCartItem] = await connection.execute(
      'SELECT cart_item_id, quantity FROM cart_items WHERE user_id = ? AND book_id = ?',
      [userId, normalizedBookId]
    );

    if (existingCartItem.length > 0) {
      await connection.execute(
        'UPDATE cart_items SET quantity = ?, added_at = NOW() WHERE cart_item_id = ? AND user_id = ?', // 加上 user_id 确保安全
        [1, existingCartItem[0].cart_item_id, userId]
      );
      console.log(`[addToCart] Item ${bookId} already exists in cart for user ${userId}`);
    } else {
      await connection.execute(
        'INSERT INTO cart_items (user_id, book_id, quantity, price_at_add, added_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, normalizedBookId, 1, priceAtAdd]
      );
      console.log(`[addToCart] Item ${bookId} added for user ${userId}`);
    }

    await connection.commit();
    const [countResult] = await connection.execute('SELECT COUNT(*) as totalItems FROM cart_items WHERE user_id = ?', [userId]);

    return {
      success: true,
      message: existingCartItem.length > 0 ? '该书已在购物车中' : '成功加入购物车',
      totalCartItems: countResult[0].totalItems
    };

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('[addToCart] Error during DB operation:', err);
    if (err.code === 'ER_DUP_ENTRY') {
        return { success: false, message: '操作太快，请稍后再试(AC07)', errorDetails: err.message };
    }
    // 检查是否是 ECONNREFUSED 错误，如果是，给出更具体的提示
    if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
        console.error(`[addToCart] ECONNREFUSED error. Host: ${dbConfig.host}, Port: ${dbConfig.port}. Check DB_HOST env variable and network/firewall settings.`);
        return {
            success: false,
            message: '无法连接到数据库，请检查网络配置和主机地址。(AC09)',
            errorDetails: err.message,
            errorCode: err.code
        };
    }
    return { success: false, message: '添加购物车失败(AC08)', errorDetails: err.message, errorCode: err.code };
  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('[addToCart] DB Connection released.');
      } catch (releaseError) {
        console.error('[addToCart] Error releasing DB connection:', releaseError);
      }
    }
  }
};
