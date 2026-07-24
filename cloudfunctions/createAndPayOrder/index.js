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

function createOrderNumber() {
  return `SB${Date.now()}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
}

exports.main = async (event) => {
  if (!pool) return { success: false, message: '数据库服务未配置' };
  const { OPENID: openid } = cloud.getWXContext();
  const source = event.source === 'cart' ? 'cart' : 'buy_now';
  const rawItems = Array.isArray(event.items) ? event.items : [];
  if (!openid) return { success: false, message: '请先登录后再支付' };
  if (!rawItems.length || rawItems.length > 20) return { success: false, message: '订单商品数量不正确' };

  const items = rawItems.map(item => ({
    bookId: Number(item.bookId),
    quantity: Number(item.quantity) || 1
  }));
  if (items.some(item => !Number.isInteger(item.bookId) || item.bookId <= 0 || item.quantity !== 1)) {
    return { success: false, message: '二手书每本仅可购买一件' };
  }
  if (new Set(items.map(item => item.bookId)).size !== items.length) {
    return { success: false, message: '订单中不能重复添加同一本书' };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT user_id FROM users WHERE open_id = ? AND deleted_at IS NULL LIMIT 1',
      [openid]
    );
    if (!users.length) throw new Error('用户信息不存在，请重新登录');
    const buyerId = users[0].user_id;
    const orderItems = [];

    for (const item of items) {
      const [books] = await connection.execute(
        `SELECT b.book_id, b.user_id, b.title, b.course_code, b.price, b.status,
                (SELECT image_url FROM book_images WHERE book_id = b.book_id
                 ORDER BY is_cover DESC, sort_order ASC LIMIT 1) AS cover_url
         FROM books b WHERE b.book_id = ? AND b.deleted_at IS NULL FOR UPDATE`,
        [item.bookId]
      );
      if (!books.length) throw new Error('有书籍已不存在，请刷新后重试');
      const book = books[0];
      if (book.status !== 'selling') throw new Error(`《${book.title}》已下架或售出`);
      if (Number(book.user_id) === Number(buyerId)) throw new Error('不能购买自己发布的书籍');
      orderItems.push({
        bookId: book.book_id,
        sellerId: book.user_id,
        title: book.title,
        courseCode: book.course_code,
        coverUrl: book.cover_url,
        price: Number(book.price)
      });
    }

    const total = orderItems.reduce((sum, item) => sum + item.price, 0);
    const orderNumber = createOrderNumber();
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
       (order_number, user_id, total_amount, payment_amount, total_quantity, status, source, payment_method, paid_at)
       VALUES (?, ?, ?, ?, ?, 'pending_shipment', ?, 'mock_wechat_pay', NOW())`,
      [orderNumber, buyerId, total, total, orderItems.length, source]
    );
    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
         (order_id, book_id, seller_id, quantity, price_at_purchase, book_title_snapshot,
          book_cover_url_snapshot, book_course_code_snapshot, status)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'pending')`,
        [orderId, item.bookId, item.sellerId, item.price, item.title, item.coverUrl, item.courseCode]
      );
      await connection.execute(
        "UPDATE books SET status = 'sold', updated_at = NOW() WHERE book_id = ? AND status = 'selling'",
        [item.bookId]
      );
    }

    if (source === 'cart') {
      const placeholders = orderItems.map(() => '?').join(', ');
      await connection.execute(
        `DELETE FROM cart_items WHERE user_id = ? AND book_id IN (${placeholders})`,
        [buyerId, ...orderItems.map(item => item.bookId)]
      );
    }
    await connection.commit();
    return { success: true, message: '支付成功，请与卖家约定校内面交', orderId, orderNumber, totalAmount: total.toFixed(2) };
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[createAndPayOrder] failed:', error);
    return { success: false, message: error.message || '支付失败，请稍后重试' };
  } finally {
    if (connection) connection.release();
  }
};
