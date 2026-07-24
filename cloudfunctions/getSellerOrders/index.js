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

const statusMap = {
  pending: { text: '待发货', className: 'pendingShipment' },
  shipped: { text: '已发货', className: 'pendingReceipt' },
  completed: { text: '已完成', className: 'completed' },
  refunding: { text: '退款处理中', className: 'afterSales' },
  refunded: { text: '已退款', className: 'afterSales' }
};

exports.main = async (event) => {
  if (!pool) return { success: false, message: '数据库服务未配置' };
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, message: '请先登录' };
  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 50);
  let connection;
  try {
    connection = await pool.getConnection();
    const [sellers] = await connection.execute(
      'SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
      [openid]
    );
    if (!sellers.length) return { success: false, message: '用户信息不存在，请重新登录' };
    const sellerId = sellers[0].user_id;
    const [rows] = await connection.execute(
      `SELECT oi.order_item_id, oi.order_id, oi.book_id, oi.quantity, oi.price_at_purchase,
              oi.book_title_snapshot, oi.book_cover_url_snapshot, oi.book_course_code_snapshot,
              oi.status AS item_status, o.order_number, o.created_at, u.nick_name AS buyer_name
       FROM order_items oi
       INNER JOIN orders o ON o.order_id = oi.order_id
       INNER JOIN users u ON u.user_id = o.user_id
       WHERE oi.seller_id = ?
       ORDER BY o.created_at DESC, oi.order_item_id DESC
       LIMIT ? OFFSET ?`,
      [sellerId, pageSize, (page - 1) * pageSize]
    );
    const [countRows] = await connection.execute(
      'SELECT COUNT(*) AS total FROM order_items WHERE seller_id = ?',
      [sellerId]
    );
    const total = Number(countRows[0].total);
    return {
      success: true,
      data: rows.map(item => {
        const display = statusMap[item.item_status] || { text: item.item_status, className: 'completed' };
        return {
          orderItemId: item.order_item_id,
          orderId: item.order_id,
          orderNumber: item.order_number,
          bookId: item.book_id,
          title: item.book_title_snapshot,
          coverUrl: item.book_cover_url_snapshot || null,
          courseCode: item.book_course_code_snapshot || '',
          buyerName: item.buyer_name || '匿名买家',
          quantity: Number(item.quantity),
          displayPrice: Number(item.price_at_purchase).toFixed(2),
          status: item.item_status,
          statusText: display.text,
          statusClass: display.className
        };
      }),
      pagination: { page, pageSize, total, hasMore: page * pageSize < total }
    };
  } catch (error) {
    console.error('[getSellerOrders] failed:', error);
    return { success: false, message: '加载售出订单失败' };
  } finally {
    if (connection) connection.release();
  }
};
