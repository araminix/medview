import { Fragment } from 'react';
import { LandingPage } from '@/features/landing/LandingPage';
import { PrivacyToast } from '@/features/privacy/PrivacyToast';
import { WorkspacePage } from '@/features/workspace/WorkspacePage';
import { ModalHost } from './ModalHost';
import { useApp } from './store';

export function App() {
  const ready = useApp((state) => state.status === 'ready' && state.record !== undefined);
  const lang = useApp((state) => state.lang);
  // Keyed by language: switching re-mounts the tree, so every `t()` call is evaluated afresh.
  return (
    <Fragment key={lang}>
      {ready ? <WorkspacePage /> : <LandingPage />}
      <ModalHost />
      {/* The note belongs to the first visit; it must not cover a patient's report. */}
      {!ready && <PrivacyToast />}
    </Fragment>
  );
}
