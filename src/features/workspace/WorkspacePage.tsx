import { useState } from 'react';
import { useApp } from '@/app/store';
import { cx } from '@/lib/browser';
import { DevView } from '../dev/DevView';
import { VisualMap } from '../graph/VisualMap';
import { SimpleReport } from '../report/SimpleReport';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function WorkspacePage() {
  const tab = useApp((state) => state.tab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full flex-col" data-testid="workspace">
      <TopBar onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Patient summary"
          className={cx(
            'no-print z-20 w-64 shrink-0 border-r border-line bg-surface lg:static lg:block',
            sidebarOpen ? 'absolute inset-y-0 left-0 shadow-xl' : 'hidden',
          )}
        >
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </aside>
        <main id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0 flex-1 overflow-y-auto">
          {tab === 'report' && <SimpleReport />}
          {tab === 'map' && <VisualMap />}
          {tab === 'dev' && <DevView />}
        </main>
      </div>
    </div>
  );
}
