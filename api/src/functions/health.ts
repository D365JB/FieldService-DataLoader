import {
  app,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";

/**
 * Anonymous, dependency-free health probe. The App Insights availability
 * test hits this every 5 min from multiple regions; it must NOT touch
 * AOAI, storage, or any other downstream — it should fail only when the
 * Functions host itself is unreachable.
 */
export async function health(
  _req: HttpRequest,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    jsonBody: {
      status: "ok",
      time: new Date().toISOString(),
    },
  };
}

app.http("health", {
  route: "health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: health,
});
