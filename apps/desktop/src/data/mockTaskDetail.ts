export const mockNavigationTree = [
  {
    id: 'folder-root-1',
    type: 'folder',
    title: '최상위 폴더',
    level: 0,
    expanded: true,
  },
  {
    id: 'folder-middle-1',
    type: 'folder',
    title: '중간폴더 1',
    level: 1,
    expanded: true,
  },
  {
    id: 'folder-middle-2',
    type: 'folder',
    title: '중간폴더 2',
    level: 2,
    expanded: true,
  },
  {
    id: 'task-1',
    type: 'task',
    title: '명명식 준비 체크리스트',
    level: 3,
    selected: true,
  },
  {
    id: 'task-2',
    type: 'task',
    title: '참석자 준비 체크리스트',
    level: 3,
    selected: false,
  },
]

export const mockTaskDetailsById = {
  'task-1': {
    id: 'task-1',
    path: '명명식 준비 > 2026 > 일본 > Oshima > 명명식 준비 체크리스트',
    title: '명명식 준비 체크리스트',
    description: '명명식 준비를 위한 전체 작업 및 진행상황 관리',
    dueDate: '2026-08-10',
    alarm: '2026-08-09 09:00',
    assignee: 'JH Jae-Ryong Ha',
    attachments: [
      {
        id: 'attachment-1',
        name: 'naming-ceremony-plan.xlsx',
      },
      {
        id: 'attachment-2',
        name: 'participants_draft.docx',
      },
    ],
    subTasks: [
      {
        id: 'subtask-1',
        title: '일정 협의 with 조선소',
        dueDate: '2026-08-05',
        assignee: 'JH',
        completed: false,
      },
      {
        id: 'subtask-2',
        title: '대모 수배',
        dueDate: '2026-08-07',
        assignee: 'JH',
        completed: false,
      },
      {
        id: 'subtask-3',
        title: '윤곽본서 확인',
        dueDate: '2026-08-09',
        assignee: 'JH',
        completed: true,
      },
    ],
    memo:
      '조선소 일정 확인 후 내부 행사 일정과 맞추기. 대모 참석 여부와 이동 일정도 함께 정리 필요.',
    comments: [
      {
        id: 'comment-1',
        author: 'JH',
        createdAt: '2026-08-01 09:20',
        content: '조선소 쪽 회신 받으면 바로 일정 반영하겠습니다.',
      },
      {
        id: 'comment-2',
        author: 'PS',
        createdAt: '2026-08-01 11:05',
        content: '참석자 명단은 오늘 오후에 업데이트하겠습니다.',
      },
    ],
  },
  'task-2': {
    id: 'task-2',
    path: '명명식 준비 > 2026 > 일본 > Oshima > 참석자 준비 체크리스트',
    title: '참석자 준비 체크리스트',
    description: '참석자 확정, 안내 및 이동 준비를 위한 관리 화면',
    dueDate: '2026-08-15',
    alarm: '2026-08-13 14:00',
    assignee: 'PS Park Staff',
    attachments: [
      {
        id: 'attachment-3',
        name: 'guest-list-draft.xlsx',
      },
    ],
    subTasks: [
      {
        id: 'subtask-4',
        title: '참석자 후보 명단 정리',
        dueDate: '2026-08-08',
        assignee: 'PS',
        completed: true,
      },
      {
        id: 'subtask-5',
        title: '초청 메일 발송',
        dueDate: '2026-08-11',
        assignee: 'PS',
        completed: false,
      },
      {
        id: 'subtask-6',
        title: '이동 일정 취합',
        dueDate: '2026-08-14',
        assignee: 'JH',
        completed: false,
      },
    ],
    memo:
      '참석자 확정 이후 이동 계획과 숙박 여부를 함께 정리해야 함. VIP 참석 여부는 별도 확인 필요.',
    comments: [
      {
        id: 'comment-3',
        author: 'PS',
        createdAt: '2026-08-02 10:00',
        content: '초청 대상자 1차 목록을 정리했습니다.',
      },
      {
        id: 'comment-4',
        author: 'JH',
        createdAt: '2026-08-02 13:40',
        content: 'VIP 대상자는 별도 시트로 분리해 주세요.',
      },
    ],
  },
}
