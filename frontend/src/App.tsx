import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AccountPage } from '@/pages/AccountPage';
import { CoachPage } from '@/pages/CoachPage';
import { ComingSoon } from '@/pages/ComingSoon';
import { DashboardPage } from '@/pages/DashboardPage';
import { DesignSystem } from '@/pages/DesignSystem';
import { HistoryPage } from '@/pages/HistoryPage';
import { PersonalizePage } from '@/pages/PersonalizePage';
import { SessionDetailPage } from '@/pages/SessionDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        {/* key forces a remount so switching Live <-> Review always stops the previous source */}
        <Route path="coach" element={<CoachPage key="live" mode="live" />} />
        <Route path="review" element={<CoachPage key="review" mode="review" />} />
        <Route path="personalize" element={<PersonalizePage />} />
        <Route path="onboarding" element={<PersonalizePage />} />
        <Route path="profile" element={<PersonalizePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:id" element={<SessionDetailPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="design" element={<DesignSystem />} />
        <Route path="*" element={<ComingSoon title="Page not found" note="That page does not exist." />} />
      </Route>
    </Routes>
  );
}
