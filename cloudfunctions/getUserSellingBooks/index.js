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
  if (!openid) return { success: false, message: '请先登录' };
  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 10, 1), 50);
  let connection;
  try {
    connection = await pool.getConnection();
    const [users] = await connection.execute(
      'SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
      [openid]
    );
    if (!users.length) return { success: false, message: '用户信息不存在，请重新登录' };
    const userId = users[0].user_id;
    const [rows] = await connection.execute(
      `SELECT b.book_id AS id, b.title, b.course_code AS courseCode, b.price, b.status,
              b.created_at AS createdAt,
              (SELECT bi.image_url FROM book_images bi WHERE bi.book_id = b.book_id
               ORDER BY bi.is_cover DESC, bi.sort_order ASC LIMIT 1) AS coverUrl
       FROM books b
       WHERE b.user_id = ? AND b.deleted_at IS NULL AND b.status = 'selling'
       ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, (page - 1) * pageSize]
    );
    const [countRows] = await connection.execute(
      "SELECT COUNT(*) AS total FROM books WHERE user_id = ? AND deleted_at IS NULL AND status = 'selling'",
      [userId]
    );
    const total = Number(countRows[0].total);
    return {
      success: true,
      data: rows.map(book => ({ ...book, price: Number(book.price), coverUrl: book.coverUrl || null })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total
    };
  } catch (error) {
    console.error('[getUserSellingBooks] failed:', error);
    return { success: false, message: '获取待售书籍失败' };
  } finally {
    if (connection) connection.release();
  }
};
