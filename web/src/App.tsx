import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { EbookResourceUploadPage } from './pages/ebook/EbookResourceUploadPage'
import { DashboardCockpit } from './pages/DashboardCockpit'
import { MenuPlaceholder } from './pages/MenuPlaceholder'
import { DrillTakePage } from './pages/mock-exam/DrillTakePage'
import { MockDrillHomePage } from './pages/mock-exam/MockDrillHomePage'
import { MockDrillShell } from './pages/mock-exam/MockDrillShell'
import { MockExamPreviewResultPage } from './pages/mock-exam/MockExamPreviewResultPage'
import { MockExamResultPage } from './pages/mock-exam/MockExamResultPage'
import { MockExamTakePage } from './pages/mock-exam/MockExamTakePage'
import { QuestionBankPage } from './pages/mock-exam/QuestionBankPage'
import { QuestionsBankDrillPage } from './pages/mock-exam/QuestionsBankDrillPage'
import { VideoSessionPage } from './pages/videos/VideoSessionPage'
import { VideosBrowsePage } from './pages/videos/VideosBrowsePage'
import { CurriculumCoachPage } from './pages/d-agent/CurriculumCoachPage'
import { LearningCoachChatPage } from './pages/d-agent/LearningCoachChatPage'

const ebookUploadEnabled = import.meta.env.VITE_ENABLE_EBOOK_UPLOAD === 'true'

const routerBasename =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

function LegacyVideoWatchRedirect() {
  const { sessionId } = useParams()
  if (!sessionId) return <Navigate to="/study/videos" replace />
  return <Navigate to={`/study/videos/watch/${sessionId}`} replace />
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardCockpit />} />

          <Route path="study/videos" element={<VideosBrowsePage />} />
          <Route path="study/videos/watch/:sessionId" element={<VideoSessionPage />} />
          <Route path="study/mock-exam" element={<MockDrillShell />}>
            <Route index element={<MockDrillHomePage />} />
            <Route path="bank" element={<QuestionBankPage />} />
            <Route path="preview/:catalogId" element={<MockExamTakePage />} />
            <Route path="preview/:catalogId/result" element={<MockExamPreviewResultPage />} />
            <Route path="mock/:examId" element={<MockExamTakePage />} />
            <Route path="mock/:examId/result/:resultId" element={<MockExamResultPage />} />
            <Route path="drill" element={<DrillTakePage />} />
            <Route path="questions-bank" element={<QuestionsBankDrillPage />} />
          </Route>
          <Route path="study/question-bank" element={<Navigate to="/study/mock-exam/bank" replace />} />
          <Route
            path="study/archive"
            element={
              <MenuPlaceholder
                title="아카이브"
                description="학습 아카이브는 준비 중입니다."
              />
            }
          />

          <Route path="d-agent/mh-chat" element={<LearningCoachChatPage />} />
          <Route path="d-agent/learning-coach" element={<CurriculumCoachPage />} />
          <Route
            path="d-agent/admission-coach"
            element={
              <MenuPlaceholder
                title="MY 입시코치"
                description="입시 코칭 기능은 준비 중입니다."
              />
            }
          />

          <Route path="videos" element={<Navigate to="/study/videos" replace />} />
          <Route path="videos/watch/:sessionId" element={<LegacyVideoWatchRedirect />} />

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
            path="ebook/upload"
            element={
              ebookUploadEnabled ? (
                <EbookResourceUploadPage />
              ) : (
                <Navigate to="/ebook" replace />
              )
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
