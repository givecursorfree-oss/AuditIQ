import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useClientPortal } from './ClientPortalContext';

export function ClientPortalNotificationsTab() {
  const { preferences, setPreferences, prefsSaving, savePreferences } = useClientPortal();

  return (
    <div className="mt-4">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
          <CardDescription>Choose what you want to be notified about</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preferences && (
            <>
              {(
                [
                  { key: 'notifyStageChanges' as const, label: 'Engagement stage changes' },
                  { key: 'notifyDocumentRequests' as const, label: 'New document requests' },
                  { key: 'notifyInvoices' as const, label: 'New invoices and payment reminders' },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-4 text-sm">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(e) => setPreferences((p) => (p ? { ...p, [key]: e.target.checked } : p))}
                  />
                </label>
              ))}
              <Button disabled={prefsSaving} onClick={() => void savePreferences()}>
                {prefsSaving ? 'Saving…' : 'Save preferences'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
