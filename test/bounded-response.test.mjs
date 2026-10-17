import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedResponseText } from "../src/utils/read-bounded-response.mjs";

test("bounded response reader accepts chunked UTF-8 payloads within the byte limit", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"message":"'));
      controller.enqueue(encoder.encode("héllo"));
      controller.enqueue(encoder.encode('"}'));
      controller.close();
    }
  });
  const result = await readBoundedResponseText(new Response(body), {
    maxBytes: 64,
    message: "too large",
    code: "response_too_large"
  });
  assert.equal(result, '{"message":"héllo"}');
});

test("bounded response reader cancels a body as soon as the byte limit is crossed", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
    },
    cancel() { cancelled = true; }
  });
  await assert.rejects(
    readBoundedResponseText(new Response(body), { maxBytes: 10, message: "too large", code: "response_too_large" }),
    (error) => error.code === "response_too_large" && error.status === 502
  );
  assert.equal(cancelled, true);
});

test("bounded response reader applies the same byte limit when no stream body is exposed", async () => {
  const response = { body: null, text: async () => "12345" };
  await assert.rejects(
    readBoundedResponseText(response, { maxBytes: 4, message: "too large", code: "response_too_large" }),
    (error) => error.code === "response_too_large" && error.status === 502
  );
});
