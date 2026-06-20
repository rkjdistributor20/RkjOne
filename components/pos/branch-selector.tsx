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
  const selected = branches.find((b) => b.id === value);

  return (
    <Select
      value={value}
      onValueChange={(v) => v && onChange(v)}
    >
      <SelectTrigger className="w-full max-w-md">
        <SelectValue placeholder="Pilih cawangan">
          {selected
            ? `${selected.branch_code} — ${selected.branch_name}`
            : 'Pilih cawangan'}
        </SelectValue>
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
