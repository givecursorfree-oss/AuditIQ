import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { TabsTrigger } from '@/components/ui/tabs-trigger';
import { TabsContent } from '@/components/ui/tabs-content';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 w-full max-w-full items-center justify-start gap-0.5 overflow-x-auto overscroll-x-contain rounded-md bg-hover-bg p-1 text-foreground-muted sm:justify-center',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
