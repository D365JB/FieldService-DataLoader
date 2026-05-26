import {
  app,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAppKey } from "../lib/requireAppKey";

const AOAI_DEPLOYMENT = process.env.AOAI_DEPLOYMENT ?? "gpt-4o-mini";
const AOAI_ALLOWED_DEPLOYMENTS = (process.env.AOAI_ALLOWED_DEPLOYMENTS ?? AOAI_DEPLOYMENT)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-app-key, x-fsdl-session",
    Vary: "Origin",
  };
}

/** Returns the list of AOAI deployments the client may pick from. */
export async function listModels(
  req: HttpRequest,
): Promise<HttpResponseInit> {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return { status: 204, headers: cors };
  }
  const gate = requireAppKey(req, cors);
  if (gate) return gate;
  return {
    status: 200,
    headers: cors,
    jsonBody: {
      models: AOAI_ALLOWED_DEPLOYMENTS,
      default: AOAI_DEPLOYMENT,
    },
  };
}

app.http("listModels", {
  route: "models",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: listModels,
});
