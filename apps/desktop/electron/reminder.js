const listElement = document.querySelector('#reminder-list')
const summaryElement = document.querySelector('#summary')
const hideWindowButton = document.querySelector('#hide-window')

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName)
  element.className = className
  element.textContent = text
  return element
}

async function runAction(card, action) {
  const controls = card.querySelectorAll('button, select')
  controls.forEach((control) => {
    control.disabled = true
  })

  try {
    await action()
  } catch (error) {
    console.error('Reminder action failed:', error)
    controls.forEach((control) => {
      control.disabled = false
    })
  }
}

function createReminderCard(reminder) {
  const card = document.createElement('article')
  card.className = 'reminder-card'
  card.append(
    createTextElement('div', 'reminder-time', '알림 ' + reminder.remindAt),
    createTextElement('h2', 'reminder-title', reminder.title),
    createTextElement(
      'p',
      'reminder-description',
      reminder.description || 'Task 설명이 없습니다.',
    ),
  )

  const meta = document.createElement('div')
  meta.className = 'reminder-meta'
  meta.append(
    createTextElement('span', '', '기한 ' + (reminder.dueDate || '미설정')),
    createTextElement('span', '', '담당자 ' + (reminder.assignee || '미지정')),
  )
  card.append(meta)

  const actions = document.createElement('div')
  actions.className = 'reminder-actions'

  const openButton = createTextElement('button', 'primary', 'Task 열기')
  openButton.type = 'button'
  openButton.addEventListener('click', () =>
    runAction(card, () => window.api.reminder.openTask(reminder.taskId)),
  )

  const snoozeSelect = document.createElement('select')
  ;[
    [5, '5분 후'],
    [10, '10분 후'],
    [30, '30분 후'],
    [60, '1시간 후'],
  ].forEach(([minutes, label]) => {
    const option = document.createElement('option')
    option.value = String(minutes)
    option.textContent = label
    snoozeSelect.append(option)
  })

  const snoozeButton = createTextElement('button', '', '다시 알림')
  snoozeButton.type = 'button'
  snoozeButton.addEventListener('click', () =>
    runAction(card, () =>
      window.api.reminder.snooze(
        reminder.id,
        Number(snoozeSelect.value),
      ),
    ),
  )

  const completeButton = createTextElement('button', 'complete', '완료 처리')
  completeButton.type = 'button'
  completeButton.addEventListener('click', () =>
    runAction(card, () =>
      window.api.reminder.complete(reminder.id, reminder.taskId),
    ),
  )

  const dismissButton = createTextElement('button', '', '알림 해제')
  dismissButton.type = 'button'
  dismissButton.addEventListener('click', () =>
    runAction(card, () => window.api.reminder.dismiss(reminder.id)),
  )

  actions.append(
    openButton,
    snoozeSelect,
    snoozeButton,
    completeButton,
    dismissButton,
  )
  card.append(actions)
  return card
}

function render(items) {
  listElement.replaceChildren()
  summaryElement.textContent =
    items.length > 0
      ? '처리할 알림 ' + items.length + '개'
      : '현재 처리할 알림이 없습니다.'

  if (items.length === 0) {
    listElement.append(
      createTextElement('div', 'empty-state', '예정된 알림이 여기에 표시됩니다.'),
    )
    return
  }

  items.forEach((reminder) => {
    listElement.append(createReminderCard(reminder))
  })
}

hideWindowButton.addEventListener('click', () => {
  window.api.reminder.hideWindow()
})

window.api.reminder.onItems(render)
window.api.reminder.getItems().then(render)
