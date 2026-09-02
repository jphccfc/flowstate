import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });
if (process.env.FLOWSTATE_TEST_DATABASE_URL) { process.env.DATABASE_URL = process.env.FLOWSTATE_TEST_DATABASE_URL; process.env.DIRECT_URL = process.env.FLOWSTATE_TEST_DATABASE_URL; }

process.env.LITELLM_BASE_URL ??= "http://litellm.test:4000";
process.env.LITELLM_API_KEY ??= "test-gateway-key";
process.env.AI_MODEL ??= "flowstate-test-model";
