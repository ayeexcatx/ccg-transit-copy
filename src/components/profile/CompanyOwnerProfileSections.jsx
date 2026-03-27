import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { BellRing, Building2, Eye, KeyRound } from 'lucide-react';
import { formatPhoneNumber } from '@/lib/sms';
import SmsConsentDisclosure from '@/components/profile/SmsConsentDisclosure';

export function CompanyOwnerProfileOverview({
  company,
  contactSummary,
  hasPendingRequest,
  hasRequestedCode,
  requestCodePending,
  latestOwnerCode,
  onOpenEdit,
  onRequestCode,
  onViewCode,
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center"><Building2 className="h-5 w-5 text-slate-600" /></div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Company Profile</h2>
              <p className="text-sm text-slate-500">Profile information is view-only here. Use Edit to submit changes for admin approval.</p>
            </div>
          </div>
          <Button onClick={onOpenEdit} className="bg-slate-900 hover:bg-slate-800">Edit</Button>
        </div>

        {hasPendingRequest && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Pending approval: your requested company profile update is awaiting admin review.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4 sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Company name</p>
              <p className="mt-1 font-medium text-slate-900">{company.name || '—'}</p>
            </div>
            <div className="rounded-lg border p-4 sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Address</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-900">{company.address || '—'}</p>
            </div>
            <div className="rounded-lg border p-4 sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Contact info</p>
              <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                {contactSummary.length > 0
                  ? contactSummary.map((method, index) => (
                    <p key={`owner-contact-${index}`}><span className="font-medium text-slate-900">{method.type}:</span> {method.value}</p>
                  ))
                  : <p>—</p>}
              </div>
            </div>
            <div className="rounded-lg border p-4 sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Truck numbers</p>
              <div className="mt-2 flex flex-wrap gap-2">{(company.trucks || []).length ? company.trucks.map((truck) => <Badge key={truck} variant="outline" className="font-mono">{truck}</Badge>) : <span className="text-sm text-slate-500">No trucks listed.</span>}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-500" /><h3 className="font-semibold text-slate-900">Access code</h3></div>
              <p className="text-sm text-slate-500">Generate and view the company owner access code for this profile.</p>
              <Button onClick={onRequestCode} disabled={requestCodePending} className="w-full bg-red-600 text-white hover:bg-red-700">
                <KeyRound className="mr-2 h-4 w-4" />
                {requestCodePending ? 'Generating...' : hasRequestedCode ? 'Request New Code' : 'Request Access Code'}
              </Button>
              <Button variant="outline" onClick={onViewCode} disabled={!latestOwnerCode?.code} className="w-full">
                <Eye className="mr-2 h-4 w-4" />View Access Code
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CompanyOwnerSmsCard({
  smsState,
  smsContact,
  smsPending,
  consentChecked,
  showConsentCheckbox,
  onConsentChange,
  onToggle,
}) {
  const canEnableSms = smsState.target.phone && !smsState.optedIn
    ? (showConsentCheckbox ? consentChecked : true)
    : true;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-slate-500" /><h3 className="text-lg font-semibold text-slate-900">Your SMS notifications</h3></div>
        <div className="flex items-center justify-between rounded-lg border p-4 gap-4">
          <div>
            <Label className="text-base">Receive SMS notifications</Label>
            <p className="text-sm text-slate-500">You receive SMS only when you opt in here and a valid SMS contact is selected on the company profile.</p>
          </div>
          <Switch checked={smsState.optedIn} disabled={smsPending || !smsState.target.phone || !canEnableSms} onCheckedChange={onToggle} />
        </div>
        {showConsentCheckbox && (
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <Checkbox checked={consentChecked} onCheckedChange={(checked) => onConsentChange(checked === true)} disabled={smsPending} className="mt-0.5" />
            <span>I agree to receive operational SMS notifications from CCG Transit.</span>
          </label>
        )}
        <SmsConsentDisclosure />
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3 border"><p className="text-slate-500">Use for SMS</p><p className="font-medium text-slate-900">{smsState.target.method ? `${smsState.target.method.type}: ${smsState.target.method.value}` : 'No phone selected'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 border"><p className="text-slate-500">Number used for SMS</p><p className="font-medium text-slate-900">{smsContact.phone ? formatPhoneNumber(smsContact.phone) : 'No phone selected'}</p></div>
          <div className="rounded-lg bg-slate-50 p-3 border"><p className="text-slate-500">SMS active</p><p className={`font-medium ${smsState.effective ? 'text-emerald-700' : 'text-slate-900'}`}>{smsState.effective ? 'Yes' : 'No'}</p></div>
        </div>
        {!smsState.target.phone && <p className="text-sm text-red-600">Select a valid phone contact for SMS on this profile before opting in.</p>}
      </CardContent>
    </Card>
  );
}
