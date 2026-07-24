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

const statusRules = {
  pendingPayment: { values: ['pending_payment'], text: '待付款', className: 'pendingPayment' },
  pendingShipment: { values: ['pending_shipment'], text: '待约定面交', className: 'pendingShipment' },
  pendingReceipt: { values: ['shipped'], text: '待确认收书', className: 'pendingReceipt' },
  afterSales: { values: ['refund_processing', 'refunded'], text: '退款/售后', className: 'afterSales' },
  completed: { values: ['completed'], text: '已完成', className: 'completed' }
};

function presentationFor(status) {
  return Object.values(statusRules).find(rule => rule.values.includes(status)) || { text: status, className: 'completed' };
}

exports.main = async (event) => {
  if (!pool) return { success: false, message: '数据库服务未配置' };
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, message: '请先登录' };
  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 50);
  const filter = statusRules[event.status];
  let connection;
  try {
    connection = await pool.getConnection();
    const [users] = await connection.execute('SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1', [openid]);
    if (!users.length) return { success: false, message: '用户信息不存在，请重新登录' };
    const params = [users[0].user_id];
    let where = 'o.user_id = ?';
    if (filter) {
      where += ` AND o.status IN (${filter.values.map(() => '?').join(', ')})`;
      params.push(...filter.values);
    }
    const [orders] = await connection.execute(
      `SELECT o.order_id, o.order_number, o.status, o.total_quantity, o.total_amount, o.created_at
       FROM orders o WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const [totals] = await connection.execute(`SELECT COUNT(*) AS total FROM orders o WHERE ${where}`, params);
    if (!orders.length) return { success: true, data: [], pagination: { page, pageSize, total: Number(totals[0].total), hasMore: false } };

    const orderIds = orders.map(order => order.order_id);
    const [products] = await connection.execute(
      `SELECT order_id, order_item_id, book_id, book_title_snapshot, book_cover_url_snapshot,
              book_course_code_snapshot, quantity, price_at_purchase
       FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(', ')}) ORDER BY order_item_id ASC`,
      orderIds
    );
    const productMap = products.reduce((map, product) => {
      const list = map.get(product.order_id) || [];
      list.push({
        productId: product.book_id,
        title: product.book_title_snapshot,
        coverUrl: product.book_cover_url_snapshot,
        courseCode: product.book_course_code_snapshot,
        quantity: Number(product.quantity),
        price: Number(product.price_at_purchase),
        displayPrice: Number(product.price_at_purchase).toFixed(2)
      });
      map.set(product.order_id, list);
      return map;
    }, new Map());
    return {
      success: true,
      data: orders.map(order => {
        const presentation = presentationFor(order.status);
        return {
          orderId: order.order_id,
          orderNumber: order.order_number,
          status: presentation.className,
          statusText: presentation.text,
          statusClass: presentation.className,
          totalQuantity: Number(order.total_quantity),
          totalAmount: Number(order.total_amount),
          displayTotalAmount: Number(order.total_amount).toFixed(2),
          products: productMap.get(order.order_id) || []
        };
      }),
      pagination: { page, pageSize, total: Number(totals[0].total), hasMore: page * pageSize < Number(totals[0].total) }
    };
  } catch (error) {
    console.error('[getOrders] failed:', error);
    return { success: false, message: '加载订单失败' };
  } finally {
    if (connection) connection.release();
  }
};
