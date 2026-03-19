import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserRound, Plus, Pencil, KeyRound, Trash2, Check, Menu } from 'lucide-react';
import { formatPhoneNumber, getDriverSmsState } from '@/lib/sms';

const defaultForm = {
  driver_name: '',
  phone: '',
  owner_sms_enabled: false,
  notes: '',
  status: 'Active',
};

async function syncDriverAccessCode(driver) {
  if (!driver?.access_code_id) return;
  const smsState = getDriverSmsState(driver);
  await base44.entities.AccessCode.update(driver.access_code_id, {
    sms_enabled: smsState.effective,
    sms_phone: smsState.normalizedPhone || '',
  });
}

function DriverSmsStatus({ driver }) {
  const smsState = getDriverSmsState(driver);
  return (
    <div className="grid sm:grid-cols-3 gap-2 mt-3">
      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
        <p className="text-slate-500">Owner enabled</p>
        <p className="font-medium text-slate-900">{smsState.ownerEnabled ? 'Yes' : 'No'}</p>
      </div>
      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs opacity-80">
        <p className="text-slate-500">Driver opted in</p>
        <p className="font-medium text-slate-900">{smsState.driverOptedIn ? 'Yes' : 'No'}</p>
      </div>
      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
        <p className="text-slate-500">Overall SMS</p>
        <p className={`font-medium ${smsState.effective ? 'text-emerald-700' : 'text-slate-900'}`}>{smsState.effective ? 'Enabled' : 'Not enabled'}</p>
      </div>
    </div>
  );
}

