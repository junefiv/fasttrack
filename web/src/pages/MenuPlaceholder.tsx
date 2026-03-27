import { Link } from 'react-router-dom'
import './MenuPlaceholder.css'

type Props = {
  title: string
  description: string
}

export function MenuPlaceholder({ title, description }: Props) {
  return (
    <div className="menu-placeholder">
      <h1 className="menu-placeholder__title">{title}</h1>
      <p className="menu-placeholder__desc">{description}</p>
      <Link to="/" className="menu-placeholder__back">
        대시보드로 돌아가기
      </Link>
    </div>
  )
}
