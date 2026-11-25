import { LandingPage } from '@/features/landing/LandingPage';
import { WorkspacePage } from '@/features/workspace/WorkspacePage';
import { useApp } from './store';

export function App() {
  const ready = useApp((state) => state.status === 'ready' && state.record !== undefined);
  return ready ? <WorkspacePage /> : <LandingPage />;
}
