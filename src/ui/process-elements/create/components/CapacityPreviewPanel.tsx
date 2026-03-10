import React from 'react';
import type { PreviewResult } from '../../../../engine/preview';

export const CapacityPreviewPanel: React.FC<{ preview: PreviewResult | null }> = ({ preview }) => {
  if (!preview || !preview.isValid) return <div className="text-xs text-amber-600">Onvoldoende/ongeldige invoer voor preview.</div>;
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div><div className="text-slate-500">Theoretical Throughput</div><div className="font-semibold">{preview.grossRatePerHour} u/uur</div></div>
      <div><div className="text-slate-500">Effective Throughput</div><div className="font-semibold">{preview.afterYieldPerHour} u/uur</div></div>
      <div><div className="text-slate-500">Weekly Capacity</div><div className="font-semibold">{Math.round(preview.effectiveCapacityPerDay * 5)} u/week</div></div>
    </div>
  );
};