export default function Drivers() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});
  const [driverToDelete, setDriverToDelete] = useState(null);
  const [helpLanguage, setHelpLanguage] = useState('en');

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers', session?.company_id],
    queryFn: () => base44.entities.Driver.filter({ company_id: session.company_id }, '-created_date', 200),
    enabled: !!session?.company_id,
  });

  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => (a.driver_name || '').localeCompare(b.driver_name || '')),
    [drivers],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['drivers', session?.company_id] });
    queryClient.invalidateQueries({ queryKey: ['drivers-all'] });
    queryClient.invalidateQueries({ queryKey: ['access-codes'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const saved = editing
        ? await base44.entities.Driver.update(editing.id, payload)
        : await base44.entities.Driver.create({
            ...payload,
            company_id: session.company_id,
            access_code_status: 'Not Requested',
            driver_sms_opt_in: false,
          });
      await syncDriverAccessCode(saved);
      return saved;
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Driver.delete(id),
    onSuccess: () => {
      invalidate();
      setDriverToDelete(null);
    },
  });

  const requestCodeMutation = useMutation({
    mutationFn: (driver) => base44.entities.Driver.update(driver.id, {
      access_code_status: 'Pending',
      requested_by_access_code_id: session?.id,
    }),
    onSuccess: invalidate,
  });

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setErrors({});
    setOpen(true);
  };

  const openEdit = (driver) => {
    setEditing(driver);
    setForm({
      driver_name: driver.driver_name || '',
      phone: formatPhoneNumber(driver.phone || ''),
      owner_sms_enabled: driver.owner_sms_enabled === true,
      notes: driver.notes || '',
      status: driver.status || 'Active',
    });
    setErrors({});
    setOpen(true);
  };

  const handleSave = () => {
    const nextErrors = {};
    if (!form.driver_name.trim()) nextErrors.driver_name = 'Driver name is required.';
    if (!form.phone.trim()) nextErrors.phone = 'Phone number is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    saveMutation.mutate({
      driver_name: form.driver_name.trim(),
      phone: form.phone.trim(),
      owner_sms_enabled: form.owner_sms_enabled === true,
      notes: form.notes,
      status: form.status,
      active_flag: form.status === 'Active',
    });
  };

  if (session?.code_type !== 'CompanyOwner') {
    return <div className="text-sm text-slate-500">Driver management is only available to company owners.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Drivers</h2>
          <p className="text-sm text-slate-500">Manage driver records and the owner-controlled SMS permission layer.</p>
        </div>
        <Button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="h-4 w-4 mr-1" />Add Driver
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" /></div>
      ) : sortedDrivers.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">No drivers added yet.</div>
      ) : (
        <div className="grid gap-3">
          {sortedDrivers.map((driver) => {
            const status = driver.status || (driver.active_flag === false ? 'Inactive' : 'Active');
            const accessCodeStatus = driver.access_code_status || 'Not Requested';
            const canRequestCode = accessCodeStatus === 'Not Requested';
            const requestLabel = accessCodeStatus === 'Pending' ? 'Pending' : accessCodeStatus === 'Created' ? 'Created' : 'Request Code';
            const smsState = getDriverSmsState(driver);

            return (
              <Card key={driver.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <UserRound className="h-4 w-4 text-slate-500" />
                        <p className="font-medium text-slate-900">{driver.driver_name || 'Unnamed driver'}</p>
                        <Badge variant={status === 'Active' ? 'default' : 'secondary'}>{status}</Badge>
                        <Badge variant="outline">{accessCodeStatus}</Badge>
                        <Badge variant={smsState.effective ? 'default' : 'secondary'} className="text-[11px]">{smsState.effective ? <><Check className="h-3 w-3 mr-1" />SMS Active</> : 'SMS Not Active'}</Badge>
                      </div>
                      {driver.phone && <p className="text-sm text-slate-600">Phone: {driver.phone}</p>}
                      {driver.notes && <p className="text-sm text-slate-500">{driver.notes}</p>}
                      <DriverSmsStatus driver={driver} />
                      {driver.owner_sms_enabled ? (
                        <p className="mt-2 pr-6 text-xs leading-5 text-red-600">
                          Please have your driver opt in to SMS notifications by clicking the menu button <Menu className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom" /> then going to Profile and enabling SMS notifications.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-2">This driver will not receive notifications on their phone. They will only see pending notifications when they open the app.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(driver)} className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDriverToDelete(driver)} className="h-8 w-8 text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="outline" size="sm" onClick={() => requestCodeMutation.mutate(driver)} disabled={requestCodeMutation.isPending || !canRequestCode} className="text-xs bg-red-600 text-white hover:bg-red-700"><KeyRound className="h-3.5 w-3.5 mr-1" />{requestLabel}</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="p-5 space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Driver SMS reminder: owners can enable the company permission layer here, but each driver still must use <span className="font-medium">Menu → Profile</span> to opt in before SMS becomes active.
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            {[
              { value: 'en', label: 'English' },
              { value: 'pt', label: 'Portuguese' },
            ].map((language) => (
              <Button
                key={language.value}
                type="button"
                variant={helpLanguage === language.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setHelpLanguage(language.value)}
                className={helpLanguage === language.value ? 'shadow-sm' : 'bg-white'}
              >
                {language.label}
              </Button>
            ))}
          </div>

          {helpLanguage === 'en' ? (
            <>
              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Driver Portal</h3>
                <p className="text-sm leading-6 text-slate-700">
                  A driver portal <span className="font-medium">ONLY</span> has the ability to view driver-specific announcements, dispatches that they are
                  assigned to (normal dispatch details only), and have the ability to report incidents. <span className="font-medium">They do not</span> have the ability to view or see
                  ANYTHING else, including the confirmation logs, other drivers, or even other trucks assigned to the same dispatch.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Assigning Drivers</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    A driver can only see a dispatch and receive notifications <span className="font-medium">IF</span> and <span className="font-medium">WHEN</span> you assign them to a
                    truck number on a dispatch.
                  </li>
                  <li>
                    When you <span className="font-medium">select a driver</span> on a dispatch, a copy of the dispatch and a notification will be sent to the
                    driver. <span className="font-medium text-emerald-600">“You have received a new dispatch”</span>
                  </li>
                  <li>
                    Do not select a driver <span className="font-medium">until</span> you are ready to share the dispatch with them.
                  </li>
                  <li>
                    Any changes made <span className="font-medium">by the dispatcher</span> (CCG) after a driver is assigned will also be received by the driver as long
                    as they remain assigned. (<span className="text-amber-600">Amendments</span>, <span className="text-red-600">Cancellations</span>)
                  </li>
                  <li>
                    If you <span className="font-medium">remove a driver</span> from the dispatch assignment, they will immediately receive a
                    <span className="font-medium text-red-600"> cancellation</span> notification.
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Changing Drivers / Trucks</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    If you have a driver assigned and you <span className="font-medium">switch the driver</span> in the dropdown menu, the driver you removed will immediately receive a
                    <span className="text-red-600"> cancellation</span> notification, and the driver you added will immediately receive a <span className="text-emerald-600">new dispatch</span> notification.
                  </li>
                </ul>
                <p className="pl-5 text-sm text-slate-500 italic leading-6">
                  Example: Switch Driver 1 to Driver 2<br />
                  Driver 1 = cancellation notification<br />
                  Driver 2 = new dispatch notification
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    If you <span className="font-medium">switch a truck</span> that currently has a driver assigned, the driver assignment will <span className="font-medium">RESET</span> and the driver will receive a <span className="text-red-600">cancellation</span> notification.
                    They will no longer be able to view the dispatch.
                  </li>
                </ul>
                <p className="pl-5 text-sm text-slate-500 italic leading-6">
                  Example: Truck 1 (which has Driver 1 assigned) is switched to Truck 2 which is not dispatched:<br />
                  The driver assignment is RESET (driver removed), so Driver 1 will receive a cancellation notification. Reassign them to Truck 2 to send them a new dispatch notification, or choose a new driver to send the new dispatch to them.
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    If you <span className="font-medium">swap trucks</span> that currently have drivers assigned, the driver assignments will <span className="font-medium">RESET</span> and the drivers will both receive a <span className="text-red-600">cancellation</span> notification.
                    They will no longer be able to view the dispatches until you reassign them. When you reassign them, they will receive a new dispatch notification.
                  </li>
                </ul>
                <p className="pl-5 text-sm text-slate-500 italic leading-6">
                  Example: Truck 1 has Driver 1 assigned AND is switched to Truck 2 that has Driver 2 assigned:<br />
                  Both trucks will have their drivers RESET (drivers removed), so both drivers will receive a cancellation notification. Reassign them to send the new dispatch.
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Please make sure to double-check all the selections and changes you make, and that you <span className="font-medium">reassign</span> the drivers to the correct dispatch if you <span className="font-medium">switch trucks</span>.
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Passive Driver Notifications</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    If you <span className="font-medium">select a driver and do nothing else</span>, they will receive notifications and dispatch updates the same way you receive them, except they will only receive the ones pertaining to the dispatch they are <span className="font-medium">assigned</span> to.
                  </li>
                  <li>
                    What you see on your screen is exactly how things stand. If you have your driver selected to a dispatch, your driver can also see that dispatch. <br />
                    If you have <span className="font-medium">'No Driver Selected'</span> on your dispatch, then your driver cannot see that dispatch.
                  </li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Portal do Motorista</h3>
                <p className="text-sm leading-6 text-slate-700">
                  O portal do motorista permite <span className="font-medium">APENAS</span> visualizar anúncios específicos para motoristas, os despachos aos quais está atribuído
                  (apenas os detalhes normais do despacho) e reportar incidentes. <span className="font-medium">Não tem acesso</span> a MAIS NADA, incluindo registos de confirmação,
                  outros motoristas ou até outros camiões atribuídos ao mesmo despacho.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Atribuição de Motoristas</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Um motorista só consegue ver um despacho e receber notificações <span className="font-medium">SE</span> e <span className="font-medium">QUANDO</span> for atribuído a um número de camião num despacho.
                  </li>
                  <li>
                    Ao <span className="font-medium">selecionar um motorista</span> num despacho, será enviada uma cópia do despacho e uma notificação ao motorista: <span className="font-medium text-emerald-600">“Recebeu um novo despacho”</span>
                  </li>
                  <li>
                    Não selecione um motorista <span className="font-medium">até</span> estar pronto para partilhar o despacho com ele.
                  </li>
                  <li>
                    Quaisquer alterações feitas pelo <span className="font-medium">despachante</span> (CCG) após a atribuição também serão recebidas pelo motorista, desde que ele continue atribuído.
                    (<span className="text-amber-600">alterações</span>, <span className="text-red-600">cancelamentos</span>)
                  </li>
                  <li>
                    Se <span className="font-medium">remover um motorista</span> da atribuição do despacho, ele receberá imediatamente uma notificação de <span className="font-medium text-red-600">cancelamento</span>.
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Alterar Motoristas / Camiões</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Se tiver um motorista atribuído e o trocar no menu suspenso, o motorista removido receberá imediatamente uma notificação de <span className="text-red-600">cancelamento</span>, e o novo motorista receberá uma notificação de <span className="text-emerald-600">novo despacho</span>.
                  </li>
                </ul>
                <p className="pl-5 text-sm text-slate-500 italic leading-6">
                  Exemplo: Trocar Motorista 1 por Motorista 2<br />
                  Motorista 1 = notificação de <span className="text-red-600">cancelamento</span><br />
                  Motorista 2 = notificação de <span className="text-emerald-600">novo despacho</span>
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Se alterar um camião que já tem um motorista atribuído, a atribuição será <span className="font-medium">REINICIADA</span> e o motorista receberá uma notificação de <span className="text-red-600">cancelamento</span>. Deixará de conseguir ver o despacho.
                  </li>
                </ul>
                <p className="pl-5 text-sm text-slate-500 italic leading-6">
                  Exemplo:<br />
                  Camião 1 (com Motorista 1 atribuído) é alterado para Camião 2 (sem despacho):<br />
                  A atribuição é <span className="font-medium">REINICIADA</span> (motorista removido), pelo que o Motorista 1 receberá uma notificação de <span className="text-red-600">cancelamento</span>.<br />
                  Reatribua-o ao Camião 2 para enviar uma nova notificação de <span className="text-emerald-600">despacho</span>, ou selecione outro motorista.
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Se trocar camiões que já têm motoristas atribuídos, ambas as atribuições serão <span className="font-medium">REINICIADAS</span> e ambos os motoristas receberão uma notificação de <span className="text-red-600">cancelamento</span>. Deixarão de conseguir ver os despachos até serem novamente atribuídos.
                  </li>
                </ul>
                <p className="pl-5 text-sm text-slate-500 italic leading-6">
                  Exemplo:<br />
                  Camião 1 com Motorista 1 é trocado com Camião 2 com Motorista 2:<br />
                  Ambos os camiões terão os motoristas removidos, e ambos receberão uma notificação de <span className="text-red-600">cancelamento</span>.<br />
                  Reatribua-os para enviar novos <span className="text-emerald-600">despachos</span>.
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Por favor, verifique sempre cuidadosamente todas as seleções e alterações efetuadas e confirme que os motoristas estão atribuídos ao despacho correto após qualquer troca de camiões.
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">Notificações Passivas do Motorista</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
                  <li>
                    Se <span className="font-medium">selecionar um motorista e não fizer mais nada</span>, ele receberá notificações e atualizações de despachos da mesma forma que você, mas apenas relacionadas com os despachos aos quais está <span className="font-medium">atribuído</span>.
                  </li>
                  <li>
                    O que vê no seu ecrã corresponde exatamente ao estado atual. Se um motorista estiver atribuído a um despacho, ele também consegue vê-lo. <br />
                    Se aparecer <span className="font-medium">“Sem motorista selecionado”</span> no despacho, então o motorista não consegue ver esse despacho.
                  </li>
                </ul>
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md pr-10">
          <DialogHeader className="pr-6"><DialogTitle>{editing ? 'Edit Driver' : 'Add Driver'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Driver Name *</Label>
              <Input value={form.driver_name} onChange={(e) => setForm((prev) => ({ ...prev, driver_name: e.target.value }))} placeholder="Driver name" />
              {errors.driver_name && <p className="mt-1 text-xs text-red-600">{errors.driver_name}</p>}
            </div>
            <div>
              <Label>Phone Number *</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))} placeholder="Phone number" />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Do you want this driver to receive SMS notifications?</Label>
                  <p className="text-xs text-slate-500">This is the company owner approval layer.</p>
                </div>
                <Switch checked={form.owner_sms_enabled === true} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, owner_sms_enabled: checked }))} />
              </div>
              {form.owner_sms_enabled ? (
                <p className="pr-6 text-xs leading-5 text-red-600">Please have your driver opt in to SMS notifications by clicking the menu button <Menu className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom" />, going to Profile, and opting in to SMS notifications.</p>
              ) : (
                <p className="text-xs text-slate-500">This driver will not receive notifications on their phone. They will only see pending notifications when they open the app.</p>
              )}
              <div className="rounded-lg bg-slate-50 border border-dashed p-3 opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Driver personal SMS opt-in</Label>
                    <p className="text-xs text-slate-500">View only — drivers manage this themselves from Profile.</p>
                  </div>
                  <Switch checked={editing?.driver_sms_opt_in === true || (editing?.driver_sms_opt_in == null && editing?.sms_enabled === true)} disabled />
                </div>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-slate-500">Inactive drivers remain in records but are not treated as active.</p>
              </div>
              <Switch checked={form.status === 'Active'} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, status: checked ? 'Active' : 'Inactive' }))} />
            </div>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-slate-900 hover:bg-slate-800">{saveMutation.isPending ? 'Saving...' : 'Save Driver'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!driverToDelete} onOpenChange={(openState) => !openState && setDriverToDelete(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Driver</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this driver?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => driverToDelete && deleteMutation.mutate(driverToDelete.id)} disabled={deleteMutation.isPending}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}