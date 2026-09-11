'use client';
/* oxlint-disable next/no-img-element -- optional uploaded mosque image */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
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
        ) : query.isError ? (
          <>
            <Feedback
              message="Unable to load mosque details. Check the backend and database migration."
              error
            />
            <Button onClick={() => query.refetch()}>Retry</Button>
          </>
        ) : (
          <Form
            key={query.dataUpdatedAt}
            submit="Save mosque details"
            onSubmit={async (f) => {
              const input = mosqueDetailsSchema.parse({
                name: f.get('name'),
                address: f.get('address'),
                latitude: Number(f.get('latitude')),
                longitude: Number(f.get('longitude')),
                picture: current,
              });
              await api('mosque', input);
              await cache.invalidateQueries({ queryKey: ['mosque-details'] });
              setNotice('Mosque details saved.');
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
          </Form>
        )}
        <Feedback message={error || notice} error={!!error} />
      </Panel>
    </>
  );
}
