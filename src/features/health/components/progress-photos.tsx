"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CameraIcon, ColumnsIcon, ImageIcon, LockIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, type CalendarDate } from "@/lib/dates";
import { compressImage } from "@/features/gifts/compress-image";
import { addPhoto, deletePhoto, listPhotos, type ProgressPhoto } from "../photo-store";

type Shown = ProgressPhoto & { url: string };

export function ProgressPhotos({ userId, today }: { userId: string; today: CalendarDate }) {
  const [photos, setPhotos] = useState<Shown[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [compare, setCompare] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const show = (rows: ProgressPhoto[]) =>
    setPhotos((old) => {
      for (const p of old ?? []) URL.revokeObjectURL(p.url);
      return rows.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
    });

  /** Re-read after adding or deleting. */
  const load = async () => show(await listPhotos(userId));

  useEffect(() => {
    let cancelled = false;
    listPhotos(userId).then(
      (rows) => !cancelled && show(rows),
      () => {
        if (cancelled) return;
        setUnsupported(true);
        setPhotos([]);
      },
    );
    return () => {
      cancelled = true;
      setPhotos((old) => (old?.forEach((p) => URL.revokeObjectURL(p.url)), null));
    };
  }, [userId]);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      try {
        const blob = await compressImage(file, 1280, 0.8);
        await addPhoto({ id: crypto.randomUUID(), userId, onDate: today, createdAt: Date.now(), blob });
        await load();
        toast.success("Photo saved on this device");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save that photo.");
      }
    });
  };

  const first = photos?.[0];
  const latest = photos?.at(-1);

  return (
    <div className="space-y-3">
      <p className="flex gap-2 text-xs text-muted-foreground">
        <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Photos stay on this device only. They aren&apos;t uploaded, synced or included in exports.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          aria-label="Take or choose a progress photo"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button onClick={() => input.current?.click()} disabled={pending || unsupported}>
          {pending ? <Spinner /> : <CameraIcon aria-hidden />}
          Add photo
        </Button>
        {photos && photos.length >= 2 ? (
          <Button variant="outline" onClick={() => setCompare((c) => !c)} aria-pressed={compare}>
            <ColumnsIcon aria-hidden /> {compare ? "Show all" : "Compare first & latest"}
          </Button>
        ) : null}
      </div>
      {unsupported ? (
        <p className="text-sm text-muted-foreground">This browser can&apos;t store photos (private browsing?).</p>
      ) : photos === null ? null : photos.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No progress photos yet" description="A photo every couple of weeks shows changes the scale can miss." />
      ) : compare && first && latest ? (
        <div className="grid grid-cols-2 gap-2 animate-in fade-in">
          {[first, latest].map((p, i) => (
            <figure key={p.id} className="overflow-hidden rounded-xl ring-1 ring-border/80">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
              <img src={p.url} alt={`${i === 0 ? "First" : "Latest"} progress photo, ${formatDate(p.onDate)}`} className="aspect-[3/4] w-full object-cover" />
              <figcaption className="px-2 py-1.5 text-xs font-medium">
                {i === 0 ? "First" : "Latest"} · {formatDate(p.onDate)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[...photos].reverse().map((p) => (
            <li key={p.id} className={cn("group relative overflow-hidden rounded-xl ring-1 ring-border/80")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
              <img src={p.url} alt={`Progress photo, ${formatDate(p.onDate)}`} className="aspect-[3/4] w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-[11px] font-medium text-white">
                {formatDate(p.onDate)}
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full bg-black/40"
                  aria-label={`Delete photo from ${formatDate(p.onDate)}`}
                  onClick={() =>
                    start(async () => {
                      await deletePhoto(p.id);
                      await load();
                    })
                  }
                >
                  <Trash2Icon className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
