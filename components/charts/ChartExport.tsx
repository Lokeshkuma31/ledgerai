"use client";

import type { RefObject } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CsvExportData {
  headers: string[];
  rows: (string | number)[][];
}

function escapeCsvValue(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv(data: CsvExportData, fileName: string): void {
  const lines = [
    data.headers.map(escapeCsvValue).join(","),
    ...data.rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), `${fileName}.csv`);
}

/** html2canvas/jspdf are dynamically imported so their (non-trivial) bundle cost is only paid when a user actually exports, not on every analytics page load. */
async function captureCanvas(target: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  const background = getComputedStyle(document.body).backgroundColor;
  return html2canvas(target, { backgroundColor: background, scale: 2 });
}

async function exportPng(target: HTMLElement, fileName: string): Promise<void> {
  const canvas = await captureCanvas(target);
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${fileName}.png`);
  }, "image/png");
}

async function exportPdf(target: HTMLElement, fileName: string): Promise<void> {
  const [canvas, { default: jsPDF }] = await Promise.all([
    captureCanvas(target),
    import("jspdf"),
  ]);
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${fileName}.pdf`);
}

async function printChart(target: HTMLElement, fileName: string): Promise<void> {
  const canvas = await captureCanvas(target);
  const dataUrl = canvas.toDataURL("image/png");
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(
    `<html><head><title>${fileName}</title></head><body style="margin:0"><img src="${dataUrl}" style="width:100%" /></body></html>`,
  );
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };
}

export default function ChartExport({
  targetRef,
  fileName,
  csvData,
  className,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
  csvData?: CsvExportData;
  className?: string;
}) {
  const [pending, setPending] = useState<"png" | "pdf" | "print" | null>(null);

  async function withPending(kind: "png" | "pdf" | "print", action: (target: HTMLElement) => Promise<void>) {
    const target = targetRef.current;
    if (!target || pending) return;
    setPending(kind);
    try {
      await action(target);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {csvData && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Export as CSV"
          title="Export as CSV"
          onClick={() => exportCsv(csvData, fileName)}
        >
          <FileSpreadsheet />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Export as PNG"
        title="Export as PNG"
        disabled={pending !== null}
        onClick={() => withPending("png", (target) => exportPng(target, fileName))}
      >
        <Download />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Export as PDF"
        title="Export as PDF"
        disabled={pending !== null}
        onClick={() => withPending("pdf", (target) => exportPdf(target, fileName))}
      >
        <FileText />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Print chart"
        title="Print chart"
        disabled={pending !== null}
        onClick={() => withPending("print", (target) => printChart(target, fileName))}
      >
        <Printer />
      </Button>
    </div>
  );
}
