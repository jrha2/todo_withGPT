import NavigationBar from '../features/navigation-bar/components/NavigationBar'
import SubTaskSection from '../features/sub-task/components/SubTaskSection'
import TaskHeader from '../features/task/components/TaskHeader'
import MemoSection from '../features/memo/components/MemoSection'

function MainLayout() {
  return (
    <div className="app-shell">
      <NavigationBar />

      <main className="detail-screen">
        <TaskHeader />
        <SubTaskSection />
        <MemoSection />
      </main>
    </div>
  )
}

export default MainLayout
