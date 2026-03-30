import { Outlet } from 'react-router-dom'
import './MockDrillShell.css'

export function MockDrillShell() {
  return (
    <div className="mock-drill-shell">
      <Outlet />
    </div>
  )
}
