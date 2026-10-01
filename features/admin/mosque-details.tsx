'use client';
/* oxlint-disable next/no-img-element -- optional uploaded mosque image */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Pencil, MapPin } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/data/api';
import { mosque } from '@/config/mosque';
import { mosqueDetailsSchema, type MosqueDetails } from '@/lib/mosque-details';
import {
  Panel,
  PageTitle,
  Form,
  Field,
  Feedback,
} from '@/components/app/primitives';
import { Button } from '@/components/ui/button';
export function MosqueDetailsEditor() {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['mosque-details'],
    queryFn: () => api<MosqueDetails | null>('mosque'),
  });
  const [picture, setPicture] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = picture ?? query.data?.picture ?? '';
  return (
    <>
      <PageTitle
        title="Mosque details"
        description="Set up the mosque shared by its owner, administrators, and members."
      />
      <Panel>
        {query.isPending ? (
          <p>Loading mosque details…</p>
        ) : query.isError && !query.data ? (
          <>
            <Feedback
              message="Unable to load mosque details. Check the backend and database migration."
              error
            />
            <Button onClick={() => query.refetch()}>Retry</Button>
          </>
        ) : query.data && !editing ? (
          <div className="relative space-y-6">
            <Button
              variant="outline"
              className="absolute right-0 top-0 size-11"
              aria-label="Edit mosque details"
              onClick={() => {
                setPicture(null);
                setError('');
                setNotice('');
                setEditing(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <div className="flex flex-col gap-4 pr-14 sm:flex-row sm:items-center">
              {query.data.picture ? (
                <img
                  src={query.data.picture}
                  alt={query.data.name}
                  className="size-24 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <Landmark
                  className="size-24 shrink-0 rounded-xl bg-accent p-5 text-primary"
                  aria-label="Mosque"
                />
              )}
              <div className="min-w-0">
                <h2 className="break-words font-heading text-2xl">
                  {query.data.name}
                </h2>
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  <span className="whitespace-pre-wrap break-words">
                    {query.data.address}
                  </span>
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t pt-5 text-sm">
              <div>
                <dt className="text-muted-foreground">Latitude</dt>
                <dd className="mt-1 font-medium tabular-nums">
                  {query.data.latitude}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Longitude</dt>
                <dd className="mt-1 font-medium tabular-nums">
                  {query.data.longitude}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <Form
            submit="Save mosque details"
            onSubmit={async (f) => {
              const input = mosqueDetailsSchema.parse({
                name: f.get('name'),
                address: f.get('address'),
                latitude: Number(f.get('latitude')),
                longitude: Number(f.get('longitude')),
                picture: current,
              });
              setSaving(true);
              try {
                await api('mosque', input);
                await cache.cancelQueries({ queryKey: ['mosque-details'] });
                cache.setQueryData(['mosque-details'], input);
                setEditing(false);
                setPicture(null);
                setError('');
                setNotice('Mosque details saved.');
                void cache.invalidateQueries({ queryKey: ['mosque-details'] });
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="flex items-center gap-4">
              {current ? (
                <img
                  src={current}
                  alt="Mosque"
                  className="size-24 rounded-xl object-cover"
                />
              ) : (
                <Landmark
                  className="size-24 rounded-xl bg-accent p-5 text-primary"
                  aria-label="Mosque picture placeholder"
                />
              )}
              <span className="text-sm text-muted-foreground">
                Mosque picture · optional
              </span>
            </div>
            <Field
              name="picture"
              label="Picture (PNG, JPEG, WebP · up to 500 KB)"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                setError('');
                const file = e.target.files?.[0];
                if (!file) return;
                if (
                  file.size > 500000 ||
                  !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
                ) {
                  setError(
                    'Choose a PNG, JPEG, or WebP image smaller than 500 KB.',
                  );
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string')
                    setPicture(reader.result);
                };
                reader.onerror = () => setError('Unable to read the image.');
                reader.readAsDataURL(file);
              }}
            />
            {current && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPicture('')}
              >
                Remove picture
              </Button>
            )}
            <Field
              name="name"
              label="Mosque name"
              defaultValue={query.data?.name ?? mosque.name}
              required
              maxLength={160}
            />
            <Field
              name="address"
              label="Address"
              defaultValue={query.data?.address ?? mosque.location}
              required
              maxLength={500}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="latitude"
                label="Latitude"
                type="number"
                step="any"
                min={-90}
                max={90}
                defaultValue={
                  query.data?.latitude ?? mosque.coordinates.latitude
                }
                required
              />
              <Field
                name="longitude"
                label="Longitude"
                type="number"
                step="any"
                min={-180}
                max={180}
                defaultValue={
                  query.data?.longitude ?? mosque.coordinates.longitude
                }
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter coordinates manually. Prayer calculations use these
              coordinates, so replace placeholders with the mosque’s actual
              location before relying on the times.
            </p>
            {query.data && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setPicture(null);
                  setError('');
                  setNotice('');
                }}
              >
                Cancel
              </Button>
            )}
          </Form>
        )}
        <Feedback message={error || notice} error={!!error} />
      </Panel>
    </>
  );
}
