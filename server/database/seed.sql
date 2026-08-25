INSERT INTO users (
  id, login_id, name, email, phone, password_hash, role, is_active
) VALUES
  (
    'user-admin',
    'admin',
    'Administrator',
    'admin@todo.local',
    '',
    'pbkdf2:210000:00112233445566778899aabbccddeeff:86353a8c977447bd17662e5db8921bd35a07c657169f985df9e883f93efc2c79b5d767d1dc7fb3dded6339e8d545d11eca71f78809a111ad11acdac79044fdf5',
    'admin',
    1
  ),
  (
    'user-jh',
    'jh',
    'JH',
    'jh@example.com',
    '',
    'pbkdf2:210000:ffeeddccbbaa99887766554433221100:06d3ed73208a70b6dbc227f4c4b30e75b46656cae278b9988749b61a5fd26530e559c23ad78a577eb8549aa39511f24769136402e0715e5e2a406e56087c45f2',
    'user',
    1
  ),
  (
    'user-ps',
    'ps',
    'PS',
    'ps@example.com',
    '',
    'pbkdf2:210000:ffeeddccbbaa99887766554433221100:06d3ed73208a70b6dbc227f4c4b30e75b46656cae278b9988749b61a5fd26530e559c23ad78a577eb8549aa39511f24769136402e0715e5e2a406e56087c45f2',
    'user',
    1
  );

INSERT INTO nav_nodes (
  id, parent_id, node_type, title, order_index, is_expanded, owner_user_id
) VALUES
  ('folder-root-1', NULL, 'folder', '최상위 폴더', 1, 1, 'user-jh'),
  ('folder-middle-1', 'folder-root-1', 'folder', '중간폴더 1', 1, 1, 'user-jh'),
  ('folder-middle-2', 'folder-middle-1', 'folder', '중간폴더 2', 1, 1, 'user-jh'),
  ('task-1', 'folder-middle-2', 'task', '명명식 준비 체크리스트', 1, 1, 'user-jh'),
  ('task-2', 'folder-middle-2', 'task', '참석자 준비 체크리스트', 2, 1, 'user-jh');

INSERT INTO task_details (
  id, nav_node_id, description, due_date, alarm_at, assignee_user_id, memo_content
) VALUES
  (
    'task-detail-1',
    'task-1',
    '명명식 준비를 위한 전체 작업 및 진행상황 관리',
    '2026-08-10',
    '2026-08-09 09:00:00',
    'user-jh',
    '조선소 일정 확인 후 내부 행사 일정과 맞추기. 대모 참석 여부와 이동 일정도 함께 정리 필요.'
  ),
  (
    'task-detail-2',
    'task-2',
    '참석자 확정, 안내 및 이동 준비를 위한 관리 화면',
    '2026-08-15',
    '2026-08-13 14:00:00',
    'user-ps',
    '참석자 확정 이후 이동 계획과 숙박 여부를 함께 정리해야 함. VIP 참석 여부는 별도 확인 필요.'
  );

INSERT INTO task_assignees (task_detail_id, user_id, order_index)
VALUES
  ('task-detail-1', 'user-jh', 0),
  ('task-detail-2', 'user-ps', 0);

INSERT INTO sub_tasks (
  id, task_detail_id, title, due_date, assignee_user_id, completed, order_index
) VALUES
  ('subtask-1', 'task-detail-1', '일정 협의 with 조선소', '2026-08-05', 'user-jh', 0, 1),
  ('subtask-2', 'task-detail-1', '대모 수배', '2026-08-07', 'user-jh', 0, 2),
  ('subtask-3', 'task-detail-1', '윤곽본서 확인', '2026-08-09', 'user-jh', 1, 3),

  ('subtask-4', 'task-detail-2', '참석자 후보 명단 정리', '2026-08-08', 'user-ps', 1, 1),
  ('subtask-5', 'task-detail-2', '초청 메일 발송', '2026-08-11', 'user-ps', 0, 2),
  ('subtask-6', 'task-detail-2', '이동 일정 취합', '2026-08-14', 'user-jh', 0, 3);

INSERT INTO comments (
  id, task_detail_id, parent_comment_id, author_user_id, content, is_deleted
) VALUES
  ('comment-1', 'task-detail-1', NULL, 'user-jh', '조선소 쪽 회신 받으면 바로 일정 반영하겠습니다.', 0),
  ('comment-2', 'task-detail-1', 'comment-1', 'user-ps', '회신 받으면 참석자 안내 일정도 맞추겠습니다.', 0),
  ('comment-3', 'task-detail-1', NULL, 'user-ps', '참석자 명단은 오늘 오후에 업데이트하겠습니다.', 0),

  ('comment-4', 'task-detail-2', NULL, 'user-ps', '초청 대상자 1차 목록을 정리했습니다.', 0),
  ('comment-5', 'task-detail-2', 'comment-4', 'user-jh', 'VIP 대상자는 별도 시트로 분리 부탁드립니다.', 0),
  ('comment-6', 'task-detail-2', NULL, 'user-jh', 'VIP 대상자는 별도 시트로 분리해 주세요.', 0);

INSERT INTO reminders (
  id, task_detail_id, remind_at, notify_desktop, notify_email, notify_mobile, status
) VALUES
  ('reminder-1', 'task-detail-1', '2026-08-09 09:00:00', 1, 0, 0, 'pending'),
  ('reminder-2', 'task-detail-2', '2026-08-13 14:00:00', 1, 0, 0, 'pending');
