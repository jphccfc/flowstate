import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

process.env.LITELLM_BASE_URL ??= "http://litellm.test:4000";
process.env.LITELLM_API_KEY ??= "test-gateway-key";
process.env.AI_MODEL ??= "flowstate-test-model";
