// cloudfunctions/updateCartItem/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbConfig = {
  host: process.env.DB_HOST, // 确保环境变量正确配置且 DB_HOST 是完整地址
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
        console.error('[updateCartItem] Critical database configuration (host, user, database) is missing from environment variables. ABORTING pool creation.');
        // pool 会保持 undefined
    } else {
        console.log('[updateCartItem] Attempting to create MySQL Connection Pool with config:', {
            host: dbConfig.host,
            user: dbConfig.user,
            database: dbConfig.database,
            port: dbConfig.port
            // 不要打印密码
        });
        pool = mysql.createPool(dbConfig); // !!! 实际创建连接池 !!!
        console.log('[updateCartItem] MySQL Connection Pool possibly created (check logs for errors if any during creation).');
    }
} catch (error) {
    console.error('[updateCartItem] Failed to create MySQL Connection Pool during initialization:', error);
    // pool 会保持 undefined
}


exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, items } = event;

  console.log(`[updateCartItem] Called. Action: ${action}, Items: ${JSON.stringify(items)}, OpenID: ${openid}`);
  // 再次打印关键配置
  console.log('[updateCartItem] Main function using DB_HOST from env:', process.env.DB_HOST);
  console.log('[updateCartItem] Main function using dbConfig.host:', dbConfig.host);


  if (!pool) {
      console.error('[updateCartItem] MySQL Connection Pool is not available (was not created or failed during init).');
      return {
          success: false,
          message: '数据库服务错误(UC01-P)', // 明确是 Pool 问题
          errorDetails: 'Pool not initialized or critical config missing.'
      };
  }
  if (!openid) {
    console.error('[updateCartItem] OpenID not available.');
    return { success: false, message: '请先登录(UC02)' };
  }
  if (!action || !items || !Array.isArray(items) || items.length === 0) {
    console.error('[updateCartItem] Invalid parameters:', {action, items});
    return { success: false, message: '参数错误(UC03)' };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[updateCartItem] DB Connection acquired.');
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1', [openid]);
    if (userRows.length === 0) {
      await connection.rollback();
      console.warn('[updateCartItem] User not found for openid:', openid);
      return { success: false, message: '用户不存在(UC04)' };
    }
    const userId = userRows[0].user_id;
    console.log('[updateCartItem] User ID:', userId);

    let message = '购物车已更新'; // 默认成功消息

    if (action === 'updateQuantity') {
      const { cartItemId, quantity } = items[0];
      if (!Number.isInteger(Number(cartItemId)) || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
        await connection.rollback();
        console.error('[updateCartItem] Invalid quantity parameters:', items[0]);
        return { success: false, message: '更新数量参数错误(UC05)' };
      }
      if (Number(quantity) > 1) {
        await connection.rollback();
        return { success: false, message: '二手书每本仅可购买一件' };
      }
      if (Number(quantity) === 0) {
        const [deleteResult] = await connection.execute('DELETE FROM cart_items WHERE cart_item_id = ? AND user_id = ?', [cartItemId, userId]);
        console.log(`[updateCartItem] Item ${cartItemId} removed for user ${userId} (quantity 0). Affected: ${deleteResult.affectedRows}`);
        message = '商品已从购物车移除';
      } else {
        const [updateResult] = await connection.execute(
          'UPDATE cart_items SET quantity = ? WHERE cart_item_id = ? AND user_id = ?',
          [1, cartItemId, userId]
        );
        console.log(`[updateCartItem] Item ${cartItemId} quantity updated to ${quantity} for user ${userId}. Affected: ${updateResult.affectedRows}`);
        message = '数量已更新';
      }
    } else if (action === 'removeItems') {
      const cartItemIdsToRemove = items.map(item => item.cartItemId).filter(id => id !== null && id !== undefined);
      if (cartItemIdsToRemove.length === 0) {
        await connection.rollback();
        console.warn('[updateCartItem] No valid cartItemIds provided for removal.');
        return { success: false, message: '没有有效的商品可移除(UC06)' };
      }

      const placeholders = cartItemIdsToRemove.map(() => '?').join(',');
      const deleteSql = `DELETE FROM cart_items WHERE cart_item_id IN (${placeholders}) AND user_id = ?`;
      const deleteParams = [...cartItemIdsToRemove, userId];

      console.log('[updateCartItem] Executing removeItems SQL:', deleteSql, 'Params:', JSON.stringify(deleteParams));
      const [deleteResult] = await connection.execute(deleteSql, deleteParams);
      console.log(`[updateCartItem] ${deleteResult.affectedRows} items removed for user ${userId}. IDs:`, cartItemIdsToRemove);
      message = `${deleteResult.affectedRows} 件商品已删除`;

      if(deleteResult.affectedRows === 0 && cartItemIdsToRemove.length > 0){
        console.warn(`[updateCartItem] No items were actually deleted for user ${userId} with IDs:`, cartItemIdsToRemove);
      }
    } else {
      await connection.rollback();
      console.error('[updateCartItem] Invalid action type:', action);
      return { success: false, message: '无效的操作类型(UC07)' };
    }

    await connection.commit();
    console.log('[updateCartItem] Transaction committed.');

    const [countResult] = await connection.execute('SELECT COUNT(*) as totalItems FROM cart_items WHERE user_id = ?', [userId]);
    const totalCartItems = countResult[0] ? countResult[0].totalItems : 0;
    console.log('[updateCartItem] Current total cart items for user:', totalCartItems);

    return { success: true, message: message, totalCartItems: totalCartItems };

  } catch (err) {
    if (connection) {
        try { await connection.rollback(); console.log('[updateCartItem] Transaction rolled back due to error.'); }
        catch (rbError) { console.error('[updateCartItem] Error during rollback:', rbError); }
    }
    console.error('[updateCartItem] Error during DB operation:', err);
    if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
        // ... (ECONNREFUSED 错误处理) ...
        return { success: false, message: '无法连接到数据库(UC09)', errorDetails: err.message, errorCode: err.code };
    }
    return { success: false, message: '更新购物车失败(UC08)', errorDetails: err.message, errorCode: err.code };
  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('[updateCartItem] DB Connection released.');
      } catch (releaseError) {
        console.error('[updateCartItem] Error releasing DB connection:', releaseError);
      }
    }
  }
};
