PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nav_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'task')),
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_expanded INTEGER NOT NULL DEFAULT 1 CHECK (is_expanded IN (0, 1)),
  owner_user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  FOREIGN KEY (parent_id) REFERENCES nav_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE task_details (
  id TEXT PRIMARY KEY,
  nav_node_id TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  due_date DATE NULL,
  alarm_at DATETIME NULL,
  assignee_user_id TEXT NULL,
  memo_content TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (nav_node_id) REFERENCES nav_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_user_id) REFERENCES users(id)
);

CREATE TABLE sub_tasks (
  id TEXT PRIMARY KEY,
  task_detail_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date DATE NULL,
  assignee_user_id TEXT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_user_id) REFERENCES users(id)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  task_detail_id TEXT NOT NULL,
  parent_comment_id TEXT NULL,
  author_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_detail_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NULL,
  file_size INTEGER NULL,
  uploaded_by_user_id TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  task_detail_id TEXT NOT NULL,
  remind_at DATETIME NOT NULL,
  notify_desktop INTEGER NOT NULL DEFAULT 1 CHECK (notify_desktop IN (0, 1)),
  notify_email INTEGER NOT NULL DEFAULT 0 CHECK (notify_email IN (0, 1)),
  notify_mobile INTEGER NOT NULL DEFAULT 0 CHECK (notify_mobile IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_detail_id) REFERENCES task_details(id) ON DELETE CASCADE
);

CREATE INDEX idx_nav_nodes_parent_order
  ON nav_nodes(parent_id, order_index);

CREATE INDEX idx_nav_nodes_owner_user
  ON nav_nodes(owner_user_id);

CREATE UNIQUE INDEX idx_task_details_nav_node
  ON task_details(nav_node_id);

CREATE INDEX idx_task_details_assignee
  ON task_details(assignee_user_id);

CREATE INDEX idx_sub_tasks_task_order
  ON sub_tasks(task_detail_id, order_index);

CREATE INDEX idx_sub_tasks_assignee
  ON sub_tasks(assignee_user_id);

CREATE INDEX idx_comments_task_parent_created
  ON comments(task_detail_id, parent_comment_id, created_at);

CREATE INDEX idx_comments_author
  ON comments(author_user_id);

CREATE INDEX idx_attachments_task
  ON attachments(task_detail_id);

CREATE INDEX idx_reminders_task
  ON reminders(task_detail_id);

CREATE INDEX idx_reminders_remind_status
  ON reminders(remind_at, status);
