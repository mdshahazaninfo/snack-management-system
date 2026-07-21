import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const items = [
  ['/', 'Dashboard'], ['/members', 'Members'], ['/wallet', 'Wallet'], ['/menu', 'Menu'], ['/orders', 'Orders'], ['/expenses', 'Expenses'], ['/reports', 'Reports'], ['/settings', 'Settings'],
]

export function Layout() {
  const { profile, user, signOut } = useAuth()
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div></div>
      <nav>{items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
      <div className="sidebar-user"><small>{profile?.role || 'pending'}</small><span>{profile?.full_name || user?.email}</span><button className="ghost" onClick={() => signOut()}>Sign out</button></div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>
}
