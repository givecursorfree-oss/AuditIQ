import {
  File,
  Image,
  Table as FileSpreadsheet,
  FileText,
} from '@phosphor-icons/react';

export const FILE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  pdf: { icon: FileText, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10', label: 'PDF' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-500/10', label: 'Excel' },
  xls: { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-500/10', label: 'Excel' },
  csv: { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-500/10', label: 'CSV' },
  doc: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10', label: 'Word' },
  docx: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10', label: 'Word' },
  png: { icon: Image, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: 'Image' },
  jpg: { icon: Image, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: 'Image' },
  jpeg: { icon: Image, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: 'Image' },
  gif: { icon: Image, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: 'Image' },
  webp: { icon: Image, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: 'Image' },
  svg: { icon: Image, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', label: 'SVG' },
  txt: { icon: File, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-500/10', label: 'Text' },
};

export const DEFAULT_FILE = {
  icon: File,
  color: 'text-gray-400',
  bg: 'bg-gray-50 dark:bg-gray-500/10',
  label: 'File',
};

export const CATEGORIES = ['Financial', 'Legal', 'Tax', 'Compliance', 'Correspondence', 'Workpaper', 'Other'];
export const FOLDERS = ['Current File', 'Permanent File', 'Correspondence', 'Reports'];
export const PREVIEWABLE_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'docx'];

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function getExt(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function getFileConfig(name: string) {
  return FILE_CONFIG[getExt(name)] || DEFAULT_FILE;
}

export function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type DocumentPreviewState = {
  url: string;
  name: string;
  type: string;
  htmlContent?: string;
  searchQuery?: string;
};
