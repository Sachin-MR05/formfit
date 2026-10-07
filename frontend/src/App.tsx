import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { CoachPage } from '@/pages/CoachPage';
import { ComingSoon } from '@/pages/ComingSoon';
import { DesignSystem } from '@/pages/DesignSystem';
import { HistoryPage } from '@/pages/HistoryPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/coach" replace />} />
        {/* key forces a remount so switching Live <-> Review always stops the previous source */}
        <Route path="coach" element={<CoachPage key="live" mode="live" />} />
        <Route path="review" element={<CoachPage key="review" mode="review" />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="design" element={<DesignSystem />} />
        <Route path="dashboard" element={<ComingSoon title="Dashboard" note="Weekly trends, streaks and your best reps arrive in Phase 5." />} />
        <Route path="profile" element={<ComingSoon title="My body profile" note="Your ratios, personal targets and recalibration history arrive in Phase 5. Your current ratios are already shown on Live Coach." />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<ComingSoon title="Page not found" note="That page does not exist." />} />
      </Route>
    </Routes>
  );
}
