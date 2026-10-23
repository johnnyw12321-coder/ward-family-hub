"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, FileJsonIcon, SparklesIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loadDemoData, resetHealthData } from "../actions/data";

export function DemoDataButton({ hasData }: { hasData: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await loadDemoData();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.push("/health");
    });
  if (!hasData) {
    return (
      <Button variant="outline" onClick={run} disabled={pending}>
        {pending ? <Spinner /> : <SparklesIcon aria-hidden />}
        Load demo data
      </Button>
    );
  }
  return (
    <ConfirmAction
      action={async () => {
        const r = await loadDemoData();
        if (r.ok) router.push("/health");
        return r;
      }}
      trigger={
        <>
          <SparklesIcon aria-hidden /> Load demo data
        </>
      }
      title="Replace your data with demo data?"
      description="This deletes your current Ward Health data and fills it with two months of sample weigh-ins, meals and workouts. Export a backup first if you want to keep it. Nothing outside Ward Health changes."
      confirmLabel="Replace with demo data"
    />
  );
}

export function ExportButtons() {
  const link = "inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted";
  return (
    <div className="flex flex-wrap gap-2">
      <a href="/api/health/export?format=json" className={link} download>
        <FileJsonIcon className="size-4" aria-hidden /> Everything (JSON)
      </a>
      <a href="/api/health/export?format=weight" className={link} download>
        <DownloadIcon className="size-4" aria-hidden /> Weight (CSV)
      </a>
      <a href="/api/health/export?format=workouts" className={link} download>
        <DownloadIcon className="size-4" aria-hidden /> Workouts (CSV)
      </a>
    </div>
  );
}

export function ImportButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Choose a Ward Health export file"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Button variant="outline" onClick={() => input.current?.click()}>
        <UploadIcon aria-hidden /> Import from file
      </Button>
      <AlertDialog open={Boolean(file)} onOpenChange={(open) => !open && !pending && setFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {file?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current Ward Health data will be replaced by what&apos;s in this file. If anything in it is invalid, nothing
              changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (!file) return;
                start(async () => {
                  const res = await fetch("/api/health/import", { method: "POST", body: await file.text(), headers: { "Content-Type": "application/json" } });
                  const body = (await res.json().catch(() => ({}))) as { error?: string };
                  if (!res.ok) {
                    toast.error(body.error ?? "The import didn't work. Please try again.");
                    return;
                  }
                  toast.success("Ward Health data imported");
                  setFile(null);
                  router.refresh();
                });
              }}
            >
              {pending ? <Spinner /> : null}
              Replace and import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ResetButton() {
  return (
    <ConfirmAction
      action={resetHealthData}
      redirectTo="/health/welcome"
      variant="destructive"
      trigger={
        <>
          <Trash2Icon aria-hidden /> Reset Ward Health
        </>
      }
      title="Delete all your Ward Health data?"
      description="Your profile, weigh-ins, meals, water, measurements, workouts and badges will be permanently deleted. Progress photos stay on this phone until you remove them. Your Ward Hub data — finances, calendar, tasks and everything else — is not affected."
      confirmLabel="Delete Ward Health data"
    />
  );
}
