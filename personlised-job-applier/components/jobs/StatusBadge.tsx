"use client";

import {
  AlertCircle,
  CircleDashed,
  FileText,
  Send,
  Upload,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import type { JobStatus } from "@/lib/jobs/types";

const STATUS_META: Record<
  JobStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  discovered: {
    label: "Discovered",
    color: "#4da9e4",
    icon: <CircleDashed size={12} />,
  },
  materials_generated: {
    label: "Materials",
    color: "#f4ba41",
    icon: <FileText size={12} />,
  },
  filled: { label: "Filled", color: "#9c71f0", icon: <Upload size={12} /> },
  needs_review: {
    label: "Review",
    color: "#ff4500",
    icon: <UserCheck size={12} />,
  },
  submitted: { label: "Submitted", color: "#71ac38", icon: <Send size={12} /> },
  failed: {
    label: "Failed",
    color: "#ce1f02",
    icon: <AlertCircle size={12} />,
  },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge color={meta.color} className="shrink-0">
      {meta.icon}
      {meta.label}
    </Badge>
  );
}
