import { channel } from "node:diagnostics_channel";

const requests = new WeakMap();
let sequence = 0;
const observe =
  (event) =>
  ({ request, response, error }) => {
    try {
      if (event === "create") {
        sequence += 1;
        requests.set(request, { id: sequence, start: performance.now() });
      }
      const observed = requests.get(request);
      if (!observed) {
        return;
      }
      console.error(
        "[console-consumer-http]",
        JSON.stringify({
          elapsed_ms: Math.round(performance.now() - observed.start),
          error: error?.name,
          event,
          id: observed.id,
          method: request.method,
          path: request.path.split("?")[0],
          status: response?.statusCode,
        })
      );
    } catch {
      // Observation must not change request success or failure.
    }
  };
for (const event of ["create", "headers", "trailers", "error"]) {
  channel(`undici:request:${event}`).subscribe(observe(event));
}
