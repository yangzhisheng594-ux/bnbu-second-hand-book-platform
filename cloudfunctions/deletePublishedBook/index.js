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
  const bookId = Number(event.bookId);
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, message: '请先登录' };
  if (!bookId) return { success: false, message: '书籍参数不正确' };

  let connection;
  try {
    connection = await pool.getConnection();
    const [result] = await connection.execute(
      `UPDATE books b INNER JOIN users u ON u.user_id = b.user_id
       SET b.status = 'delisted', b.deleted_at = NOW(), b.updated_at = NOW()
       WHERE b.book_id = ? AND u.open_id = ? AND b.deleted_at IS NULL AND b.status <> 'sold'`,
      [bookId, openid]
    );
    return result.affectedRows
      ? { success: true, message: '书籍已下架' }
      : { success: false, message: '书籍不存在、已售出或无权操作' };
  } catch (error) {
    console.error('[deletePublishedBook] failed:', error);
    return { success: false, message: '下架书籍失败' };
  } finally {
    if (connection) connection.release();
  }
};
