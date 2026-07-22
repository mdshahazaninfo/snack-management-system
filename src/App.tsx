import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { SnackOverviewPage } from './pages/SnackOverviewPage'
import { FinanceOverviewPage } from './pages/FinanceOverviewPage'
import { MembersPage } from './pages/MembersPage'
import { WalletPage } from './pages/WalletPage'
import { MenuPage } from './pages/MenuPage'
import { OrdersPage } from './pages/OrdersPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PersonalFinancePage } from './pages/PersonalFinancePage'

function SetupRequired(){return <div className="setup"><div className="auth-card"><h1>Configuration required</h1><p>Add the following GitHub Actions secrets, then re-run the Pages workflow:</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code><p>Run the Supabase migrations in order.</p></div></div>}
function Protected(){const{session,profile,loading}=useAuth();if(loading)return <div className="loading">Loading SnackFlow…</div>;if(!session)return <Navigate to="/login" replace/>;if(profile?.status!=='active')return <div className="setup"><div className="auth-card"><h1>Account pending</h1><p>Your account is not active. Ask an Admin to approve the same email address.</p></div></div>;return <Layout/>}
function AdminOnly(){const{profile}=useAuth();return profile?.role==='admin'?<Outlet/>:<Navigate to="/orders" replace/>}
function HomeRedirect(){const{profile}=useAuth();return <Navigate to={profile?.role==='admin'?'/dashboard':'/orders'} replace/>}

function AppRoutes(){const{session}=useAuth();return <Routes>
  <Route path="/login" element={session?<Navigate to="/" replace/>:<AuthPage/>}/>
  <Route element={<Protected/>}>
    <Route index element={<HomeRedirect/>}/>
    <Route path="orders" element={<OrdersPage/>}/>
    <Route path="wallet" element={<WalletPage/>}/>
    <Route path="expenses" element={<ExpensesPage/>}/>
    <Route path="reports" element={<ReportsPage/>}/>
    <Route path="personal-finance" element={<FinanceOverviewPage/>}/>
    <Route path="personal-finance/manage" element={<PersonalFinancePage/>}/>
    <Route element={<AdminOnly/>}>
      <Route path="dashboard" element={<DashboardPage/>}/>
      <Route path="snack" element={<SnackOverviewPage/>}/>
      <Route path="members" element={<MembersPage/>}/>
      <Route path="menu" element={<MenuPage/>}/>
      <Route path="settings" element={<SettingsPage/>}/>
    </Route>
  </Route>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes>}

export default function App(){if(!isSupabaseConfigured)return <SetupRequired/>;return <HashRouter><AuthProvider><AppRoutes/></AuthProvider></HashRouter>}
