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
  const requestId = Number(event.requestId);
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, message: '请先登录' };
  if (!requestId) return { success: false, message: '求购信息参数不正确' };

  let connection;
  try {
    connection = await pool.getConnection();
    const [result] = await connection.execute(
      `UPDATE seeking_posts sp
       INNER JOIN users u ON u.user_id = sp.user_id
       SET sp.deleted_at = NOW(), sp.status = 'closed_by_user', sp.updated_at = NOW()
       WHERE sp.seeking_post_id = ? AND u.open_id = ? AND sp.deleted_at IS NULL`,
      [requestId, openid]
    );
    return result.affectedRows
      ? { success: true, message: '求购信息已删除' }
      : { success: false, message: '求购信息不存在或无权删除' };
  } catch (error) {
    console.error('[deletePurchaseRequest] failed:', error);
    return { success: false, message: '删除求购信息失败' };
  } finally {
    if (connection) connection.release();
  }
};
