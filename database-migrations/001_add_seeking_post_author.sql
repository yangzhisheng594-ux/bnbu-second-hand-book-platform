-- 为已部署数据库补齐求购作者字段；脚本可重复执行。
SET @has_author_column = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'seeking_posts'
    AND COLUMN_NAME = 'author'
);

SET @migration_sql = IF(
  @has_author_column = 0,
  'ALTER TABLE seeking_posts ADD COLUMN author VARCHAR(100) DEFAULT NULL AFTER title',
  'SELECT 1'
);

PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
