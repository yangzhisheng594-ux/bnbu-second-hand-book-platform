// cloudfunctions/getBooksForHomepage/index.js
const cloud = require('wx-server-sdk');
const mysql = require('mysql2/promise');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// --- Environment Variable Validation ---
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_PORT'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

let dbConfig = {};
let pool;

if (missingEnvVars.length > 0) {
  console.error(`[getBooksForHomepage] Critical database configuration missing from environment variables: ${missingEnvVars.join(', ')}. ABORTING pool creation.`);
  // Pool will remain undefined, handled later in exports.main
} else {
  // --- Database Configuration ---
  dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS, // Read password but avoid logging it directly below
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT), // DB_PORT is confirmed to exist here
    waitForConnections: true,
    connectionLimit: 5, // Adjust based on expected load and DB capacity
    queueLimit: 0,
    charset: 'utf8mb4' // Recommended for full Unicode support
  };

  // --- MySQL Connection Pool ---
  try {
    console.log('[getBooksForHomepage] Attempting to create MySQL Connection Pool with config:', {
      host: dbConfig.host,
      user: dbConfig.user ? '******' : undefined, // Avoid logging sensitive info
      database: dbConfig.database,
      port: dbConfig.port
    });
    pool = mysql.createPool(dbConfig);
    console.log('[getBooksForHomepage] MySQL Connection Pool instance created (or creation attempted).');
  } catch (error) {
    // This catches synchronous errors during pool creation itself
    console.error('[getBooksForHomepage] Failed to create MySQL Connection Pool during initialization:', error);
    pool = null; // Ensure pool is null/undefined if creation fails
  }
}

// --- Constants ---
// Define how many books to show in each section (bestsellers, recent)
const ITEMS_PER_SECTION = 8; // 你之前设置的是 8，保持不变

// --- Main Cloud Function Handler ---
exports.main = async (event, context) => {
  console.log('[Cloud Function] [getBooksForHomepage] called, event:', JSON.stringify(event));
  console.log('[getBooksForHomepage] Main function using DB Host from config:', dbConfig.host || 'N/A (Config or Pool missing)');

  // --- Pool Availability Check ---
  // Check if pool is unavailable due to missing env vars or creation error
  if (!pool) {
    console.error('[getBooksForHomepage] MySQL Connection Pool is not available (likely due to missing config or init error).');
    const errorDetails = missingEnvVars.length > 0
        ? `Missing environment variables: ${missingEnvVars.join(', ')}`
        : 'Pool not initialized due to other error during setup.';
    return {
      success: false,
      message: '数据库服务配置错误或初始化失败，请联系管理员。',
      errorDetails: errorDetails
    };
  }

  let connection;
  try {
    // --- Get Connection ---
    console.log('[getBooksForHomepage] Attempting to get connection from pool...');
    connection = await pool.getConnection();
    console.log('[getBooksForHomepage] Successfully got a connection from the pool.');

    // --- Fetch Bestseller Books ---
    // ** MODIFICATION: Embed LIMIT value directly into the SQL string **
    const bestsellerSql = `
      SELECT
        b.book_id as id,
        b.title,
        COALESCE(bi.image_url, NULL) as coverUrl,
        b.course_code as courseCode,
        b.price
      FROM books b
      LEFT JOIN book_images bi ON b.book_id = bi.book_id AND bi.is_cover = TRUE
      WHERE
        b.is_bestseller = TRUE AND
        b.status = 'selling' AND
        b.deleted_at IS NULL
      ORDER BY
        b.views DESC, b.created_at DESC
      LIMIT ${ITEMS_PER_SECTION}`; // <-- Correctly embed the limit value
    // ** MODIFICATION: Update log to show the full SQL **
    console.log('[getBooksForHomepage] Bestseller SQL:', bestsellerSql);
    // ** MODIFICATION: Remove the second argument (parameters) from execute **
    let [bestsellersRows] = await connection.execute(bestsellerSql);
    console.log(`[getBooksForHomepage] Fetched ${bestsellersRows.length} Bestsellers.`);

    // 新库尚未标记推荐书籍时，按热度回退，避免首页推荐区域空白。
    if (bestsellersRows.length === 0) {
      const fallbackSql = `
        SELECT
          b.book_id as id,
          b.title,
          COALESCE(bi.image_url, NULL) as coverUrl,
          b.course_code as courseCode,
          b.price
        FROM books b
        LEFT JOIN book_images bi ON b.book_id = bi.book_id AND bi.is_cover = TRUE
        WHERE b.status = 'selling' AND b.deleted_at IS NULL
        ORDER BY b.views DESC, b.created_at DESC
        LIMIT ${ITEMS_PER_SECTION}`;
      [bestsellersRows] = await connection.execute(fallbackSql);
      console.log(`[getBooksForHomepage] Fallback fetched ${bestsellersRows.length} books.`);
    }

    // --- Fetch Recently Released Books ---
    // ** MODIFICATION: Embed LIMIT value directly into the SQL string **
    const recentSql = `
      SELECT
        b.book_id as id,
        b.title,
        COALESCE(bi.image_url, NULL) as coverUrl,
        b.course_code as courseCode,
        b.price,
        b.original_price as originalPrice
      FROM books b
      LEFT JOIN book_images bi ON b.book_id = bi.book_id AND bi.is_cover = TRUE
      WHERE
        b.status = 'selling' AND
        b.deleted_at IS NULL
      ORDER BY
        b.created_at DESC
      LIMIT ${ITEMS_PER_SECTION}`; // <-- Correctly embed the limit value
    // ** MODIFICATION: Update log to show the full SQL **
    console.log('[getBooksForHomepage] Recent Releases SQL:', recentSql);
    // ** MODIFICATION: Remove the second argument (parameters) from execute **
    const [recentRows] = await connection.execute(recentSql);
    console.log(`[getBooksForHomepage] Fetched ${recentRows.length} Recent Releases.`);

    // --- Success Response ---
    return {
      success: true,
      data: {
        bestsellers: bestsellersRows,
        recentReleases: recentRows
      }
    };

  } catch (err) {
    // --- Error Handling ---
    console.error('[Cloud Function] [getBooksForHomepage] Database query or logic error:', err);

    // Specific error handling (e.g., connection refused)
    if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
      console.error(`[getBooksForHomepage] ECONNREFUSED error. Host: ${dbConfig.host}, Port: ${dbConfig.port}. Check DB config, network ACLs, firewall, and DB server status.`);
      return {
        success: false,
        message: '无法连接到数据库服务，请稍后重试或联系管理员。',
        errorDetails: `Connection refused to ${dbConfig.host}:${dbConfig.port}`,
        errorCode: err.code || 'DB_CONN_REFUSED'
      };
    }
    // Add handling for other common DB errors if needed (e.g., ER_ACCESS_DENIED_ERROR)

    // General error response (includes the ER_WRONG_ARGUMENTS if it somehow still occurs)
    return {
      success: false,
      message: '获取首页书籍失败，服务器开小差了~',
      errorDetails: err.message, // Provide the actual error message
      errorCode: err.code // Provide the actual error code
    };
  } finally {
    // --- Release Connection ---
    // Always release the connection back to the pool in the finally block
    if (connection) {
      try {
        await connection.release();
        console.log('[getBooksForHomepage] Connection released back to the pool.');
      } catch (releaseError) {
        // Log error during release but don't overwrite the original error response
        console.error('[getBooksForHomepage] Error releasing database connection:', releaseError);
      }
    }
  }
};
