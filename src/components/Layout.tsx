import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type NavItem={to:string;label:string}
type NavGroup={label:string;items:NavItem[]}

const adminGroups:NavGroup[]=[
  {label:'Overview',items:[{to:'/dashboard',label:'Main Dashboard'}]},
  {label:'Snack Operations',items:[{to:'/snack',label:'Snack Overview'},{to:'/members',label:'Members'},{to:'/menu',label:'Food Menu'},{to:'/wallet',label:'Advance Wallet'},{to:'/orders',label:'Daily Orders'},{to:'/expenses',label:'Expenses'},{to:'/reports',label:'Reports'}]},
  {label:'Personal Finance',items:[{to:'/personal-finance',label:'Finance Overview'},{to:'/personal-finance/manage',label:'Finance Manager'}]},
  {label:'System',items:[{to:'/settings',label:'Settings'}]},
]
const userGroups:NavGroup[]=[
  {label:'Snack Operations',items:[{to:'/orders',label:'Orders'},{to:'/wallet',label:'Wallet'},{to:'/expenses',label:'Expenses'},{to:'/reports',label:'Reports'}]},
  {label:'Personal Finance',items:[{to:'/personal-finance',label:'Finance Overview'},{to:'/personal-finance/manage',label:'Finance Manager'}]},
]

export function Layout(){
 const{profile,user,signOut}=useAuth();const location=useLocation();const[mobileOpen,setMobileOpen]=useState(false);const isAdmin=profile?.role==='admin';const groups=isAdmin?adminGroups:userGroups
 useEffect(()=>setMobileOpen(false),[location.pathname])
 const handleSignOut=async()=>{setMobileOpen(false);await signOut()}
 return <div className="shell"><aside className={`sidebar${mobileOpen?' mobile-open':''}`}><div className="sidebar-top"><div className="brand"><span>SF</span><div><b>SnackFlow</b><small>Micro ERP</small></div></div><button type="button" className="mobile-menu-button" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={()=>setMobileOpen(x=>!x)}><span aria-hidden="true">{mobileOpen?'✕':'☰'}</span>{mobileOpen?'Close':'Menu'}</button></div><div className="sidebar-panel" id="mobile-navigation"><nav className="sector-nav">{groups.map(group=><section className="nav-sector" key={group.label}><small>{group.label}</small>{group.items.map(item=><NavLink key={item.to} to={item.to} end>{item.label}</NavLink>)}</section>)}</nav><div className="sidebar-user"><div className="user-copy"><small>{isAdmin?'admin':'user'}</small><span>{profile?.full_name||user?.email}</span></div><button type="button" className="ghost signout" onClick={handleSignOut}>Sign out</button></div></div></aside><main className="main"><Outlet/></main></div>
}
