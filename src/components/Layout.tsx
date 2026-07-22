import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const adminItems = [
  ['/', 'Dashboard'],
  ['/members', 'Members'],
  ['/wallet', 'Wallet'],
  ['/menu', 'Menu'],
  ['/orders', 'Orders'],
  ['/expenses', 'Expenses'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
]

const userItems = [
  ['/orders', 'Orders'],
  ['/wallet', 'Wallet'],
  ['/expenses', 'Expenses'],
  ['/reports', 'Reports'],
]

export function Layout() {
  const { profile, user, signOut } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const items = isAdmin ? adminItems : userItems

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleSignOut = async () => {
    setMobileOpen(false)
    await signOut()
  }

  return <div className="shell">
    <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand"><span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div></div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen(open => !open)}
        >
          <span aria-hidden="true">{mobileOpen ? '✕' : '☰'}</span>
          {mobileOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      <div className="sidebar-panel" id="mobile-navigation">
        <nav>{items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <div className="sidebar-user">
          <div className="user-copy"><small>{isAdmin ? 'admin' : 'user'}</small><span>{profile?.full_name || user?.email}</span></div>
          <button type="button" className="ghost signout" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>
}
