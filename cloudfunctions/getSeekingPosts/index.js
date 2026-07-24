// cloudfunctions/getSeekingPosts/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// --- 数据库连接配置 (确保与项目中其他云函数一致) ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool;
try {
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
        console.error('[getSeekingPosts] Critical DB config missing. ABORTING pool creation.');
    } else {
        pool = mysql.createPool(dbConfig);
        console.log('[getSeekingPosts] MySQL Pool created.');
    }
} catch (error) {
    console.error('[getSeekingPosts] Failed to create MySQL Pool:', error);
}

exports.main = async (event, context) => {
  console.log('[getSeekingPosts] Called. Event:', event);

  if (!pool) {
      console.error('[getSeekingPosts] Pool not available.');
      return { success: false, message: '数据库服务不可用' };
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const pageSize = event.pageSize || 10; // 每页数量
    const pageNum = event.page || 1;    // 当前页码
    const offset = (pageNum - 1) * pageSize;
    let userId = event.userId;
    const courseCode = typeof event.courseCode === 'string' ? event.courseCode.trim().slice(0, 50) : '';

    // "我的求购" 列表不能信任前端传入的 userId，统一用云函数上下文中的登录用户确认身份。
    if (userId) {
      const { OPENID: openid } = cloud.getWXContext();
      if (!openid) return { success: false, message: '请先登录' };
      const [users] = await connection.execute(
        'SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
        [openid]
      );
      if (!users.length) return { success: false, message: '用户信息不存在，请重新登录' };
      userId = users[0].user_id;
    }

    // --- 构建基础查询条件 ---
    let baseWhereClause = 'sp.status = ? AND sp.deleted_at IS NULL';
    let countBaseWhereClause = 'status = ? AND deleted_at IS NULL';
    let queryParams = ['active']; // SQL 查询参数数组
    let countQueryParams = ['active']; // Count 查询参数数组

    // --- 如果传入了 userId，则添加用户过滤条件 ---
    if (userId) {
      console.log(`[getSeekingPosts] Filtering by userId: ${userId}`);
      baseWhereClause += ' AND sp.user_id = ?';
      countBaseWhereClause += ' AND user_id = ?';
      queryParams.push(userId);       // 将 userId 加入参数数组
      countQueryParams.push(userId);  // 将 userId 加入 Count 参数数组
    } else {
      // 如果是获取所有求购（例如公共列表），则不需要 userId 过滤
      // 注意：根据你的前端代码，此函数目前仅用于获取“我的求购”，所以理论上 userId 应该总是存在
      // 如果未来需要复用此函数获取所有求购，需要前端调用时不传 userId
      console.log('[getSeekingPosts] No userId provided, fetching all active posts.');
    }

    if (courseCode) {
      baseWhereClause += ' AND sp.course_code = ?';
      countBaseWhereClause += ' AND course_code = ?';
      queryParams.push(courseCode);
      countQueryParams.push(courseCode);
    }

    // --- 添加分页参数 ---
    queryParams.push(pageSize);
    queryParams.push(offset);

    // 查询状态为 'active' 且未删除的求购信息，并关联用户信息
    const seekingSql = `
      SELECT
        sp.seeking_post_id as id,
        sp.user_id as postUserId, -- 求购发布者的 user_id
        sp.title,
        sp.author,
        sp.course_code as courseCode,
        sp.seeking_price_min as seekingPriceMin,
        sp.seeking_price_max as seekingPriceMax,
        sp.description,
        sp.cover_url_example as coverUrl, -- 使用 cover_url_example 作为封面图
        sp.created_at as createdAt,
        u.nick_name as userNickName,    -- 发布者昵称
        u.avatar_url as userAvatarUrl   -- 发布者头像
      FROM seeking_posts sp
      LEFT JOIN users u ON sp.user_id = u.user_id -- 关联 users 表
      WHERE
        ${baseWhereClause} -- 使用动态构建的 WHERE 条件
      ORDER BY
        sp.created_at DESC
      LIMIT ?
      OFFSET ?
    `;
    console.log('[getSeekingPosts] SQL:', seekingSql, queryParams);
    const [seekingPostsRows] = await connection.execute(seekingSql, queryParams); // <--- 使用 queryParams

    const countSql = `
        SELECT COUNT(*) as total
        FROM seeking_posts
        WHERE
          ${countBaseWhereClause} -- 使用动态构建的 WHERE 条件
    `;
    console.log('[getSeekingPosts] Count SQL:', countSql, countQueryParams);
    const [countRows] = await connection.execute(countSql, countQueryParams); // <--- 使用 countQueryParams
    const totalPosts = countRows[0].total;

    console.log(`[getSeekingPosts] Fetched ${seekingPostsRows.length} seeking posts for user ${userId || 'all'}. Total matching: ${totalPosts}`);

    return {
      success: true,
      data: seekingPostsRows,
      total: totalPosts,
      page: pageNum,
      pageSize: pageSize,
      hasMore: (pageNum * pageSize) < totalPosts
    };

  } catch (err) {
    console.error('[getSeekingPosts] Error:', err);
    return {
      success: false,
      message: '获取求购信息列表失败',
      errorDetails: err.message
    };
  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (releaseError) {
        console.error('[getSeekingPosts] Error releasing connection:', releaseError);
      }
    }
  }
};
