import { adminContext } from "@/lib/api-utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastId: string | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { close(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      };
      write("ready", { at: new Date().toISOString() });
      void context.db.latestActivityId(context.userId).then((id) => { lastId = id; }).catch(() => undefined);
      timer = setInterval(async () => {
        if (closed) return;
        try {
          const current = await context.db.latestActivityId(context.userId);
          if (current && current !== lastId) {
            lastId = current;
            write("activity", { at: new Date().toISOString() });
          } else {
            write("heartbeat", { at: new Date().toISOString() });
          }
        } catch {
          write("degraded", { message: "Activity stream sementara tidak tersedia." });
        }
      }, 5000);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
