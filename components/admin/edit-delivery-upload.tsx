"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { finalizeEditDelivery, prepareEditUpload } from "@/app/admin/orders/edit-delivery-actions";

/** Admin: upload the finished edit straight into the PRIVATE bucket, then attach it to the order. */
export function EditDeliveryUpload({ sessionId, delivered }: { sessionId: string; delivered: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(delivered ? "Edit delivered. Upload again to replace it." : null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg("Uploading… keep this page open.");
    try {
      const target = await prepareEditUpload(sessionId, file.name);
      const { error } = await createClient()
        .storage.from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || "video/mp4" });
      if (error) throw new Error(error.message);
      const r = await finalizeEditDelivery(sessionId, target.path);
      setMsg(
        "Delivered. The customer's order page now shows a download button. " +
          (r.emailed ? "They were emailed." : `No email sent (${r.emailNote ?? "unknown"}).`),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 text-sm">
      <label className="font-medium">Finished edit video (.mp4)</label>
      <input
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
        disabled={busy}
        onChange={(e) => onFile(e.target.files?.[0])}
        className="mt-1 block w-full"
      />
      {msg && <p className="mt-1 text-muted">{msg}</p>}
    </div>
  );
}
