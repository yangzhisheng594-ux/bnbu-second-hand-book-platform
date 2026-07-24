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
  const input = event.updatedProfileData || {};
  if (!openid) return { success: false, message: '请先登录' };
  const hasNickName = typeof input.nickName === 'string';
  const hasAvatar = typeof input.avatarUrl === 'string';
  if (!hasNickName && !hasAvatar) return { success: false, message: '没有可更新的信息' };

  const nickName = hasNickName ? input.nickName.trim().slice(0, 100) : null;
  const avatarUrl = hasAvatar ? input.avatarUrl.trim().slice(0, 1024) : null;
  let connection;
  try {
    connection = await pool.getConnection();
    const [existing] = await connection.execute(
      'SELECT nick_name, avatar_url FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
      [openid]
    );
    if (!existing.length) return { success: false, message: '用户记录不存在，请重新登录' };
    await connection.execute(
      'UPDATE users SET nick_name = ?, avatar_url = ?, updated_at = NOW() WHERE open_id = ?',
      [hasNickName ? nickName : existing[0].nick_name, hasAvatar ? avatarUrl : existing[0].avatar_url, openid]
    );
    return { success: true, message: '用户信息更新成功' };
  } catch (error) {
    console.error('[updateUserProfile] failed:', error);
    return { success: false, message: '更新用户信息失败' };
  } finally {
    if (connection) connection.release();
  }
};
