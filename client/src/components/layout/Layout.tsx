import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import FloatingChatButton from '../FloatingChatButton';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 ml-0 lg:ml-60 transition-[margin] duration-300">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <FloatingChatButton />
    </div>
  );
}
