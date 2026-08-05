import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/engine";
import { functions } from "@/lib/jobs/registry";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
