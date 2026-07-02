import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ShareImageProvider } from './context/ShareImageContext';
import Layout from './components/Layout';
import Login, { ProtectedRoute } from './pages/Login';
import Home from './pages/Home';
import AddBooking from './pages/AddBooking';
import Bookings from './pages/Bookings';
import EditBooking from './pages/EditBooking';
import Report from './pages/Report';
import BulkList from './pages/BulkList';
import AddBulk from './pages/AddBulk';
import BulkDetail from './pages/BulkDetail';
import Summary from './pages/Summary';
import OwnerApp from './pages/OwnerApp';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/owner" element={<OwnerApp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/add" element={<AddBooking />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/edit/:type/:id" element={<EditBooking />} />
              <Route path="/report" element={<Report />} />
              <Route path="/bulk" element={<BulkList />} />
              <Route path="/bulk/add" element={<AddBulk />} />
              <Route path="/bulk/:id" element={<BulkDetail />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ShareImageProvider>
        <AppRoutes />
      </ShareImageProvider>
    </AuthProvider>
  );
}
