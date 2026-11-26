import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import { GuestOnly, RequireAuth } from "./auth/RequireAuth.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ProtectedLayout from "./pages/ProtectedLayout.jsx";
import TeamsPage from "./pages/TeamsPage.jsx";
import CreateTaskPage from "./pages/CreateTaskPage.jsx";
import ApprovalsPage from "./pages/ApprovalsPage.jsx";
import AnnouncementsPage from "./pages/AnnouncementsPage.jsx";
import { NotFoundPage } from "./pages/ReactPagePlaceholder.jsx";

function LoginRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/dashboard" replace /> : <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginRoute />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/team" element={<TeamsPage />} />
          <Route path="/create-task" element={<CreateTaskPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
