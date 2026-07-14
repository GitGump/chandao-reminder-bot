-- ============================================
-- 迭代需求群消息自动通知系统 - 数据库 Schema
-- 数据库：Supabase (PostgreSQL)
-- ============================================

-- 1. 发版日历表
CREATE TABLE IF NOT EXISTS release_calendar (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  iteration_number VARCHAR(10) NOT NULL UNIQUE,
  planning_date DATE NOT NULL,
  release_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 机器人配置表
CREATE TABLE IF NOT EXISTS robot_config (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,  -- 从环境变量 WEBHOOK_URL 注入，请勿在此硬编码
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 消息模板表
CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  message_type INTEGER NOT NULL UNIQUE CHECK (message_type IN (1, 2, 3)),
  template_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 推送时间配置表
CREATE TABLE IF NOT EXISTS push_time_config (
  id SERIAL PRIMARY KEY,
  message_type INTEGER NOT NULL UNIQUE CHECK (message_type IN (1, 2, 3)),
  robot_id INTEGER REFERENCES robot_config(id) ON DELETE SET NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  minute INTEGER NOT NULL CHECK (minute >= 0 AND minute <= 59),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. @成员配置表
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  message_type INTEGER NOT NULL CHECK (message_type IN (1, 2, 3)),
  member_name VARCHAR(100) NOT NULL,
  userid VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 推送日志表
CREATE TABLE IF NOT EXISTS push_logs (
  id SERIAL PRIMARY KEY,
  message_type INTEGER NOT NULL CHECK (message_type IN (1, 2, 3)),
  iteration_number VARCHAR(10),
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'preview', 'retrying')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  pushed_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 节假日表
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 预览配置表
CREATE TABLE IF NOT EXISTS preview_config (
  id SERIAL PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  preview_lead_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 禅道编号配置表
CREATE TABLE IF NOT EXISTS chanzhou_config (
  id SERIAL PRIMARY KEY,
  base_iteration VARCHAR(10) NOT NULL,
  base_chanzhou_num INTEGER NOT NULL,
  increment INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(50) NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  description VARCHAR(200),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Worker 心跳表
CREATE TABLE IF NOT EXISTS worker_heartbeat (
  id SERIAL PRIMARY KEY,
  worker_id VARCHAR(100) NOT NULL,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_calendar_year ON release_calendar(year);
CREATE INDEX IF NOT EXISTS idx_calendar_dates ON release_calendar(planning_date, release_date);
CREATE INDEX IF NOT EXISTS idx_members_type ON members(message_type);
CREATE INDEX IF NOT EXISTS idx_logs_type ON push_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_logs_status ON push_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_pushed_at ON push_logs(pushed_at);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(year);
CREATE INDEX IF NOT EXISTS idx_holidays_dates ON holidays(start_date, end_date);

-- ============================================
-- 自动更新 updated_at 触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_release_calendar_updated_at BEFORE UPDATE ON release_calendar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_robot_config_updated_at BEFORE UPDATE ON robot_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_push_time_config_updated_at BEFORE UPDATE ON push_time_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_preview_config_updated_at BEFORE UPDATE ON preview_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chanzhou_config_updated_at BEFORE UPDATE ON chanzhou_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始数据
-- ============================================

-- ============================================
-- 以下 INSERT 为示例/参考数据，请根据实际环境修改
-- 敏感值（Webhook URL / 内网地址）应通过环境变量注入，切勿硬编码提交
-- ============================================

-- 消息模板默认值（URL 中的 {CHANZHOU_URL} 部署时替换）
INSERT INTO message_templates (message_type, template_content) VALUES
(1, '【{发版日日期}联合规划会需求收集提醒】@ALL\n\n{发版日日期}迭代联合规划会计划在{规划会日期}召开，请大家提前准备好需求文档。\n\n禅道需求：{CHANZHOU_URL}/execution-story-{禅道编号}.html'),
(2, '【{发版日日期}迭代进度更新提醒】@ALL\n\n请各位负责人及时更新{发版日日期}迭代的需求进度状态（开发中/测试中/已完成）。\n\n禅道需求：{CHANZHOU_URL}/execution-story-{禅道编号}.html'),
(3, '【{发版日日期}发版后状态更新提醒】@ALL\n\n{发版日日期}已发版，请各负责人确认需求上线状态，及时关闭已完成需求。\n\n禅道需求：{CHANZHOU_URL}/execution-story-{禅道编号}.html');

-- 禅道编号配置默认值
INSERT INTO chanzhou_config (base_iteration, base_chanzhou_num, increment) VALUES ('0526', 348, 1);

-- 预览配置默认值
INSERT INTO preview_config (enabled, preview_lead_minutes) VALUES (false, 60);

-- 推送时间默认值
INSERT INTO push_time_config (message_type, hour, minute, is_active) VALUES
(1, 10, 0, true),
(2, 11, 0, true),
(3, 9, 15, true);

-- 系统配置默认值（{CHANZHOU_URL} 部署时替换）
INSERT INTO system_config (config_key, config_value, description) VALUES
('chanzhou_base_url', '{CHANZHOU_URL}', '禅道基础URL'),
('chanzhou_story_path', '/execution-story-{id}.html', '禅道需求页面路径模板');

-- 2026年节假日（国务院办公厅国办发明电〔2025〕7号）
INSERT INTO holidays (name, start_date, end_date, year) VALUES
('元旦', '2026-01-01', '2026-01-03', 2026),
('春节', '2026-02-15', '2026-02-23', 2026),
('清明节', '2026-04-04', '2026-04-06', 2026),
('劳动节', '2026-05-01', '2026-05-05', 2026),
('端午节', '2026-06-19', '2026-06-21', 2026),
('中秋节', '2026-09-25', '2026-09-27', 2026),
('国庆节', '2026-10-01', '2026-10-07', 2026);
