import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { SidebarAccordionSection } from './SidebarAccordionSection'
import './AppShell.css'

export function AppShell() {
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const closeMobileNav = () => setMobileNavOpen(false)

  const focusExamTake = /\/study\/mock-exam\/mock\/[^/]+$/.test(pathname)
  const focusDrillTake = pathname === '/study/mock-exam/drill'
  const focusQuestionsBankDrill = pathname.startsWith('/study/mock-exam/questions-bank')
  const focusUserQaDrill = pathname.startsWith('/study/archive/my-questions/drill')
  const focusMode = focusExamTake || focusDrillTake || focusQuestionsBankDrill || focusUserQaDrill

  return (
    <div
      className={`app-shell${mobileNavOpen ? ' app-shell--nav-open' : ''}${focusMode ? ' app-shell--focus' : ''}`}
    >
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
          <p className="app-shell__sidebar-caption">Study room · D-Agent</p>
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
            HOME
          </NavLink>

          <SidebarAccordionSection title="STUDY ROOM" pathPrefix="/study" currentPath={pathname}>
            <NavLink
              to="/study/videos"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              인강/교재 학습
            </NavLink>
            <NavLink
              to="/study/mock-exam"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              모의고사 &amp; 드릴
            </NavLink>

            <NavLink
              to="/study/archive"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              학습 아카이브
            </NavLink>
          </SidebarAccordionSection>

          <SidebarAccordionSection title="D-AGENT" pathPrefix="/d-agent" currentPath={pathname}>
            <NavLink
              to="/d-agent/mh-chat"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              학습코치
            </NavLink>
            <NavLink
              to="/d-agent/learning-coach"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              네비게이터
            </NavLink>
            <NavLink
              to="/d-agent/admission-coach"
              className={({ isActive }) =>
                `app-shell__side-link${isActive ? ' app-shell__side-link--active' : ''}`
              }
              onClick={closeMobileNav}
            >
              입시코치
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
