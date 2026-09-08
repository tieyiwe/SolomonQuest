import { lazy, Suspense } from "react";
import { Switch, Route, useParams, useLocation } from "wouter";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import NotFound from "@/pages/not-found";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const OnboardingSetup = lazy(() => import("@/pages/onboarding/OnboardingSetup"));
const OnboardingJoin = lazy(() => import("@/pages/onboarding/OnboardingJoin"));
const SchoolPublicPage = lazy(() => import("@/pages/school/SchoolPublicPage"));
const SchoolApply = lazy(() => import("@/pages/school/SchoolApply"));

const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminCourses = lazy(() => import("@/pages/admin/AdminCourses"));
const AdminPrograms = lazy(() => import("@/pages/admin/AdminPrograms"));
const AdminAdmissions = lazy(() => import("@/pages/admin/AdminAdmissions"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminResources = lazy(() => import("@/pages/admin/AdminResources"));
const AdminReminders = lazy(() => import("@/pages/admin/AdminReminders"));
const AdminSchoolBranding = lazy(() => import("@/pages/admin/AdminSchoolBranding"));

const TeacherOverview = lazy(() => import("@/pages/teacher/TeacherOverview"));
const TeacherCourseDetail = lazy(() => import("@/pages/teacher/TeacherCourseDetail"));
const TeacherAssignments = lazy(() => import("@/pages/teacher/TeacherAssignments"));
const TeacherGradebook = lazy(() => import("@/pages/teacher/TeacherGradebook"));
const TeacherQuizBuilder = lazy(() => import("@/pages/teacher/TeacherQuizBuilder"));
const TeacherAnalytics = lazy(() => import("@/pages/teacher/TeacherAnalytics"));
const TeacherAttendance = lazy(() => import("@/pages/teacher/TeacherAttendance"));
const TeacherReminders = lazy(() => import("@/pages/teacher/TeacherReminders"));
const CalendarPage = lazy(() => import("@/pages/calendar/CalendarPage"));
const TeacherResources = lazy(() => import("@/pages/teacher/TeacherResources"));

const StudentOverview = lazy(() => import("@/pages/student/StudentOverview"));
const StudentCourseDetail = lazy(() => import("@/pages/student/StudentCourseDetail"));
const StudentAssignments = lazy(() => import("@/pages/student/StudentAssignments"));
const StudentQuizTake = lazy(() => import("@/pages/student/StudentQuizTake"));
const StudentTranscript = lazy(() => import("@/pages/student/StudentTranscript"));
const TranscriptVerifyPage = lazy(() => import("@/pages/transcripts/TranscriptVerifyPage"));
const StudentProfilePage = lazy(() => import("@/pages/dashboard/StudentProfilePage"));
const MyProfilePage = lazy(() => import("@/pages/profile/MyProfilePage"));

const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
const ForumPage = lazy(() => import("@/pages/forum/ForumPage"));
const ForumTopicPage = lazy(() => import("@/pages/forum/ForumTopicPage"));
const NotificationPreferences = lazy(() => import("@/pages/settings/NotificationPreferences"));
const NotificationsPage = lazy(() => import("@/pages/notifications/NotificationsPage"));
const MessagesPage = lazy(() => import("@/pages/messages/MessagesPage"));
const SuperAdminDashboard = lazy(() => import("@/pages/super-admin/SuperAdminDashboard"));
const AdminDangerZone = lazy(() => import("@/pages/admin/AdminDangerZone"));
const AcceptInvitePage = lazy(() => import("@/pages/auth/AcceptInvitePage"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));


function StudentVideoSession() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
      <h1 className="text-2xl font-bold mb-4">Live Video Session</h1>
      <p className="text-muted-foreground mb-6">Course ID: {courseId}</p>
      <div className="w-full max-w-4xl aspect-video bg-muted rounded-xl flex items-center justify-center border">
        <iframe
          src={`https://meet.jit.si/solomonquest-course-${courseId}`}
          allow="camera; microphone; fullscreen; display-capture"
          className="w-full h-full rounded-xl"
          title="Video Session"
        />
      </div>
    </div>
  );
}

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

