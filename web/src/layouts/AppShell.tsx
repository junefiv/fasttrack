import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { SidebarAccordionSection } from './SidebarAccordionSection'
import './AppShell.css'

export function AppShell() {
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const closeMobileNav = () => setMobileNavOpen(false)

  return (
    <div className={`app-shell${mobileNavOpen ? ' app-shell--nav-open' : ''}`}>
      <div
        className="app-shell__scrim"
        aria-hidden={!mobileNavOpen}
        onClick={closeMobileNav}
      />

      <aside
        id="learning-sidebar"
        className="app-shell__sidebar"
        aria-label="학습 네비게이터"
      >
        <div className="app-shell__sidebar-head">
          <NavLink to="/" className="app-shell__brand" end onClick={closeMobileNav}>
            <span className="app-shell__brand-mark" aria-hidden />
            <span className="app-shell__brand-text">FASTTRACK</span>
          </NavLink>
          <p className="app-shell__sidebar-caption">학습 네비게이터</p>
        </div>

        <nav className="app-shell__side-nav" aria-label="주요 메뉴">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `app-shell__side-link app-shell__side-link--top${isActive ? ' app-shell__side-link--active' : ''}`
            }
            onClick={closeMobileNav}
          >
            <span className="app-shell__side-icon" aria-hidden />
            메인 대시보드
          </NavLink>

          <SidebarAccordionSection
            title="인강 보기"
            pathPrefix="/videos"
            currentPath={pathname}
          >
            <NavLink
              to="/videos"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              강의 목록
            </NavLink>
            <span className="app-shell__side-link app-shell__side-link--muted">이어서 보기 · 준비 중</span>
          </SidebarAccordionSection>

          <SidebarAccordionSection title="이북 보기" pathPrefix="/ebook" currentPath={pathname}>
            <NavLink
              to="/ebook"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              서재
            </NavLink>
            <span className="app-shell__side-link app-shell__side-link--muted">북마크 · 준비 중</span>
          </SidebarAccordionSection>

          <SidebarAccordionSection title="질문하기" pathPrefix="/qna" currentPath={pathname}>
            <NavLink
              to="/qna"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              Q&amp;A 게시판
            </NavLink>
            <span className="app-shell__side-link app-shell__side-link--muted">내 질문 · 준비 중</span>
          </SidebarAccordionSection>

          <SidebarAccordionSection title="마이 메뉴" pathPrefix="/my" currentPath={pathname}>
            <NavLink
              to="/my"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              프로필 · 설정
            </NavLink>
          </SidebarAccordionSection>
        </nav>
      </aside>

      <div className="app-shell__body">
        <header className="app-shell__top">
          <button
            type="button"
            className="app-shell__menu-btn"
            aria-expanded={mobileNavOpen}
            aria-controls="learning-sidebar"
            aria-label={mobileNavOpen ? '메뉴 닫기' : '메뉴 열기'}
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            <span className="app-shell__menu-icon" aria-hidden />
          </button>
        </header>
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
