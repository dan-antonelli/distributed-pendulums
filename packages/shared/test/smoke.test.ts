import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { expect, test } from "vitest";
import { PingSchema } from "../src";

test("a message survives encode and decode", () => {
  const sent = create(PingSchema, { text: "hello" });
  const received = fromBinary(PingSchema, toBinary(PingSchema, sent));
  expect(received.text).toBe("hello");
});
