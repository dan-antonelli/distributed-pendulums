import { create } from "@bufbuild/protobuf";
import { PingSchema } from "@pendulums/shared";

const ping = create(PingSchema, { text: "pendulum up" });
console.log(ping.text);
