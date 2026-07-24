const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS || process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
};
const pool = dbConfig.host && dbConfig.user && dbConfig.password && dbConfig.database ? mysql.createPool(dbConfig) : null;

exports.main = async (event) => {
  if (!pool) return { success: false, message: '数据库服务未配置' };
  const { OPENID: openid } = cloud.getWXContext();
  const orderItemId = Number(event.orderItemId);
  if (!openid) return { success: false, message: '请先登录' };
  if (!Number.isInteger(orderItemId) || orderItemId <= 0) return { success: false, message: '订单商品参数不正确' };

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [items] = await connection.execute(
      `SELECT oi.order_item_id, oi.order_id, oi.status
       FROM order_items oi
       INNER JOIN users u ON u.user_id = oi.seller_id
       WHERE oi.order_item_id = ? AND u.open_id = ? AND u.deleted_at IS NULL
       FOR UPDATE`,
      [orderItemId, openid]
    );
    if (!items.length) throw new Error('订单商品不存在或无权操作');
    const item = items[0];
    if (item.status !== 'pending') throw new Error('该订单商品当前不能发货');

    await connection.execute(
      "UPDATE order_items SET status = 'shipped' WHERE order_item_id = ? AND status = 'pending'",
      [orderItemId]
    );
    const [pendingRows] = await connection.execute(
      "SELECT COUNT(*) AS total FROM order_items WHERE order_id = ? AND status = 'pending'",
      [item.order_id]
    );
    if (Number(pendingRows[0].total) === 0) {
      await connection.execute(
        "UPDATE orders SET status = 'shipped', shipped_at = NOW(), updated_at = NOW() WHERE order_id = ? AND status = 'pending_shipment'",
        [item.order_id]
      );
    }
    await connection.commit();
    return { success: true, message: '已确认面交，等待买家确认' };
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[shipOrderItem] failed:', error);
    return { success: false, message: error.message || '发货操作失败' };
  } finally {
    if (connection) connection.release();
  }
};
