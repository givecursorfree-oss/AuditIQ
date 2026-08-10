import { memo, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { DynamicIsland } from '@/components/ui/dynamic-island';
import { useDynamicIslandData } from '@/hooks/useDynamicIslandData';

function GlobalDynamicIslandInner() {
  const { user } = useAuth();
  const island = useDynamicIslandData();

  useEffect(() => {
    const root = document.documentElement;
    if (user && island.visible) {
      root.classList.add('has-top-island');
    } else {
      root.classList.remove('has-top-island');
    }
    return () => root.classList.remove('has-top-island');
  }, [user, island.visible]);

  if (!user || !island.visible) return null;

  return (
    <output
      className="pointer-events-none fixed left-1/2 top-[2.85rem] z-[60] flex w-full max-w-[100vw] -translate-x-1/2 justify-center px-2 sm:top-[3rem] list-none"
      aria-live="polite"
    >
      <DynamicIsland
        view={island.view}
        visible={island.visible}
        timer={island.timer}
        notification={island.notification}
        todo={island.todo}
      />
    </output>
  );
}

/** Top-center Dynamic Island (iPhone-style) — timer, tasks, live alerts */
export default memo(GlobalDynamicIslandInner);
