'use client';

import React, { useMemo } from 'react';
import { DriveMediaItem, TimelineGroup } from '@/lib/types';
import { Calendar } from 'lucide-react';

interface TimelineScrubberProps {
  items: DriveMediaItem[];
  onJumpToIndex: (index: number) => void;
}

export function TimelineScrubber({ items, onJumpToIndex }: TimelineScrubberProps) {
  // Aggregate items into Month/Year groups
  const groups: TimelineGroup[] = useMemo(() => {
    const map = new Map<string, { label: string; count: number; firstIndex: number }>();

    items.forEach((item, index) => {
      const d = new Date(item.createdTime);
      if (isNaN(d.getTime())) return;

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;

      if (!map.has(key)) {
        map.set(key, {
          label: `Tháng ${month}/${year}`,
          count: 1,
          firstIndex: index,
        });
      } else {
        const existing = map.get(key)!;
        existing.count += 1;
      }
    });

    return Array.from(map.entries()).map(([yearMonth, val]) => ({
      yearMonth,
      label: val.label,
      count: val.count,
      firstIndex: val.firstIndex,
    }));
  }, [items]);

  if (groups.length <= 1) return null;

  return (
    <aside className="hidden lg:flex flex-col items-center justify-center w-12 py-6 border-l border-[#222] bg-[#0c0c0c]/80 backdrop-blur-md select-none">
      <div className="flex flex-col items-center gap-1 mb-3 text-neutral-500">
        <Calendar className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-around w-full py-4 relative">
        {/* Subtle vertical track line */}
        <div className="absolute top-2 bottom-2 w-[1px] bg-neutral-800" />

        {groups.map((group) => (
          <button
            key={group.yearMonth}
            onClick={() => onJumpToIndex(group.firstIndex)}
            className="group relative flex items-center justify-center w-8 h-8 rounded-full z-10 transition-transform hover:scale-125"
            title={`${group.label} (${group.count} mục)`}
          >
            {/* Timeline Marker Dot */}
            <span className="w-2 h-2 rounded-full bg-neutral-600 group-hover:bg-blue-400 group-hover:ring-4 group-hover:ring-blue-500/20 transition-all" />

            {/* Hover Tooltip Popup on Left */}
            <div className="absolute right-10 px-2.5 py-1 rounded-md bg-[#1f1f1f] text-white text-[11px] font-medium whitespace-nowrap shadow-xl border border-neutral-700 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity flex items-center gap-1.5 z-30">
              <span>{group.label}</span>
              <span className="px-1.5 py-0.2 rounded bg-neutral-800 text-[10px] text-neutral-400">
                {group.count}
              </span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
