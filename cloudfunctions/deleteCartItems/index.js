// cloudfunctions/deleteCartItems/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// --- 数据库连接配置 (与 getBookDetail 保持一致) ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5, // 根据你的需要调整连接池大小
  queueLimit: 0,
  charset: 'utf8mb4' // 确保字符集正确
};

let pool;
try {
    // 检查关键配置是否存在
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database || !dbConfig.password) { // 增加对密码的检查
        console.error('[deleteCartItems] Critical database configuration is missing. ABORTING pool creation.');
        // 注意：在实际云函数环境中，如果初始化失败，函数调用时 pool 会是 undefined
    } else {
        console.log('[deleteCartItems] Attempting to create MySQL Connection Pool.');
        pool = mysql.createPool(dbConfig);
        console.log('[deleteCartItems] MySQL Connection Pool created (or initialization attempted).');
        // 可以添加一个简单的查询来测试连接池在初始化时是否正常工作 (可选)
        // pool.query('SELECT 1').then(()=>console.log('Pool test query successful.')).catch(err=>console.error('Pool test query failed:', err));
    }
} catch (error) {
    console.error('[deleteCartItems] Failed to create MySQL Connection Pool during initialization:', error);
    // 即使这里捕获了错误，pool 仍然可能是 undefined
}

/**
 * 云函数入口函数
 * @param {object} event 前端调用时传入的参数，期望包含 cartItemIds 数组
 * @param {object} context 调用上下文
 * @returns {object} 返回包含 success 状态和可选信息的对象
 */
exports.main = async (event, context) => {
  const { OPENID: openid } = cloud.getWXContext();
  console.log('[deleteCartItems] Cloud function invoked. Event data:', JSON.stringify(event));

  // 1. 检查数据库连接池是否可用
  if (!pool) {
      console.error('[deleteCartItems] MySQL Connection Pool is not available. Check initialization and configuration.');
      return {
          success: false,
          message: '数据库服务异常，请稍后重试或联系管理员。',
          errorDetails: 'Connection Pool not initialized.'
      };
  }
  if (!openid) return { success: false, message: '请先登录' };

  // 2. 从 event 中获取要删除的 cartItemIds 数组
  const { cartItemIds } = event;

  // 3. 验证输入参数
  if (!Array.isArray(cartItemIds) || cartItemIds.length === 0) {
    console.log('[deleteCartItems] Invalid input: cartItemIds is not a non-empty array.', cartItemIds);
    return { success: false, message: '未提供有效的购物车项目ID' };
  }
  // (可选) 进一步验证数组中的 ID 是否都是有效的数字或字符串
  const validIds = cartItemIds
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) {
    console.log('[deleteCartItems] Invalid input: No valid IDs found in cartItemIds array.', cartItemIds);
    return { success: false, message: '提供的购物车项目ID无效' };
  }
  console.log('[deleteCartItems] Received valid cartItemIds to delete:', validIds);


  // 4. 获取数据库连接并执行删除操作
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[deleteCartItems] Database connection acquired from pool.');

    const [userRows] = await connection.execute(
      'SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
      [openid]
    );
    if (!userRows.length) return { success: false, message: '用户不存在，请重新登录' };
    const userId = userRows[0].user_id;

    // 5. 构建 SQL 删除语句
    // 使用 IN 操作符可以一次性删除多个 ID
    // 生成占位符 (?, ?, ?) 以防止 SQL 注入
    const placeholders = validIds.map(() => '?').join(',');
    const sql = `DELETE FROM cart_items WHERE cart_item_id IN (${placeholders}) AND user_id = ?`;

    console.log('[deleteCartItems] Executing SQL:', sql, 'with IDs:', validIds);
    validIds.push(userId);
    // 6. 执行 SQL
    const [result] = await connection.execute(sql, validIds); // 将 ID 数组作为参数传递
    console.log('[deleteCartItems] Database deletion result:', result);

    // 7. 处理结果
    // result.affectedRows 表示实际删除的行数
    if (result.affectedRows > 0) {
      console.log(`[deleteCartItems] Successfully deleted ${result.affectedRows} cart items.`);
      return { success: true, deletedCount: result.affectedRows };
    } else {
      // 虽然执行成功，但没有行被删除，可能是因为传入的 ID 在数据库中不存在
      console.log('[deleteCartItems] SQL executed successfully, but no rows were affected. IDs might not exist in cart_items table:', validIds);
      // 这里可以根据业务需求决定是返回 success: true 还是 false
      // 通常认为操作成功完成，即使没删掉东西，所以返回 true
      return { success: true, deletedCount: 0, message: '操作完成，但未找到匹配的商品删除' };
      // 或者如果认为没删掉算一种“失败”，则返回 false
      // return { success: false, message: '未找到要删除的购物车商品' };
    }

  } catch (err) {
    // 8. 统一处理错误
    console.error('[deleteCartItems] Error during database operation:', err);
    // 可以根据 err.code 区分不同类型的数据库错误
    return {
      success: false,
      message: '删除购物车商品时出错',
      errorDetails: err.message, // 返回错误信息便于调试
      errorCode: err.code        // 返回错误码
    };
  } finally {
    // 9. 无论成功或失败，最后都释放数据库连接
    if (connection) {
      try {
        await connection.release();
        console.log('[deleteCartItems] Database connection released back to the pool.');
      } catch (releaseError) {
        // 释放连接本身也可能出错，记录下来
        console.error('[deleteCartItems] Error releasing database connection:', releaseError);
      }
    }
  }
};
