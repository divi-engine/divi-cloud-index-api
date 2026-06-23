import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ApiError, me } from './api/client';
import Layout from './components/Layout';
import CustomerDetailPage from './pages/CustomerDetail';
import CustomersPage from './pages/Customers';
import EarningsPage from './pages/Earnings';
import LoginPage from './pages/Login';
import OverviewPage from './pages/Overview';
import TypesensePage from './pages/Typesense';

function Protected({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    me()
      .then(() => setState('ok'))
      .catch((err: ApiError) => {
        setState(err.status === 503 ? 'denied' : 'denied');
      });
  }, []);

  if (state === 'loading') {
    return <p className="text-slate-400 p-8">Checking session…</p>;
  }
  if (state === 'denied') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:siteUid" element={<CustomerDetailPage />} />
        <Route path="typesense" element={<TypesensePage />} />
        <Route path="earnings" element={<EarningsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
