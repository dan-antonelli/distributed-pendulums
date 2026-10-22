import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "../src/App";
import { createFakeService, renderWithTransport, view } from "./support";

test("a snapshot from WatchPendulums appears in both the stage and the table", async () => {
  const fake = createFakeService();
  renderWithTransport(<App />, fake);
  expect(screen.getByText("No pendulum servers are running yet. They appear here as soon as they start.")).toBeInTheDocument();

  fake.push([view(1), view(2)]);

  expect(await screen.findByRole("img", { name: "2 pendulums" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "String length in meters, pendulum 2" })).toBeInTheDocument();
  expect(screen.getByText("Live, 2 servers")).toBeInTheDocument();
});
