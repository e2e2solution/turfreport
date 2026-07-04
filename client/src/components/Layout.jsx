import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLogo from './AppLogo';
const links = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/add', label: 'Add', icon: '➕' },
  { to: '/bookings', label: 'Records', icon: '📋' },
  { to: '/summary', label: 'Summary', icon: '📈' },
  { to: '/report', label: 'Report', icon: '📊' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <div className="header-brand">
            <AppLogo className="app-logo-header" />
            <h1>Vathiyayath Sports Hub</h1>
          </div>
          <button type="button" className="btn-logout" onClick={logout} title="Logout">
            Logout
          </button>
        </div>
        {user && <p className="header-user">Hi, {user.username}</p>}
      </header>
      <main className="main">{children}</main>
      <nav className="bottom-nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">{l.icon}</span>
            <span className="nav-label">{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
