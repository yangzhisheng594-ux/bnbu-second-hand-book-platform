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

exports.main = async () => {
  if (!pool) return { success: false, message: '数据库服务未配置' };
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, message: '请先登录' };
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT
         COALESCE(SUM(o.status = 'pending_payment'), 0) AS pendingPayment,
         COALESCE(SUM(o.status = 'pending_shipment'), 0) AS pendingShipment,
         COALESCE(SUM(o.status = 'shipped'), 0) AS pendingReceipt
       FROM orders o
       INNER JOIN users u ON u.user_id = o.user_id
       WHERE u.open_id = ? AND u.deleted_at IS NULL`,
      [openid]
    );
    const row = rows[0];
    return {
      success: true,
      data: {
        pendingPayment: Number(row.pendingPayment),
        pendingShipment: Number(row.pendingShipment),
        pendingReceipt: Number(row.pendingReceipt)
      }
    };
  } catch (error) {
    console.error('[getOrderCounts] failed:', error);
    return { success: false, message: '获取订单统计失败' };
  } finally {
    if (connection) connection.release();
  }
};
