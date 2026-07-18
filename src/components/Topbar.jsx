import { useLocation } from 'react-router-dom'
import Icon from './Icon'
import { navItems } from '../config/navigation'

function Topbar({ onMenuClick }) {
  const { pathname } = useLocation()
  const current = navItems.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  )

  return (
    <header className="topbar">
      <button
        type="button"
        className="menu-toggle"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Icon name="menu" />
      </button>
      <h1 className="page-title">{current?.label ?? 'Bathu Content Parser'}</h1>
    </header>
  )
}

export default Topbar
