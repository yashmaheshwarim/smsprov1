import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";

import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import TeachersPage from "./pages/TeachersPage";
import AttendancePage from "./pages/AttendancePage";
import FeesPage from "./pages/FeesPage";
import MaterialsPage from "./pages/MaterialsPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ImportPage from "./pages/ImportPage";
import SettingsPage from "./pages/SettingsPage";
import TimetablePage from "./pages/TimetablePage";
import IntegrationsPage from "./pages/IntegrationsPage";
import PdfUploadPage from "./pages/PdfUploadPage";
import ManageTeachersPage from "./pages/ManageTeachersPage";
import LeaveManagementPage from "./pages/LeaveManagementPage";
import CameraCapturePage from "./pages/CameraCapturePage";
import AdmissionPage from "./pages/AdmissionPage";
import MessageWalletPage from "./pages/MessageWalletPage";
import GRNManagementPage from "./pages/GRNManagementPage";
import BatchManagementPage from "./pages/BatchManagementPage";
import MarksPage from "./pages/MarksPage";
import TeacherMarksPage from "./pages/TeacherMarksPage";

import LoginPage from "./pages/LoginPage";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import TeacherAttendancePage from "./pages/TeacherAttendancePage";
import StudentDashboard from "./pages/StudentDashboard";
import ParentDashboard from "./pages/ParentDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Routes><Route path="*" element={<LoginPage />} /></Routes>;
  }

  if (user?.role === "super_admin") {
    return <Routes><Route path="/" element={<SuperAdminDashboard />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
  }

  if (user?.role === "student") {
    return <Routes><Route path="/" element={<StudentDashboard />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
  }

  if (user?.role === "parent") {
    return <Routes><Route path="/" element={<ParentDashboard />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
  }

  if (user?.role === "teacher") {
    return (
      <Routes>
        <Route element={<TeacherLayout />}>
          <Route path="/teacher/attendance" element={<TeacherAttendancePage />} />
          <Route path="/teacher/students" element={<StudentsPage />} />
          <Route path="/teacher/materials" element={<MaterialsPage />} />
          <Route path="/teacher/assignments" element={<AssignmentsPage />} />
          <Route path="/teacher/marks" element={<TeacherMarksPage />} />
          <Route path="/teacher/messages" element={<MessageWalletPage />} />
          <Route path="/teacher/analytics" element={<AnalyticsPage />} />
          <Route path="/teacher/timetable" element={<TimetablePage />} />
          <Route path="/teacher/leaves" element={<LeaveManagementPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/teacher/attendance" replace />} />
        <Route path="*" element={<Navigate to="/teacher/attendance" replace />} />
      </Routes>
    );
  }

  // Admin routes
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/teachers" element={<ManageTeachersPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/fees" element={<FeesPage />} />
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/assignments" element={<AssignmentsPage />} />
        <Route path="/messages" element={<MessageWalletPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/timetable" element={<TimetablePage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/documents" element={<PdfUploadPage />} />
        <Route path="/leaves" element={<LeaveManagementPage />} />
        <Route path="/camera" element={<CameraCapturePage />} />
        <Route path="/admissions" element={<AdmissionPage />} />
        <Route path="/grn" element={<GRNManagementPage />} />
        <Route path="/batches" element={<BatchManagementPage />} />
        <Route path="/marks" element={<MarksPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
