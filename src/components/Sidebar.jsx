import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { navItems } from '../config/navigation'

function Sidebar({ open, onNavigate }) {
  return (
    <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>
      <div className="brand">
        <span className="brand-mark">B</span>
        <span className="brand-name">Bathu</span>
      </div>
      <nav className="nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `nav-link${isActive ? ' nav-link--active' : ''}`
            }
            onClick={onNavigate}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
