"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Camera, Loader2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image-compress";
import { uploadJobPhotoAction } from "@/app/actions/field";
import type { FieldPhoto } from "@/lib/field-shared";

/**
 * Before/after photos.
 *
 * Every photo is shrunk on the phone first — see `src/lib/image-compress.ts`.
 * If storage is not set up the button says so plainly rather than swallowing
 * the picture.
 */
export function PhotoUpload({
  jobId, photos, locale, storageReady, readOnly,
}: {
  jobId: string;
  photos: FieldPhoto[];
  locale: "en" | "ar";
  storageReady: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations("field.photos");
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  function onPick(kind: "BEFORE" | "AFTER") {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = ""; // let the same file be chosen again
      if (files.length === 0) return;

      startBusy(async () => {
        let uploaded = 0;
        for (const [index, file] of files.entries()) {
          setProgress(t("uploadingOf", { current: index + 1, total: files.length }));
          try {
            const compressed = await compressImage(file);
            const result = await uploadJobPhotoAction({
              jobId,
              kind,
              fileName: compressed.fileName,
              contentType: compressed.contentType,
              dataBase64: compressed.base64,
              locale,
            });
            if (result.ok) uploaded += 1;
            else toast.error(result.error);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("failed"));
          }
        }
        setProgress(null);
        if (uploaded > 0) {
          toast.success(t("uploaded", { count: uploaded }));
          router.refresh();
        }
      });
    };
  }

  const before = photos.filter((p) => p.kind === "BEFORE");
  const after = photos.filter((p) => p.kind === "AFTER");

  return (
    <div className="space-y-4">
      {!storageReady ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("storageOff")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {(["BEFORE", "AFTER"] as const).map((kind) => (
          <div key={kind}>
            <p className="mb-1.5 text-sm font-medium">{t(kind === "BEFORE" ? "before" : "after")}</p>
            <input
              ref={kind === "BEFORE" ? beforeInput : afterInput}
              type="file"
              accept="image/*"
              // `capture` opens the camera straight away on a phone.
              capture="environment"
              multiple
              hidden
              onChange={onPick(kind)}
            />
            <Button
              variant="outline"
              className="h-20 w-full flex-col gap-1"
              disabled={busy || readOnly || !storageReady}
              onClick={() => (kind === "BEFORE" ? beforeInput : afterInput).current?.click()}
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
              <span className="text-xs">{t("take")}</span>
            </Button>

            <PhotoStrip photos={kind === "BEFORE" ? before : after} emptyLabel={t("none")} />
          </div>
        ))}
      </div>

      {progress ? <p className="text-muted-foreground text-center text-xs">{progress}</p> : null}
    </div>
  );
}

function PhotoStrip({ photos, emptyLabel }: { photos: FieldPhoto[]; emptyLabel: string }) {
  if (photos.length === 0) {
    return <p className="text-muted-foreground mt-2 text-center text-xs">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-2 grid grid-cols-3 gap-1.5">
      {photos.map((photo) => (
        <li key={photo.id} className="bg-muted relative aspect-square overflow-hidden rounded-md">
          {photo.signedUrl ? (
            <Image
              src={photo.signedUrl}
              alt={photo.caption ?? ""}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="text-muted-foreground flex h-full items-center justify-center">
              <ImageOff className="size-4" aria-hidden />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
