const encoder = new TextEncoder();

export function GET(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("sites-m0\n"));
      controller.enqueue(encoder.encode("stream-ok\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
