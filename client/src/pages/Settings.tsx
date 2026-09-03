import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Shield,
  Buildings as Building2,
  Key as KeyRound,
  ClockCounterClockwise as History,
  EnvelopeSimple as Mail,
  Keyboard,
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppPageContainer } from '../components/layout/AppPageContainer';
import PageHeader from '../components/layout/PageHeader';
import TwoFactorSettings from '../components/settings/TwoFactorSettings';
import SettingsUsersTab from './settings/SettingsUsersTab';
import SettingsRolesTab from './settings/SettingsRolesTab';
import SettingsFirmTab from './settings/SettingsFirmTab';
import SettingsCommsLogTab from './settings/SettingsCommsLogTab';
import SettingsAuditLogTab from './settings/SettingsAuditLogTab';
import SettingsShortcutsTab from './settings/SettingsShortcutsTab';

type Tab_ = 'users' | 'roles' | 'firm' | 'security' | 'comms' | 'audit-log' | 'shortcuts';

const SETTINGS_TABS: { id: Tab_; label: string; icon: React.ElementType }[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield },
  { id: 'firm', label: 'Firm Settings', icon: Building2 },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'comms', label: 'Comms Log', icon: Mail },
  { id: 'audit-log', label: 'Audit Log', icon: History },
];

export default function Settings() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  if (currentUser && !['Partner', 'Admin', 'Manager'].includes(currentUser.role)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-foreground-muted mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Restricted</h2>
          <p className="text-foreground-muted">You don&apos;t have permission to access settings.</p>
        </div>
      </div>
    );
  }

  const visibleTabs = currentUser?.role === 'Manager'
    ? SETTINGS_TABS.filter((t) => t.id === 'users' || t.id === 'shortcuts')
    : SETTINGS_TABS;

  const requestedTab = searchParams.get('tab') as Tab_ | null;
  const activeTab =
    requestedTab && visibleTabs.some((t) => t.id === requestedTab)
      ? requestedTab
      : 'users';

  return (
    <AppPageContainer>
      <PageHeader
        title="Settings"
        description="Manage users, roles, permissions, and firm configuration"
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setSearchParams(v === 'users' ? {} : { tab: v }, { replace: true })}
        className="space-y-6"
      >
        <TabsList className="w-full sm:w-fit flex-wrap h-auto">
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2">
              <t.icon size={16} />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="users"><SettingsUsersTab /></TabsContent>
        <TabsContent value="roles"><SettingsRolesTab /></TabsContent>
        <TabsContent value="firm"><SettingsFirmTab /></TabsContent>
        <TabsContent value="security"><TwoFactorSettings /></TabsContent>
        <TabsContent value="shortcuts"><SettingsShortcutsTab /></TabsContent>
        <TabsContent value="comms"><SettingsCommsLogTab /></TabsContent>
        <TabsContent value="audit-log"><SettingsAuditLogTab /></TabsContent>
      </Tabs>
    </AppPageContainer>
  );
}
