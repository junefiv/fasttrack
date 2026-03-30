import { Link } from 'react-router-dom'
import './DashboardCockpit.css'

export function DashboardCockpit() {
  return (
    <div className="cockpit">
      <header className="cockpit__header">
        <p className="cockpit__section-label">2.1</p>
        <h1 className="cockpit__title">메인 대시보드</h1>
        <p className="cockpit__subtitle">The Cockpit — 실시간 학습·합격 경로 모니터링</p>
      </header>

      <div className="cockpit__grid">
        <article className="cockpit-card cockpit-card--drill-rec">
          <div className="cockpit-card__eyebrow">
            <span className="cockpit-card__dot cockpit-card__dot--ok" aria-hidden />
            오늘 추천 드릴
          </div>
          <p className="cockpit-card__body">
            취약 유형을 바로 보완하는 <strong className="cockpit-card__highlight">상위·하위 드릴</strong>을
            시작하세요. 모의고사 결과와 통계가 연동됩니다.
          </p>
          <Link to="/study/mock-exam" className="cockpit-card__cta">
            모의고사 &amp; 드릴 열기
          </Link>
        </article>

        <article className="cockpit-card cockpit-card--brief">
          <div className="cockpit-card__eyebrow">
            <span className="cockpit-card__dot cockpit-card__dot--ok" aria-hidden />
            실시간 위치 브리핑
          </div>
          <p className="cockpit-card__body">
            목표 대학(서울대 경영) 합격권 대비{' '}
            <strong className="cockpit-card__highlight">수학 88%</strong> 도달. 현재 경로 유지 시{' '}
            <strong className="cockpit-card__highlight">합격 확률 72%</strong>.
          </p>
        </article>

        <article className="cockpit-card cockpit-card--fomo">
          <div className="cockpit-card__eyebrow">
            <span className="cockpit-card__dot cockpit-card__dot--warn" aria-hidden />
            FOMO 위젯
          </div>
          <p className="cockpit-card__body">
            나와 성적이 비슷했던 합격자 <strong className="cockpit-card__highlight">84%</strong>는
            지금 이 시점에 <strong className="cockpit-card__highlight">‘현우진의 뉴런’ 8강</strong>을
            수강 중입니다.
          </p>
          <p className="cockpit-card__meta">데이터 기반 긴장감 · 벤치마크 동기화</p>
        </article>

        <article className="cockpit-card cockpit-card--churn">
          <div className="cockpit-card__eyebrow">
            <span className="cockpit-card__dot cockpit-card__dot--alert" aria-hidden />
            이탈 경고 알림
          </div>
          <p className="cockpit-card__body">
            최근 3일간 학습량이 합격자 평균 대비{' '}
            <strong className="cockpit-card__highlight">20% 하락</strong>했습니다. 경로 재탐색이
            필요합니다.
          </p>
        </article>
      </div>
    </div>
  )
}
