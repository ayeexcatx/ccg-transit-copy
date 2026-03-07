import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StickyNote, Box, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Type } from 'lucide-react';
import { NOTE_TYPES, normalizeTemplateNote, renderSimpleMarkupToHtml, sortTemplateNotesForDispatch } from '@/lib/templateNotes';

const DEFAULT_FORM = {
  note_type: NOTE_TYPES.GENERAL,
  title: '',
  bullet_lines: [''],
  box_content: '',
  border_color: '#475569',
  text_color: '#334155',
  active_flag: true,
  priority: 0,
};

export default function AdminTemplateNotes() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const boxContentRef = useRef(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['template-notes-admin'],
    queryFn: () => base44.entities.DispatchTemplateNotes.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.DispatchTemplateNotes.update(editing.id, data)
      : base44.entities.DispatchTemplateNotes.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-notes-admin'] });
      queryClient.invalidateQueries({ queryKey: ['template-notes'] });
      setOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DispatchTemplateNotes.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['template-notes-admin'] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setOpen(true);
  };

  const openEdit = (rawNote) => {
    const note = normalizeTemplateNote(rawNote);
    setEditing(rawNote);
    setForm({
      note_type: note.note_type,
      title: note.title || '',
      bullet_lines: note.bullet_lines.length > 0 ? note.bullet_lines : [''],
      box_content: note.box_content || note.note_text || '',
      border_color: note.border_color || '#475569',
      text_color: note.text_color || '#334155',
      active_flag: note.active_flag !== false,
      priority: note.priority || 0,
    });
    setOpen(true);
  };

  const updateBullet = (index, value) => {
    setForm(prev => ({
      ...prev,
      bullet_lines: prev.bullet_lines.map((line, i) => (i === index ? value : line)),
    }));
  };

  const moveBullet = (index, direction) => {
    setForm(prev => {
      const next = [...prev.bullet_lines];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, bullet_lines: next };
    });
  };

  const addBullet = () => setForm(prev => ({ ...prev, bullet_lines: [...prev.bullet_lines, ''] }));

  const removeBullet = (index) => {
    setForm(prev => {
      const next = prev.bullet_lines.filter((_, i) => i !== index);
      return { ...prev, bullet_lines: next.length > 0 ? next : [''] };
    });
  };

  const applyBoxMarkup = (wrapper) => {
    const textarea = boxContentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = form.box_content.slice(start, end);
    const nextValue = `${form.box_content.slice(0, start)}${wrapper}${selected}${wrapper}${form.box_content.slice(end)}`;

    setForm(prev => ({ ...prev, box_content: nextValue }));

    requestAnimationFrame(() => {
      textarea.focus();
      const selectionOffset = wrapper.length;
      textarea.selectionStart = start + selectionOffset;
      textarea.selectionEnd = end + selectionOffset;
    });
  };

  const saveForm = () => {
    const basePayload = {
      note_type: form.note_type,
      title: form.title.trim(),
      active_flag: form.active_flag,
      priority: Number(form.priority) || 0,
    };

    const payload = form.note_type === NOTE_TYPES.BOX
      ? {
        ...basePayload,
        box_content: form.box_content,
        border_color: form.border_color || '#475569',
        text_color: form.text_color || '#334155',
        bullet_lines: [],
        note_text: '',
      }
      : {
        ...basePayload,
        bullet_lines: form.bullet_lines.map(line => line.trim()).filter(Boolean),
        note_text: '',
        box_content: '',
        border_color: '',
        text_color: '',
      };

    const hasGeneralContent = payload.note_type === NOTE_TYPES.GENERAL && payload.bullet_lines.length > 0;
    const hasBoxContent = payload.note_type === NOTE_TYPES.BOX && payload.box_content.trim();
    if (!hasGeneralContent && !hasBoxContent) return;

    saveMutation.mutate(payload);
  };

  const sortedNotes = sortTemplateNotesForDispatch(notes);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Template Notes</h2>
          <p className="text-sm text-slate-500">Shown in dispatch details after assignments (Boxes first, then General Notes)</p>
        </div>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="h-4 w-4 mr-2" />Add Note
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : sortedNotes.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No template notes yet</div>
      ) : (
        <div className="grid gap-3">
          {sortedNotes.map(raw => {
            const n = normalizeTemplateNote(raw);
            return (
              <Card key={n.id} className={`hover:shadow-sm transition-shadow ${n.active_flag === false ? 'opacity-50' : ''}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 w-full">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${n.note_type === NOTE_TYPES.BOX ? 'bg-amber-50' : 'bg-purple-50'}`}>
                        {n.note_type === NOTE_TYPES.BOX
                          ? <Box className="h-4 w-4 text-amber-600" />
                          : <StickyNote className="h-4 w-4 text-purple-500" />}
                      </div>
                      <div className="w-full">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                          {n.note_type === NOTE_TYPES.BOX ? 'Box Note' : 'General Note'}
                        </p>
                        {!!n.title && <p className="text-sm font-semibold underline text-slate-800">{n.title}</p>}
                        {n.note_type === NOTE_TYPES.BOX ? (
                          <div
                            className="mt-2 rounded-md border p-3 text-sm"
                            style={{ borderColor: n.border_color, color: n.text_color }}
                            dangerouslySetInnerHTML={{ __html: renderSimpleMarkupToHtml(n.box_content || n.note_text) }}
                          />
                        ) : (
                          <ul className="mt-1 space-y-1 list-disc ml-4 text-sm text-slate-700">
                            {n.bullet_lines.map((line, idx) => (
                              <li key={`${n.id}-${idx}`}>{line}</li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge variant={n.active_flag !== false ? 'default' : 'secondary'} className="text-xs">
                            {n.active_flag !== false ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">Priority: {n.priority || 0}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(n)} className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(n.id)} className="h-8 w-8 text-red-500 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Template Note' : 'New Template Note'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Note Type</Label>
              <Select
                value={form.note_type}
                onValueChange={v => setForm(prev => ({ ...prev, note_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOTE_TYPES.GENERAL}>General Note</SelectItem>
                  <SelectItem value={NOTE_TYPES.BOX}>Box Note</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Title (optional)</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Section title" />
            </div>

            {form.note_type === NOTE_TYPES.GENERAL ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Bullet Lines</Label>
                  <Button variant="outline" size="sm" onClick={addBullet}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add bullet
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.bullet_lines.map((line, index) => (
                    <div key={`bullet-${index}`} className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">•</span>
                      <Input
                        value={line}
                        onChange={e => updateBullet(index, e.target.value)}
                        placeholder={`Bullet line ${index + 1}`}
                      />
                      <Button variant="ghost" size="icon" onClick={() => moveBullet(index, -1)} disabled={index === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => moveBullet(index, 1)} disabled={index === form.bullet_lines.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBullet(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="mb-0">Content</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyBoxMarkup('**')}>
                    <Type className="h-3.5 w-3.5 mr-1" />Bold
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyBoxMarkup('__')}>
                    <Type className="h-3.5 w-3.5 mr-1" />Underline
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Tip: highlight text and click Bold/Underline to apply formatting.</p>
                <Textarea
                  ref={boxContentRef}
                  value={form.box_content}
                  onChange={e => setForm({ ...form, box_content: e.target.value })}
                  rows={6}
                  placeholder="Box content"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Border color</Label>
                    <Input type="color" value={form.border_color} onChange={e => setForm({ ...form, border_color: e.target.value })} />
                  </div>
                  <div>
                    <Label>Text color</Label>
                    <Input type="color" value={form.text_color} onChange={e => setForm({ ...form, text_color: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label>Priority (lower = shown first within type)</Label>
              <Input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.active_flag} onCheckedChange={v => setForm({ ...form, active_flag: v })} />
            </div>
            <Button
              onClick={saveForm}
              disabled={saveMutation.isPending}
              className="w-full bg-slate-900 hover:bg-slate-800"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Note'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
