"use client";

import { useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ChartExport, { type CsvExportData } from "./ChartExport";

/**
 * The "card that wraps a chart with header/filters/legend/export" concept —
 * named ChartCard (not ChartContainer) so it doesn't collide with
 * components/ui/chart.tsx's ChartContainer, the lower-level Recharts/
 * CSS-var wrapper every chart still mounts underneath this.
 */
export default function ChartCard({
  title,
  description,
  filters,
  legend,
  csvData,
  children,
  className,
}: {
  title: string;
  description?: string;
  filters?: ReactNode;
  legend?: ReactNode;
  csvData?: CsvExportData;
  children: ReactNode;
  className?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const exportFileName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-1">
          <ChartExport targetRef={captureRef} fileName={exportFileName} csvData={csvData} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Expand chart"
            title="Expand chart"
            onClick={() => setFullscreen(true)}
          >
            <Maximize2 />
          </Button>
        </div>
      </CardHeader>
      {filters && <CardContent className="pt-0">{filters}</CardContent>}
      <CardContent>
        <div ref={captureRef} className="bg-card flex flex-col gap-4">
          {children}
          {legend}
        </div>
      </CardContent>
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex flex-col gap-4">
            {children}
            {legend}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
