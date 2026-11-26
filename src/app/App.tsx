import { LandingPage } from '@/features/landing/LandingPage';
import { PrivacyToast } from '@/features/privacy/PrivacyToast';
import { WorkspacePage } from '@/features/workspace/WorkspacePage';
import { ModalHost } from './ModalHost';
import { useApp } from './store';

export function App() {
  const ready = useApp((state) => state.status === 'ready' && state.record !== undefined);
  return (
    <>
      {ready ? <WorkspacePage /> : <LandingPage />}
      <ModalHost />
      {/* The note belongs to the first visit; it must not cover a patient's report. */}
      {!ready && <PrivacyToast />}
    </>
  );
}