export function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth/login" component={Login} />
        <Route path="/auth/register" component={Register} />
        <Route path="/auth/reset-password"><ResetPassword /></Route>

        <Route path="/onboarding/setup">
          <ProtectedRoute><OnboardingSetup /></ProtectedRoute>
        </Route>
        <Route path="/onboarding/join" component={OnboardingJoin} />

        <Route path="/schools/:slug" component={SchoolPublicPage} />
        <Route path="/schools/:slug/apply" component={SchoolApply} />

        {/* Admin Routes */}
        <Route path="/dashboard/admin">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminOverview /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/users">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminUsers /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/courses">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminCourses /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/programs">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminPrograms /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/admissions">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminAdmissions /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/resources">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminResources /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/analytics">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminAnalytics /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/reminders">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminReminders /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/settings">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminSettings /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/branding">
          <ProtectedRoute allowedRoles={["admin", "super_admin"]}><AdminSchoolBranding /></ProtectedRoute>
        </Route>

        {/* Teacher Routes */}
        <Route path="/dashboard/teacher">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherOverview /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/courses/:id">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherCourseDetail /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/courses/:id/assignments">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/gradebook">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherGradebook /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/assignments">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/quiz-builder">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherQuizBuilder /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/analytics">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAnalytics /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/attendance">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherAttendance /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/reminders">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherReminders /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/teacher/resources">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherResources /></ProtectedRoute>
        </Route>

        {/* Student Routes */}
        <Route path="/dashboard/student">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentOverview /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/courses/:id">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentCourseDetail /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/assignments">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/quiz/:id">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentQuizTake /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/quizzes">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentAssignments /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/quizzes/:id">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentQuizTake /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/student/transcript">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentTranscript /></ProtectedRoute>
        </Route>

        {/* Teacher Quiz Route */}
        <Route path="/dashboard/teacher/quizzes">
          <ProtectedRoute allowedRoles={["teacher"]}><TeacherQuizBuilder /></ProtectedRoute>
        </Route>

        {/* Chat & Forum Routes */}
        <Route path="/chat">
          <ProtectedRoute><ChatPage /></ProtectedRoute>
        </Route>
        <Route path="/forum">
          <ProtectedRoute><ForumPage /></ProtectedRoute>
        </Route>
        <Route path="/forum/topics/:id">
          <ProtectedRoute><ForumTopicPage /></ProtectedRoute>
        </Route>

        {/* Invite Accept Route */}
        <Route path="/invite/:token" component={AcceptInvitePage} />

        {/* Student Video Route */}
        <Route path="/dashboard/student/courses/:id/video">
          <ProtectedRoute allowedRoles={["student", "staff", "teacher", "admin", "super_admin"]}>
            <StudentVideoSession />
          </ProtectedRoute>
        </Route>

        {/* Messages Route */}
        <Route path="/messages">
          <ProtectedRoute><MessagesPage /></ProtectedRoute>
        </Route>

        {/* Calendar Route — assignment due dates, live sessions, reminders in one feed */}
        <Route path="/calendar">
          <ProtectedRoute><CalendarPage /></ProtectedRoute>
        </Route>

        {/* Super Admin Routes */}
        <Route path="/super_admin">
          <ProtectedRoute allowedRoles={["super_admin"]}><SuperAdminDashboard /></ProtectedRoute>
        </Route>
        <Route path="/dashboard/admin/danger-zone">
          <ProtectedRoute allowedRoles={["admin","super_admin"]}><AdminDangerZone /></ProtectedRoute>
        </Route>

        {/* Settings Routes */}
        <Route path="/settings/notifications">
          <ProtectedRoute><NotificationPreferences /></ProtectedRoute>
        </Route>
        <Route path="/notifications">
          <ProtectedRoute><NotificationsPage /></ProtectedRoute>
        </Route>

        {/* Student Profile Route */}
        <Route path="/dashboard/student/profile">
          <ProtectedRoute allowedRoles={["student", "staff"]}><StudentProfilePage /></ProtectedRoute>
        </Route>

        {/* My Profile — shared editable profile page for every role */}
        <Route path="/profile">
          <ProtectedRoute><MyProfilePage /></ProtectedRoute>
        </Route>

        {/* Public Transcript Verification Route */}
        <Route path="/transcript" component={TranscriptVerifyPage} />

        {/* Help Center */}
        <Route path="/help">
          <ProtectedRoute><HelpPage /></ProtectedRoute>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
