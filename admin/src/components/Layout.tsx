import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../api/client';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900'}`;

export default function Layout() {
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-white">Cloud Index Admin</p>
            <p className="text-xs text-slate-400">Divi Ajax Filter billing & Typesense</p>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Overview
            </NavLink>
            <NavLink to="/customers" className={navClass}>
              Customers
            </NavLink>
            <NavLink to="/typesense" className={navClass}>
              Typesense
            </NavLink>
            <NavLink to="/earnings" className={navClass}>
              Earnings
            </NavLink>
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
