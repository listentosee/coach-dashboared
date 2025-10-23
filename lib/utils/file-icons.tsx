import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileAudio,
  FileVideo,
  FileCode,
  File,
} from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

function getExtension(value?: string | null): string {
  if (!value) return '';
  const lower = value.toLowerCase();
  const parts = lower.split('.');
  if (parts.length > 1) return parts.pop() || '';
  // handle mime type like application/pdf
  const slashParts = lower.split('/');
  if (slashParts.length > 1) return slashParts.pop() || '';
  return lower;
}

const DocumentBrandIcon = (label: string, background: string, accent: string): LucideIcon => {
  const BrandIcon = ({ className, ...props }: LucideProps) => (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-5 w-5', className)}
      role="img"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill={background}
      />
      <path d="M15 2v5h5" fill={accent} opacity={0.2} />
      <rect x="5.5" y="9.5" width="13" height="9" rx="1.5" fill="rgba(255,255,255,0.18)" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="700"
        fill="#fff"
        fontFamily="'Segoe UI', system-ui, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
  BrandIcon.displayName = `${label}Icon`;
  return BrandIcon;
};

const PdfIcon = DocumentBrandIcon('PDF', '#D1432F', '#A02020');
const WordIcon = DocumentBrandIcon('DOC', '#1A73E8', '#0C4AC8');
const PowerPointIcon = DocumentBrandIcon('PPT', '#D24625', '#AA2510');

export type FileIconPresentation = {
  Icon: LucideIcon
  hasFill?: boolean
}

export function getFileIcon(value?: string | null): FileIconPresentation {
  const ext = getExtension(value);
  switch (ext) {
    case 'pdf':
      return { Icon: PdfIcon, hasFill: true };
    case 'doc':
    case 'docx':
    case 'rtf':
      return { Icon: WordIcon, hasFill: true };
    case 'ppt':
    case 'pptx':
      return { Icon: PowerPointIcon, hasFill: true };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { Icon: FileSpreadsheet };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return FileImage;
    case 'zip':
    case 'rar':
    case 'tar':
    case 'gz':
      return FileArchive;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return FileAudio;
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv':
      return FileVideo;
    case 'js':
    case 'ts':
    case 'tsx':
    case 'json':
    case 'html':
    case 'css':
      return FileCode;
    default:
      return { Icon: File };
  }
}
