import { useState } from 'react';
import { useApp } from '@/app/store';
import { cx } from '@/lib/browser';
import { DevView } from '../dev/DevView';
import { VisualMap } from '../graph/VisualMap';
import { ImageView } from '../imaging/ImageView';
import { SimpleReport } from '../report/SimpleReport';
import { SummaryView } from '../summary/SummaryView';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { t } from '@/i18n';

export function WorkspacePage() {
  const tab = useApp((state) => state.tab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full flex-col" data-testid="workspace">
      <TopBar onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label={t('side.label')}
          className={cx(
            'no-print z-20 w-64 shrink-0 border-e border-line bg-surface lg:static lg:block',
            sidebarOpen ? 'absolute inset-y-0 start-0 shadow-xl' : 'hidden',
          )}
        >
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </aside>
        <main id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="relative min-w-0 flex-1 overflow-y-auto">
          {tab === 'images' && <ImageView />}
          {tab === 'summary' && <SummaryView />}
          {tab === 'report' && <SimpleReport />}
          {tab === 'map' && <VisualMap />}
          {tab === 'dev' && <DevView />}
        </main>
      </div>
    </div>
  );
}
