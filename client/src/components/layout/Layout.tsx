import { Outlet } from 'react-router-dom';
import AppSidebar from './Sidebar';
import Header from './Header';
import GlobalChatShell from '../GlobalChatShell';
import GlobalDynamicIsland from '../GlobalDynamicIsland';
import { SkipToContent } from './SkipToContent';
import { GlobalChatProvider } from '../../context/GlobalChatContext';
import { PresenceProvider } from '../../context/PresenceContext';
import { ActivityTrackingProvider } from '../../context/ActivityTrackingContext';
import { LayoutChromeProvider } from '../../context/LayoutChromeContext';
import { NavBadgesProvider } from '../../context/NavBadgesContext';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';
import { PageShell } from './PageShell';
import { LayoutSessionBootstrap } from './LayoutSessionBootstrap';
import ProductTourHost from '../onboarding/ProductTourHost';

export default function Layout() {
  const defaultOpen = (() => {
    const match = document.cookie.match(/sidebar:state=(\w+)/);
    return match ? match[1] === 'true' : true;
  })();

  return (
    <GlobalChatProvider>
      <PresenceProvider>
        <ActivityTrackingProvider>
        <NavBadgesProvider>
        <LayoutChromeProvider>
          <SidebarProvider defaultOpen={defaultOpen} className="bg-background">
            <SkipToContent />
            <AppSidebar />
            <SidebarInset className="!bg-background min-h-svh min-w-0 w-full">
              <div className="flex h-svh min-w-0 flex-col overflow-hidden lg:p-2 w-full">
                <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-background lg:border lg:border-border lg:rounded-md">
                  <Header />
                  <GlobalDynamicIsland />
                  <main id="main-content" className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden scroll-mt-4">
                    <PageShell>
                      <Outlet />
                    </PageShell>
                  </main>
                  <LayoutSessionBootstrap />
                </div>
              </div>
            </SidebarInset>
            <GlobalChatShell />
            <ProductTourHost />
          </SidebarProvider>
        </LayoutChromeProvider>
        </NavBadgesProvider>
        </ActivityTrackingProvider>
      </PresenceProvider>
    </GlobalChatProvider>
  );
}
