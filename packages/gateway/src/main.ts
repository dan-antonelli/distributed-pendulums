import { create } from "@bufbuild/protobuf";
import { PingSchema } from "@pendulums/shared";

const ping = create(PingSchema, { text: "gateway up" });
console.log(ping.text);
