import { NavLink, Outlet } from 'react-router-dom'
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