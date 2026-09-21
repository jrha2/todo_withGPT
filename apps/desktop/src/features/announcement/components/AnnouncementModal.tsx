import { useState } from 'react'
import {
  markAnnouncementSeen,
  type Announcement,
} from '../../../services/api/authApi'

type AnnouncementModalProps = {
  announcement: Announcement
  onClose: () => void
}

// Server-managed announcement popup (title + body). Shows a "다시 보지 않기"
// option; when checked and closed, the announcement id is recorded locally so
// it will not reappear until the admin changes the announcement id.
function AnnouncementModal({ announcement, onClose }: AnnouncementModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handleClose = async () => {
    if (dontShowAgain) {
      try {
        await markAnnouncementSeen(announcement.id)
      } catch (error) {
        console.error('Failed to mark announcement as seen:', error)
      }
    }
    onClose()
  }

  return (
    <div className="modal-backdrop announcement-backdrop">
      <div className="announcement-modal" role="dialog" aria-modal="true">
        <div className="announcement-modal-header">
          <span>공지사항</span>
          <h2>{announcement.title || '공지'}</h2>
        </div>
        <div className="announcement-modal-body">
          {announcement.body
            ? announcement.body.split('\n').map((line, index) => (
                <p key={index}>{line || '\u00A0'}</p>
              ))
            : null}
        </div>
        <div className="announcement-modal-footer">
          <label className="announcement-dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
            />
            <span>다시 보지 않기</span>
          </label>
          <button type="button" onClick={() => void handleClose()}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default AnnouncementModal
