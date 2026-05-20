import { Outlet } from 'react-router-dom';
import AppSidebar from './Sidebar';
import Header from './Header';
import FloatingChatButton from '../FloatingChatButton';
import GlobalChatShell from '../GlobalChatShell';
import { GlobalChatProvider } from '../../context/GlobalChatContext';
import { PresenceProvider } from '../../context/PresenceContext';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';

export default function Layout() {
  const defaultOpen = (() => {
    const match = document.cookie.match(/sidebar:state=(\w+)/);
    return match ? match[1] === 'true' : true;
  })();

  return (
    <GlobalChatProvider>
      <PresenceProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset className="has-chat-island">
          <Header />
          <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-20">
            <Outlet />
          </div>
        </SidebarInset>
        <FloatingChatButton />
        <GlobalChatShell />
      </SidebarProvider>
      </PresenceProvider>
    </GlobalChatProvider>
  );
}
