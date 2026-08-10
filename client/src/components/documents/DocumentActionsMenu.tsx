import {
  DotsThreeVertical as MoreVertical,
  Eye,
  DownloadSimple as Download,
  Info,
  ClockCounterClockwise as History,
  Globe,
  TextAa as TextScan,
  Trash as Trash2,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DocumentActionsMenuProps {
  canPreview?: boolean;
  isFirmPublic: boolean;
  onPreview?: () => void;
  onDownload: () => void;
  onDetails?: () => void;
  onVersionHistory: () => void;
  onToggleVisibility: () => void;
  onOcr?: () => void;
  onDelete: () => void;
  triggerClassName?: string;
}

export function DocumentActionsMenu({
  canPreview,
  isFirmPublic,
  onPreview,
  onDownload,
  onDetails,
  onVersionHistory,
  onToggleVisibility,
  onOcr,
  onDelete,
  triggerClassName,
}: DocumentActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'p-1 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-sm',
            'opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
            'transition-opacity hover:bg-muted',
            triggerClassName
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Document actions"
        >
          <MoreVertical size={14} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[11rem] z-[100]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {canPreview && onPreview && (
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onPreview}>
            <Eye size={14} /> Preview
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onDownload}>
          <Download size={14} /> Download
        </DropdownMenuItem>
        {onDetails && (
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onDetails}>
            <Info size={14} /> Details
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onVersionHistory}>
          <History size={14} /> Version History
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onToggleVisibility}>
          <Globe size={14} /> {isFirmPublic ? 'Make private' : 'Make public (firm)'}
        </DropdownMenuItem>
        {onOcr && (
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onOcr}>
            <TextScan size={14} /> Run OCR
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 size={14} /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
