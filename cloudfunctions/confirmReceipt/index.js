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
  const orderId = Number(event.orderId);
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, message: '请先登录' };
  if (!orderId) return { success: false, message: '订单参数不正确' };
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `UPDATE orders o INNER JOIN users u ON u.user_id = o.user_id
       SET o.status = 'completed', o.completed_at = NOW(), o.updated_at = NOW()
       WHERE o.order_id = ? AND u.open_id = ? AND o.status = 'shipped'`,
      [orderId, openid]
    );
    if (!result.affectedRows) throw new Error('订单不存在或当前不能确认收货');
    await connection.execute("UPDATE order_items SET status = 'completed' WHERE order_id = ?", [orderId]);
    await connection.commit();
    return { success: true, message: '已确认收书，交易完成' };
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[confirmReceipt] failed:', error);
    return { success: false, message: error.message || '确认收货失败' };
  } finally {
    if (connection) connection.release();
  }
};
