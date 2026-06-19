'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BranchSelectorProps {
  branches: Array<{ id: string; branch_code: string; branch_name: string }>;
  value: string;
  onChange: (branchId: string) => void;
}

export function BranchSelector({
  branches,
  value,
  onChange,
}: BranchSelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v && onChange(v)}
    >
      <SelectTrigger className="w-full max-w-xs">
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.branch_code} — {b.branch_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
