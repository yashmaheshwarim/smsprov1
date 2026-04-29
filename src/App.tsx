import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { SuperAdminLayout } from "@/components/layout/SuperAdminLayout";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { ParentLayout } from "@/components/layout/ParentLayout";

import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import TeachersPage from "./pages/TeachersPage";
import AttendancePage from "./pages/AttendancePage";
import AttendanceReportPage from "./pages/AttendanceReportPage";
import TimetablePage from "./pages/TimetablePage";
import BatchFeePage from "./pages/BatchFeePage";
import StudentFeePage from "./pages/StudentFeePage";
import MaterialsPage from "./pages/MaterialsPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ImportPage from "./pages/ImportPage";
import SettingsPage from "./pages/SettingsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import PdfUploadPage from "./pages/PdfUploadPage";
import ManageTeachersPage from "./pages/ManageTeachersPage";
import LeaveManagementPage from "./pages/LeaveManagementPage";
import CameraCapturePage from "./pages/CameraCapturePage";
import AdmissionPage from "./pages/AdmissionPage";
import EnrollmentPage from "./pages/EnrollmentPage";
import MessageWalletPage from "./pages/MessageWalletPage";
import GRNManagementPage from "./pages/GRNManagementPage";
import BatchManagementPage from "./pages/BatchManagementPage";
import MarksPage from "./pages/MarksPage";
import TeacherMarksPage from "./pages/TeacherMarksPage";

import LoginPage from "./pages/LoginPage";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminAnalyticsPage from "./pages/SuperAdminAnalyticsPage";
import SuperAdminRevenuePage from "./pages/SuperAdminRevenuePage";
import ManageMembersPage from "./pages/ManageMembersPage";
import TeacherAttendancePage from "./pages/TeacherAttendancePage";
import StudentDashboard from "./pages/StudentDashboard";
import StudentAttendancePage from "./pages/StudentAttendancePage";
import StudentFeesPage from "./pages/StudentFeesPage";
import StudentMarksPage from "./pages/StudentMarksPage";
import StudentMessagesPage from "./pages/StudentMessagesPage";
import ParentDashboard from "./pages/ParentDashboard";
import ParentAttendancePage from "./pages/ParentAttendancePage";
import ParentFeesPage from "./pages/ParentFeesPage";
import ParentMarksPage from "./pages/ParentMarksPage";
import NotFound from "./pages/NotFound";
import CalendarPage from "./pages/CalendarPage";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Routes><Route path="*" element={<LoginPage />} /></Routes>;
  }

  if (user?.role === "super_admin") {
    return (
      <Routes>
        <Route element={<SuperAdminLayout />}>
          <Route path="/" element={<SuperAdminDashboard />} />
          <Route path="/analytics" element={<SuperAdminAnalyticsPage />} />
          <Route path="/revenue" element={<SuperAdminRevenuePage />} />
          <Route path="/members" element={<ManageMembersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (user?.role === "student") {
    return (
      <Routes>
        <Route element={<StudentLayout />}>
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/attendance" element={<StudentAttendancePage />} />
          <Route path="/student/fees" element={<StudentFeesPage />} />
          <Route path="/student/marks" element={<StudentMarksPage />} />
          <Route path="/student/materials" element={<MaterialsPage />} />
          <Route path="/student/assignments" element={<AssignmentsPage />} />
          <Route path="/student/messages" element={<StudentMessagesPage />} />
          <Route path="/student/calendar" element={<CalendarPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/student/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/student/dashboard" replace />} />
      </Routes>
    );
  }

  if (user?.role === "parent") {
    return (
      <Routes>
        <Route element={<ParentLayout />}>
          <Route path="/parent/dashboard" element={<ParentDashboard />} />
          <Route path="/parent/attendance" element={<ParentAttendancePage />} />
          <Route path="/parent/fees" element={<ParentFeesPage />} />
          <Route path="/parent/marks" element={<ParentMarksPage />} />
          <Route path="/parent/messages" element={<StudentMessagesPage />} />
          <Route path="/parent/calendar" element={<CalendarPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/parent/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/parent/dashboard" replace />} />
      </Routes>
    );
  }

  if (user?.role === "teacher") {
    return (
      <Routes>
        <Route element={<TeacherLayout />}>
          <Route path="/teacher/attendance" element={<TeacherAttendancePage />} />
          <Route path="/teacher/attendance-report" element={<AttendanceReportPage />} />
          <Route path="/teacher/students" element={<StudentsPage />} />
          <Route path="/teacher/materials" element={<MaterialsPage />} />
          <Route path="/teacher/assignments" element={<AssignmentsPage />} />
          <Route path="/teacher/marks" element={<TeacherMarksPage />} />
          <Route path="/teacher/messages" element={<MessageWalletPage />} />
          <Route path="/teacher/analytics" element={<AnalyticsPage />} />
          <Route path="/teacher/timetable" element={<TimetablePage />} />
          <Route path="/teacher/leaves" element={<LeaveManagementPage />} />
          <Route path="/teacher/calendar" element={<CalendarPage />} />
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
        <Route path="/attendance-report" element={<AttendanceReportPage />} />
        <Route path="/fees" element={<Navigate to="/fees/batch" replace />} />
        <Route path="/fees/batch" element={<BatchFeePage />} />
        <Route path="/fees/student" element={<StudentFeePage />} />
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
        <Route path="/enrollment" element={<EnrollmentPage />} />
        <Route path="/grn" element={<GRNManagementPage />} />
        <Route path="/batches" element={<BatchManagementPage />} />
        <Route path="/marks" element={<MarksPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
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
  </ErrorBoundary>
);

export default App;
