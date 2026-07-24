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
  if (!pool) return { success: false, message: '数据库服务未配置，请联系管理员' };

  const type = event.type || 'recent';
  const page = Math.max(Number(event.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 10, 1), 50);
  const searchKeyword = typeof event.searchKeyword === 'string' ? event.searchKeyword.trim().slice(0, 100) : '';
  const categoryId = Number(event.categoryId) || null;
  const userId = Number(event.userId) || null;
  const courseCode = typeof event.courseCode === 'string' ? event.courseCode.trim().slice(0, 50) : '';
  const where = ['b.deleted_at IS NULL'];
  const params = [];

  if (Array.isArray(event.status) && event.status.length) {
    const statuses = event.status.filter(value => typeof value === 'string' && value.length <= 30);
    if (statuses.length) {
      where.push(`b.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
  } else {
    where.push('b.status = ?');
    params.push(typeof event.status === 'string' ? event.status : 'selling');
  }

  if (type === 'search' && searchKeyword) {
    const term = `%${searchKeyword}%`;
    where.push('(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR b.course_code LIKE ? OR b.description LIKE ?)');
    params.push(term, term, term, term, term);
  }
  if (type === 'byCategory' && categoryId) {
    where.push('b.category_id = ?');
    params.push(categoryId);
  }
  if (type === 'byUser' && userId) {
    where.push('b.user_id = ?');
    params.push(userId);
  }
  if (courseCode) {
    where.push('b.course_code = ?');
    params.push(courseCode);
  }

  const sort = type === 'bestseller' ? 'b.views DESC, b.created_at DESC' : 'b.created_at DESC';
  const whereSql = `WHERE ${where.join(' AND ')}`;
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT b.*, (
         SELECT bi.image_url FROM book_images bi WHERE bi.book_id = b.book_id
         ORDER BY bi.is_cover DESC, bi.sort_order ASC LIMIT 1
       ) AS cover_url
       FROM books b ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS total FROM books b ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);
    return {
      success: true,
      data: rows.map(book => ({
        id: book.book_id,
        userId: book.user_id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        publisher: book.publisher,
        condition: book.condition,
        price: Number(book.price),
        originalPrice: book.original_price === null ? null : Number(book.original_price),
        courseCode: book.course_code,
        description: book.description,
        status: book.status,
        isBestseller: Boolean(book.is_bestseller),
        views: Number(book.views),
        categoryId: book.category_id,
        createdAt: book.created_at,
        updatedAt: book.updated_at,
        coverUrl: book.cover_url || null
      })),
      pagination: {
        currentPage: page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total
      }
    };
  } catch (error) {
    console.error('[getBooks] failed:', error);
    return { success: false, message: '获取书籍列表失败' };
  } finally {
    if (connection) connection.release();
  }
};
