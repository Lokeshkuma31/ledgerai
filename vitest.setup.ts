import { config as loadEnv } from "dotenv";
import "@testing-library/jest-dom/vitest";

loadEnv({ path: ".env.local" });
