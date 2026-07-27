"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AndroidSmsPluginSettings, UnknownMerchantHandling } from "@/plugins/android-sms/types";

const UNKNOWN_MERCHANT_LABELS: Record<UnknownMerchantHandling, string> = {
  "import-as-unknown": "Import without a merchant",
  skip: "Skip the row",
  "flag-for-review": "Import and flag for review",
};

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export default function SMSPluginSettings({
  settings,
  onChange,
}: {
  settings: AndroidSmsPluginSettings;
  onChange: (next: Partial<AndroidSmsPluginSettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sms-supported-banks" className="text-xs">
          Supported Banks
        </Label>
        <Input
          id="sms-supported-banks"
          value={settings.supportedBanks.join(", ")}
          onChange={(e) => onChange({ supportedBanks: parseList(e.target.value) })}
          placeholder="HDFC Bank, ICICI Bank, ..."
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sms-supported-wallets" className="text-xs">
          Supported Wallets
        </Label>
        <Input
          id="sms-supported-wallets"
          value={settings.supportedWallets.join(", ")}
          onChange={(e) => onChange({ supportedWallets: parseList(e.target.value) })}
          placeholder="Google Pay, PhonePe, ..."
        />
      </div>
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="sms-duplicate-tolerance" className="text-xs">
            Duplicate Tolerance (minutes)
          </Label>
          <Input
            id="sms-duplicate-tolerance"
            type="number"
            min={0}
            value={settings.duplicateToleranceMinutes}
            onChange={(e) => onChange({ duplicateToleranceMinutes: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="sms-confidence-threshold" className="text-xs">
            Confidence Threshold (%)
          </Label>
          <Input
            id="sms-confidence-threshold"
            type="number"
            min={0}
            max={100}
            value={Math.round(settings.confidenceThreshold * 100)}
            onChange={(e) =>
              onChange({ confidenceThreshold: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })
            }
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sms-unknown-merchant" className="text-xs">
          Unknown Merchant Handling
        </Label>
        <Select
          value={settings.unknownMerchantHandling}
          onValueChange={(value) => onChange({ unknownMerchantHandling: value as UnknownMerchantHandling })}
        >
          <SelectTrigger id="sms-unknown-merchant" className="w-full">
            <SelectValue>
              {(value: UnknownMerchantHandling) => UNKNOWN_MERCHANT_LABELS[value]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(UNKNOWN_MERCHANT_LABELS) as UnknownMerchantHandling[]).map((value) => (
              <SelectItem key={value} value={value}>
                {UNKNOWN_MERCHANT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Auto Import</Label>
        <button
          type="button"
          onClick={() => onChange({ autoImport: !settings.autoImport })}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            settings.autoImport
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {settings.autoImport ? "Enabled" : "Disabled"}
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        Auto Import is a setting for a future milestone (background sync isn&apos;t implemented yet) — scanning and
        importing on this page is always a manual action regardless of this toggle.
      </p>
    </div>
  );
}
