import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { DashboardCockpit } from './pages/DashboardCockpit'
import { MenuPlaceholder } from './pages/MenuPlaceholder'
import { VideoSessionPage } from './pages/videos/VideoSessionPage'
import { VideosBrowsePage } from './pages/videos/VideosBrowsePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardCockpit />} />
          <Route path="videos" element={<VideosBrowsePage />} />
          <Route path="videos/watch/:sessionId" element={<VideoSessionPage />} />
          <Route
            path="ebook"
            element={
              <MenuPlaceholder
                title="이북 보기"
                description="전자책 뷰어 및 목록은 준비 중입니다."
              />
            }
          />
          <Route
            path="qna"
            element={
              <MenuPlaceholder
                title="질문하기"
                description="Q&amp;A 게시판은 준비 중입니다."
              />
            }
          />
          <Route
            path="my"
            element={
              <MenuPlaceholder
                title="마이 메뉴"
                description="프로필·설정·학습 기록은 준비 중입니다."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
