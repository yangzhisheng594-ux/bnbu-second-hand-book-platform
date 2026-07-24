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
      `SELECT user_id, open_id, nick_name, avatar_url, phone_number, gender, city, province, country,
              created_at, updated_at
       FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1`,
      [openid]
    );
    return rows.length
      ? { success: true, data: rows[0] }
      : { success: false, message: '用户记录不存在，请重新登录' };
  } catch (error) {
    console.error('[getUserProfile] failed:', error);
    return { success: false, message: '获取用户信息失败' };
  } finally {
    if (connection) connection.release();
  }
};
