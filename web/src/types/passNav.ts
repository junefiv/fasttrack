export type PassNavTargetGoalRow = { id: string; user_id: string; university_name: string; department_name: string; priority: number; created_at: string; updated_at: string }
export type UniversityBenchmarkRow = { id: string; university_name: string; department_name: string; created_at: string }
export type BenchmarkMasteryRow = { id: string; benchmark_id: string; subject_id: string; category_label: string; target_accuracy: number; target_solve_time: number }
export type BenchmarkLectureRow = { id: string; benchmark_id: string; lecture_id: string; completion_rate: number | null; total_watch_time_sec: number | null; total_learning_days: number | null; consecutive_learning_days: number | null; focus_score: number | null; total_lecture_duration_sec: number | null }
export type BenchmarkMockRow = { id: string; benchmark_id: string; catalog_id: string; target_avg_accuracy: number; target_avg_solve_time: number; category_detail_benchmarks: Record<string, unknown> | null }
export type BenchmarkOfficialRow = { id: string; benchmark_id: string; subject_id: string; exam_name: string; target_total_score: number; target_correct_rate: number }
export type UserMasteryRow = { id: string; user_id: string; subject_id: string; category_label: string; avg_accuracy: number | null; avg_solve_time: number | null; last_updated_at: string | null }
export type UserLectureRow = { id: string; user_id: string; lecture_id: string; completion_rate: number | null; total_watch_time_sec: number | null; total_learning_days: number | null; consecutive_learning_days: number | null; last_watched_at: string | null; focus_score: number | null; total_lecture_duration_sec: number | null }
export type UserMockExamStatRow = { id: string; user_id: string; catalog_id: string; private_avg_solve_time_per_prob: number | null; private_avg_accuracy: number | null; category_detail_stats: Record<string, unknown> | null }
export type UserOfficialExamStatRow = { id: string; user_id: string; subject_id: string; exam_name: string; total_score: number | null; correct_count: number | null; total_questions: number | null; updated_at: string | null }
export type LectureMetaRow = { id: string; title: string; subject_id: string }
export type SubjectMetaRow = { id: string; name: string; category: string | null }
export type RecentAttemptRow = { source: 'bank' | 'catalog'; submitted_at: string; is_correct: boolean; category_label: string | null; subject_id: string | null; question_id: string; ebook_page_id: string | null; lecture_caption_id: string | null }
export type PassNavTraffic = 'green' | 'yellow' | 'red'
export type CategoryMasteryCompare = { subject_id: string; subject_name: string; category_label: string; userAccuracy: number | null; userSolveTime: number | null; benchAccuracy: number | null; benchSolveTime: number | null; gapAccuracy: number | null; gapTime: number | null; traffic: PassNavTraffic }
/** 과목 단위: 풀이·수강률·정답률·연속학습일(일). 연속학습일은 강의 consecutive_learning_days를 subject별 평균. */
export type PassNavSubjectMetricRow = {
  subjectId: string
  subjectName: string
  benchSec: number | null
  userSec: number | null
  benchCompletionPct: number | null
  userCompletionPct: number | null
  benchAccuracyPct: number | null
  userAccuracyPct: number | null
  benchConsecutiveDays: number | null
  userConsecutiveDays: number | null
}
/** category_label 기준 복습 딥링크(자막·교재·문제은행) — Pass-Nav 경보 스레드용 */
export type PassNavCategoryRemedy = {
  category_label: string
  videoHref: string | null
  ebookHref: string | null
  /** null이면 「관련 문제」 링크 비표시 (예: alerts.related_question_id 없음) */
  drillHref: string | null
  videoHint: string | null
  ebookHint: string | null
  drillHint: string | null
}

/** public.alerts — Pass-Nav 알림 센터용 */
export type PassNavDbAlertRow = {
  id: string
  user_id: string
  benchmark_id: string | null
  alert_code: string | null
  title: string
  body: string
  subject_id: string | null
  category_label: string | null
  related_lecture_id: string | null
  related_ebook_page_id: string | null
  related_question_id: string | null
  benchmark_snapshot: Record<string, unknown>
  user_snapshot: Record<string, unknown>
  resolution_rule: Record<string, unknown>
  resolved: boolean
  resolved_at: string | null
  resolution_evaluated_at: string | null
  created_at: string
  updated_at: string
}

export type PassNavBundle = {
  goals: PassNavTargetGoalRow[]
  primaryGoal: PassNavTargetGoalRow | null
  benchmarkId: string | null
  benchmarkRow: UniversityBenchmarkRow | null
  benchMastery: BenchmarkMasteryRow[]
  benchLecture: BenchmarkLectureRow[]
  benchMock: BenchmarkMockRow[]
  benchOfficial: BenchmarkOfficialRow[]
  userMastery: UserMasteryRow[]
  userLecture: UserLectureRow[]
  userMock: UserMockExamStatRow[]
  userOfficial: UserOfficialExamStatRow[]
  lectures: LectureMetaRow[]
  subjects: SubjectMetaRow[]
  catalogs: { id: string; title: string; subject_id: string }[]
  recentAttempts: RecentAttemptRow[]
  bankQuestionsForWeakTags: { question_id: string; subject_id: string | null; category_label: string | null; tags: string[] | null }[]
  /** getWeakestCategoryForPrescription 결과 */
  weakCategoryLabel: string | null
  /** 유형별 lecture_captions / ebook_pages / questions_bank 기반 제안 */
  categoryRemedies: Record<string, PassNavCategoryRemedy>
  /** 최근 제출 행(카탈로그 자막·교재 / 은행 문항) 우선 링크 */
  recentAttemptRemedy: PassNavCategoryRemedy | null
  /** 취약 처방 큐 첫 문항 → 문제은행 딥링크 */
  prescriptionRemedy: PassNavCategoryRemedy | null
}

/** 합격군(benchmark_lecture_stats)은 높은데 나(user_lecture_stats)는 낮은 강좌 — 처방 큐 Gemini 입력용 */
export type PassNavLectureGapItem = {
  lectureId: string
  lectureTitle: string
  subjectLabel: string
  benchCompletionPct: number
  userCompletionPct: number
}
