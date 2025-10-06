"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DrilldownDataset {
  key: string;
  label: string;
  columns: ColumnDef<any, any>[];
  data: any[];
  emptyMessage?: string;
  onRowClick?: (row: any) => void;
}

interface DrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  datasets: DrilldownDataset[];
  footerButtonText?: string;
  initialKey?: string;
}

export function DrilldownDialog({
  open,
  onOpenChange,
  title,
  description,
  datasets,
  footerButtonText = "Close",
  initialKey,
}: DrilldownDialogProps) {
  const [activeKey, setActiveKey] = useState<string>(() => initialKey ?? datasets[0]?.key ?? "");

  useEffect(() => {
    if (!datasets.length) {
      setActiveKey("");
      return;
    }
    if (initialKey && datasets.find((ds) => ds.key === initialKey)) {
      setActiveKey(initialKey);
      return;
    }
    setActiveKey(datasets[0].key);
  }, [datasets, initialKey]);

  const activeDataset = useMemo(() => {
    if (!datasets.length) return null;
    return datasets.find((dataset) => dataset.key === activeKey) ?? datasets[0];
  }, [datasets, activeKey]);

  const tabsValue = activeKey || datasets[0]?.key || undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-meta-border bg-meta-card text-meta-light">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-meta-muted">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {datasets.length > 1 ? (
          <Tabs value={tabsValue} onValueChange={setActiveKey}>
            <TabsList className="mb-4 flex gap-2 border border-meta-border bg-meta-dark/60 p-1">
              {datasets.map((dataset) => (
                <TabsTrigger
                  key={dataset.key}
                  value={dataset.key}
                  className={cn(
                    'rounded-md border border-transparent px-4 py-2 text-sm font-medium transition-colors',
                    dataset.key === tabsValue
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30 hover:bg-sky-400'
                      : 'text-meta-muted hover:text-meta-light hover:border-meta-border/60'
                  )}
                >
                  {dataset.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {datasets.map((dataset) => (
              <TabsContent key={dataset.key} value={dataset.key}>
                {dataset.data.length ? (
                  <DataTable
                    columns={dataset.columns}
                    data={dataset.data}
                    onRowClick={dataset.onRowClick}
                    scrollContainerClassName="max-h-96 overflow-y-auto"
                  />
                ) : (
                  <div className="rounded border border-meta-border/60 bg-meta-dark/40 px-3 py-2 text-sm text-meta-muted">
                    {dataset.emptyMessage ?? "No data available."}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : activeDataset ? (
          activeDataset.data.length ? (
            <DataTable
              columns={activeDataset.columns}
              data={activeDataset.data}
              onRowClick={activeDataset.onRowClick}
              scrollContainerClassName="max-h-96 overflow-y-auto"
            />
          ) : (
            <div className="rounded border border-meta-border/60 bg-meta-dark/40 px-3 py-2 text-sm text-meta-muted">
              {activeDataset.emptyMessage ?? "No data available."}
            </div>
          )
        ) : (
          <div className="rounded border border-meta-border/60 bg-meta-dark/40 px-3 py-2 text-sm text-meta-muted">
            No data available.
          </div>
        )}

        <div className="pt-4">
          <DialogClose asChild>
            <Button className="w-full" variant="secondary">
              {footerButtonText}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { DrilldownDataset };
