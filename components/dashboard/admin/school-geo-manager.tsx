'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Loader2, RotateCcw, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { normalizeSchoolGeo, type SchoolGeoPayload } from '@/lib/analytics/school-geo';

type SchoolGeoManagerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  school_name: string | null;
  monday_coach_id: string | null;
  school_geo: SchoolGeoPayload;
};

type EditableSchoolGeo = {
  lat: string;
  lon: string;
  street_address: string;
  city: string;
  state: string;
  county: string;
  zip: string;
};

function toEditable(value: SchoolGeoPayload): EditableSchoolGeo {
  return {
    lat: value.lat === null ? '' : String(value.lat),
    lon: value.lon === null ? '' : String(value.lon),
    street_address: value.street_address ?? '',
    city: value.city ?? '',
    state: value.state ?? '',
    county: value.county ?? '',
    zip: value.zip ?? '',
  };
}

function isChanged(a: EditableSchoolGeo, b: EditableSchoolGeo) {
  return (
    a.lat !== b.lat ||
    a.lon !== b.lon ||
    a.street_address !== b.street_address ||
    a.city !== b.city ||
    a.state !== b.state ||
    a.county !== b.county ||
    a.zip !== b.zip
  );
}

export function SchoolGeoManager({ rows }: { rows: SchoolGeoManagerRow[] }) {
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, EditableSchoolGeo>>(
    Object.fromEntries(rows.map((row) => [row.id, toEditable(row.school_geo)]))
  );
  const [saved, setSaved] = useState<Record<string, EditableSchoolGeo>>(
    Object.fromEntries(rows.map((row) => [row.id, toEditable(row.school_geo)]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const draft = drafts[row.id];
      const haystack = [
        row.full_name,
        row.email,
        row.school_name,
        row.monday_coach_id,
        draft?.street_address,
        draft?.city,
        draft?.state,
        draft?.county,
        draft?.zip,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [drafts, rows, search]);

  function updateField(id: string, field: keyof EditableSchoolGeo, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    setSavingId(id);
    try {
      const normalized = normalizeSchoolGeo(draft);
      const response = await fetch(`/api/admin/school-geo/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_geo: normalized }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((json as { error?: string }).error || `Request failed: ${response.status}`);
      }

      const nextSaved = toEditable(normalizeSchoolGeo((json as { school_geo?: unknown }).school_geo));
      setDrafts((current) => ({ ...current, [id]: nextSaved }));
      setSaved((current) => ({ ...current, [id]: nextSaved }));
      toast.success('School geo saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingId(null);
    }
  }

  function resetRow(id: string) {
    setDrafts((current) => ({
      ...current,
      [id]: saved[id],
    }));
  }

  async function copyJson(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(normalizeSchoolGeo(draft), null, 2));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
      toast.success('JSON copied');
    } catch {
      toast.error('Could not copy JSON');
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-meta-border bg-meta-dark/60">
        <CardHeader>
          <CardTitle className="text-meta-light">Coach School Geo</CardTitle>
          <CardDescription>
            Review and edit the stored `school_geo` JSON payload without using the Supabase table editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-meta-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search coach, school, city, state, county, zip..."
              className="pl-9"
            />
          </div>
          <div className="text-sm text-meta-muted">
            Showing {filteredRows.length} of {rows.length} coaches.
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {filteredRows.map((row) => {
          const draft = drafts[row.id];
          const initial = saved[row.id];
          const dirty = draft && initial ? isChanged(draft, initial) : false;
          const preview = normalizeSchoolGeo(draft);

          return (
            <Card key={row.id} className="border-meta-border bg-meta-dark/60">
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-meta-light">
                      {row.full_name || row.email || row.id}
                    </CardTitle>
                    <CardDescription className="mt-1 space-y-1 text-meta-muted">
                      <div>{row.school_name || 'No school name'}</div>
                      <div>{row.email || 'No email'}</div>
                      <div>Monday coach ID: {row.monday_coach_id || 'none'}</div>
                    </CardDescription>
                  </div>
                  <div className="text-sm text-meta-muted">
                    {dirty ? 'Unsaved changes' : 'Saved'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${row.id}-lat`}>Latitude</Label>
                    <Input
                      id={`${row.id}-lat`}
                      value={draft.lat}
                      onChange={(event) => updateField(row.id, 'lat', event.target.value)}
                      placeholder="33.9424"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${row.id}-lon`}>Longitude</Label>
                    <Input
                      id={`${row.id}-lon`}
                      value={draft.lon}
                      onChange={(event) => updateField(row.id, 'lon', event.target.value)}
                      placeholder="-117.2295"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${row.id}-city`}>City</Label>
                    <Input
                      id={`${row.id}-city`}
                      value={draft.city}
                      onChange={(event) => updateField(row.id, 'city', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${row.id}-state`}>State</Label>
                    <Input
                      id={`${row.id}-state`}
                      value={draft.state}
                      onChange={(event) => updateField(row.id, 'state', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2 xl:col-span-2">
                    <Label htmlFor={`${row.id}-street`}>Street Address</Label>
                    <Input
                      id={`${row.id}-street`}
                      value={draft.street_address}
                      onChange={(event) => updateField(row.id, 'street_address', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${row.id}-county`}>County</Label>
                    <Input
                      id={`${row.id}-county`}
                      value={draft.county}
                      onChange={(event) => updateField(row.id, 'county', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${row.id}-zip`}>ZIP</Label>
                    <Input
                      id={`${row.id}-zip`}
                      value={draft.zip}
                      onChange={(event) => updateField(row.id, 'zip', event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${row.id}-json`}>Normalized JSON Preview</Label>
                  <Textarea
                    id={`${row.id}-json`}
                    value={JSON.stringify(preview, null, 2)}
                    readOnly
                    className="min-h-[170px] font-mono text-xs"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => saveRow(row.id)} disabled={savingId !== null && savingId !== row.id}>
                    {savingId === row.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => resetRow(row.id)} disabled={!dirty || savingId === row.id}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                  <Button variant="outline" onClick={() => copyJson(row.id)}>
                    {copiedId === row.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copiedId === row.id ? 'Copied' : 'Copy JSON'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
