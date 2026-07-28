"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SAMPLE_DOCUMENTS } from "@/plugins/document-intelligence/mock-documents";
import { processDocument } from "@/plugins/document-intelligence/pipeline";
import type { DocumentRecord } from "@/plugins/document-intelligence/types";

/**
 * No real file upload/OCR happens in this milestone — "uploading" means
 * picking one of mock-documents.ts's fixtures to run through the pipeline,
 * exactly where a real file picker + OCRProvider would plug in instead
 * (see plugins/document-intelligence/ocr.ts).
 */
export default function DocumentUpload({
  onProcessed,
  disabled,
}: {
  onProcessed: (record: DocumentRecord) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(SAMPLE_DOCUMENTS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    setBusy(true);
    setError(null);
    try {
      const sample = SAMPLE_DOCUMENTS.find((s) => s.id === selectedId)!;
      const record = await processDocument({
        id: crypto.randomUUID(),
        fileName: sample.fileName,
        mimeType: sample.mimeType,
        sizeBytes: sample.sizeBytes,
        uploadedAt: new Date().toISOString(),
        mockTextKey: sample.mockTextKey,
      });
      onProcessed(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="document-upload-sample" className="text-xs">
          Upload a document (sample fixture — no real OCR)
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedId} onValueChange={(value) => value && setSelectedId(value)}>
            <SelectTrigger id="document-upload-sample" className="w-full sm:w-72">
              <SelectValue>{(value: string) => SAMPLE_DOCUMENTS.find((s) => s.id === value)?.fileName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_DOCUMENTS.map((sample) => (
                <SelectItem key={sample.id} value={sample.id}>
                  {sample.fileName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="xs" onClick={handleUpload} disabled={busy || disabled}>
            {busy ? "Processing…" : "Upload"}
          </Button>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}
