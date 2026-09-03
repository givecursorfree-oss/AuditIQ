import { KeyboardShortcutsPanel } from '@/components/layout/KeyboardShortcutsPanel';
import { PanelCard } from '@/components/layout/PanelCard';

export default function SettingsShortcutsTab() {
  return (
    <PanelCard title="Keyboard shortcuts">
      <KeyboardShortcutsPanel />
    </PanelCard>
  );
}
