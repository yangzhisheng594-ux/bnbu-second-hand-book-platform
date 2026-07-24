// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise'); // 引入 mysql2

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// --- 数据库连接配置 (确保与项目中其他云函数一致) ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS, // 确保环境变量 Key 是 DB_PASS
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool;
// 初始化连接池
try {
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
        console.error('[Login] Critical DB config missing. ABORTING pool creation.');
    } else {
        console.log('[Login] Attempting to create MySQL Pool with config:', {
            host: dbConfig.host, user: dbConfig.user, database: dbConfig.database, port: dbConfig.port
        });
        pool = mysql.createPool(dbConfig);
        console.log('[Login] MySQL Pool possibly created.');
    }
} catch (error) {
    console.error('[Login] Failed to create MySQL Pool during init:', error);
}


exports.main = async (event, context) => {
  console.log('[Cloud Function] [login] called, event:', event);
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!pool) {
      console.error('[Login] MySQL Pool not available.');
      return { success: false, message: '数据库服务初始化失败' };
  }
  if (!openid) {
    console.error('[Login] OpenID not available from wxContext.');
    return { success: false, message: '获取 OpenID 失败' };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('[Login] Got connection from pool.');

    // 1. 检查用户是否已存在 (根据 open_id 字段)
    const selectSql = 'SELECT * FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1';
    console.log('[Login] Select User SQL:', selectSql, [openid]);
    const [userRows] = await connection.execute(selectSql, [openid]);

    let userData = null;

    if (userRows.length === 0) {
      // 用户不存在，创建新用户记录
      const defaultNickName = `微信用户_${openid.slice(-4)}`;
      const defaultAvatarUrl = ''; // 你可以提供一个默认头像的 URL

      const insertSql = `
        INSERT INTO users
        (open_id, nick_name, avatar_url, created_at, updated_at)
        VALUES (?, ?, ?, NOW(), NOW())
      `;
      const insertValues = [
        openid,
        (event.userInfoFromWx && event.userInfoFromWx.nickName) ? event.userInfoFromWx.nickName : defaultNickName,
        (event.userInfoFromWx && event.userInfoFromWx.avatarUrl) ? event.userInfoFromWx.avatarUrl : defaultAvatarUrl
      ];
      console.log('[Login] Insert User SQL:', insertSql, insertValues);
      const [insertResult] = await connection.execute(insertSql, insertValues);

      const newUserId = insertResult.insertId; // 获取新插入用户的 user_id
      console.log('[Login] New user created with user_id:', newUserId);

      // 获取新创建的用户数据以便返回 (包含所有字段，包括 user_id)
      const [newUserRows] = await connection.execute('SELECT * FROM users WHERE user_id = ?', [newUserId]);
      if (newUserRows.length > 0) {
        userData = newUserRows[0];
        // MySQL 的 boolean 可能会返回 0 或 1，确保在前端能正确处理
        // MySQL 的 timestamp 字段返回的也是可以直接使用的日期字符串或对象
      }

    } else {
      // 用户已存在
      userData = userRows[0];
      console.log('[Login] User already exists with user_id:', userData.user_id);

      // 如果前端在登录时也传递了最新的微信用户信息 (userInfoFromWx)，并且与数据库中的不同，则更新
      let needsUpdate = false;
      let updateFields = {};
      if (event.userInfoFromWx) {
        if (event.userInfoFromWx.nickName && event.userInfoFromWx.nickName !== userData.nick_name) {
          updateFields.nick_name = event.userInfoFromWx.nickName;
          needsUpdate = true;
        }
        if (event.userInfoFromWx.avatarUrl && event.userInfoFromWx.avatarUrl !== userData.avatar_url) {
          updateFields.avatar_url = event.userInfoFromWx.avatarUrl;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        const updateSql = 'UPDATE users SET nick_name = ?, avatar_url = ?, updated_at = NOW() WHERE user_id = ?';
        const updateValues = [
          updateFields.nick_name || userData.nick_name,
          updateFields.avatar_url || userData.avatar_url,
          userData.user_id
        ];
        console.log('[Login] Updating profile for user_id:', userData.user_id);
        await connection.execute(updateSql, updateValues);

        // 更新后重新获取 userData
        const [updatedUserRows] = await connection.execute('SELECT * FROM users WHERE user_id = ?', [userData.user_id]);
        if (updatedUserRows.length > 0) {
            userData = updatedUserRows[0];
        }
        console.log('[Login] User info updated based on userInfoFromWx.');
      }
    }

    // 确保返回的 userData 包含 open_id (MySQL 表设计中有) 和 user_id
    // 如果你的 users 表中没有 _openid 字段，但有 open_id，确保前端正确使用
    // userData 中应该包含 user_id, open_id, nick_name, avatar_url 等
    if (userData) {
        // 将 MySQL 中的字段名映射到前端可能期望的（如果需要）
        // 例如，前端可能期望 _openid，但 MySQL 表是 open_id
        // userData._openid = userData.open_id; // 如果前端严格依赖 _openid
    }


    return {
      success: true,
      message: '登录成功',
      openid: openid, // 这个 openid 是从 wxContext 获取的
      // appid: wxContext.APPID, // 这个也可以返回
      userData: userData // 返回从 MySQL 数据库中获取或创建的用户信息
    };

  } catch (err) {
    console.error('[Cloud Function] [login] Error:', err);
    return {
      success: false,
      message: '登录处理失败，请稍后再试',
      errorDetails: err.message, // 返回更具体的错误信息
      errorCode: err.code      // 返回 MySQL 错误码
    };
  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('[Login] Connection released.');
      } catch (releaseError) {
        console.error('[Login] Error releasing connection:', releaseError);
      }
    }
  }
};
