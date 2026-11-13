-- Chạy MỘT LẦN khi database được tạo lần đầu (volume pgdata còn trống).
-- unaccent : tìm kiếm tiếng Việt không dấu ("dao tao" tìm ra "đào tạo")
-- pg_trgm  : tìm kiếm gần đúng, gõ sai chính tả vẫn ra kết quả
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Đặt múi giờ mặc định của database là giờ Việt Nam
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Ho_Chi_Minh');
END
$$;
