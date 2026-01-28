import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
  {
    variants: {
      variant: {
        draft: "badge-draft",
        published: "badge-published",
        locked: "badge-locked",
        missing: "badge-missing",
        partner: "badge-partner",
        default: "bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
}

export function StatusBadge({ className, variant, children, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}

// Preset badges
export function DraftBadge() {
  return <StatusBadge variant="draft">草稿</StatusBadge>;
}

export function PublishedBadge() {
  return <StatusBadge variant="published">已發布</StatusBadge>;
}

export function LockedBadge() {
  return <StatusBadge variant="locked">已鎖定</StatusBadge>;
}

export function MissingBadge({ count }: { count?: number }) {
  return (
    <StatusBadge variant="missing">
      缺人{count !== undefined ? ` ${count}` : ''}
    </StatusBadge>
  );
}

export function PartnerBadge() {
  return <StatusBadge variant="partner">同業</StatusBadge>;
}
