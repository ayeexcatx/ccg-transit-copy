import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import SmsConsentDisclosure from '@/components/profile/SmsConsentDisclosure';

export default function DriverProfileSmsCard({
  smsState,
  optedIn,
  consentChecked,
  onConsentChange,
  showConsentCheckbox,
  isPending,
  onToggle,
}) {
  const canEnableSms = smsState.ownerEnabled && !optedIn
    ? (showConsentCheckbox ? consentChecked : true)
    : true;

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-base">Receive SMS notifications</Label>
          <p className="text-sm text-slate-500">SMS is sent only when your company owner enables SMS for you and you opt in here.</p>
        </div>
        <Switch checked={optedIn} disabled={isPending || !canEnableSms} onCheckedChange={onToggle} />
      </div>
      {showConsentCheckbox && (
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
          <Checkbox checked={consentChecked} onCheckedChange={(checked) => onConsentChange(checked === true)} disabled={isPending} className="mt-0.5" />
          <span>I agree to receive operational SMS notifications from CCG Transit.</span>
        </label>
      )}
      <SmsConsentDisclosure />
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 border"><p className="text-slate-500">Owner enabled</p><p className="font-medium text-slate-900">{smsState.ownerEnabled ? 'Yes' : 'No'}</p></div>
        <div className="rounded-lg bg-slate-50 p-3 border"><p className="text-slate-500">You opted in</p><p className="font-medium text-slate-900">{smsState.driverOptedIn ? 'Yes' : 'No'}</p></div>
        <div className="rounded-lg bg-slate-50 p-3 border"><p className="text-slate-500">SMS active</p><p className={`font-medium ${smsState.effective ? 'text-emerald-700' : 'text-slate-900'}`}>{smsState.effective ? 'Yes' : 'No'}</p></div>
      </div>
      {!smsState.ownerEnabled && <p className="text-sm text-amber-700">Your company owner has not enabled SMS for your driver record yet.</p>}
    </div>
  );
}
