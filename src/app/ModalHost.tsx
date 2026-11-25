import { PrintModal } from '@/features/print/PrintModal';
import { PrivacyModal } from '@/features/privacy/PrivacyModal';
import { ScrubberModal } from '@/features/scrubber/ScrubberModal';
import { useApp } from './store';

/** Renders whichever of the three modals is open. */
export function ModalHost() {
  const modal = useApp((state) => state.modal);
  const hasRecord = useApp((state) => state.record !== undefined);
  const openModal = useApp((state) => state.openModal);
  const close = () => openModal(undefined);

  if (modal === 'privacy') return <PrivacyModal onClose={close} />;
  if (modal === 'scrubber' && hasRecord) return <ScrubberModal onClose={close} />;
  if (modal === 'print' && hasRecord) return <PrintModal onClose={close} />;
  return null;
}
