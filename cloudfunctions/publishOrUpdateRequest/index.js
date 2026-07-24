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

function cleanText(value, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return maxLength ? text.slice(0, maxLength) : text;
}

exports.main = async (event) => {
  if (!pool) return { success: false, message: '数据库服务未配置' };
  const { OPENID: openid } = cloud.getWXContext();
  const requestId = Number(event.requestId) || null;
  const requestData = event.requestData || {};
  const title = cleanText(requestData.title, 255);
  const author = cleanText(requestData.author, 100) || null;
  const courseCode = cleanText(requestData.courseCode, 50) || null;
  const description = cleanText(requestData.description) || null;
  const coverUrl = cleanText(requestData.coverImageUrl, 1024) || null;
  const expectedPrice = Number(requestData.expectedPrice);

  if (!openid) return { success: false, message: '请先登录' };
  if (!title) return { success: false, message: '请输入书名' };
  if (!Number.isFinite(expectedPrice) || expectedPrice <= 0) return { success: false, message: '期望价格不正确' };

  let connection;
  try {
    connection = await pool.getConnection();
    const [users] = await connection.execute(
      'SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
      [openid]
    );
    if (!users.length) return { success: false, message: '用户信息不存在，请重新登录' };
    const userId = users[0].user_id;

    if (requestId) {
      const [result] = await connection.execute(
        `UPDATE seeking_posts
         SET title = ?, author = ?, course_code = ?, seeking_price_min = ?, seeking_price_max = ?,
             description = ?, cover_url_example = ?, status = 'active', updated_at = NOW()
         WHERE seeking_post_id = ? AND user_id = ? AND deleted_at IS NULL`,
        [title, author, courseCode, expectedPrice, expectedPrice, description, coverUrl, requestId, userId]
      );
      if (!result.affectedRows) return { success: false, message: '求购信息不存在或无权修改' };
      return { success: true, message: '求购信息已更新', requestId };
    }

    const [result] = await connection.execute(
      `INSERT INTO seeking_posts
       (user_id, title, author, course_code, seeking_price_min, seeking_price_max, description, cover_url_example, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userId, title, author, courseCode, expectedPrice, expectedPrice, description, coverUrl]
    );
    return { success: true, message: '求购信息发布成功', requestId: result.insertId };
  } catch (error) {
    console.error('[publishOrUpdateRequest] failed:', error);
    return { success: false, message: '保存求购信息失败' };
  } finally {
    if (connection) connection.release();
  }
};
