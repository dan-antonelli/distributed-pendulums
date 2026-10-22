import { PendulumPhase } from "@pendulums/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Panel } from "./Panel";
import { createFakeService, renderWithTransport, view } from "./support";

const length = (id: number) => screen.getByRole("spinbutton", { name: `String length in meters, pendulum ${id}` });
const start = () => screen.getByRole("button", { name: "Start" });
const apply = (id: number) => screen.getByRole("button", { name: `Apply, pendulum ${id}` });
const reset = (id: number) => screen.getByRole("button", { name: `Reset, pendulum ${id}` });
const hint = "Apply or reset your changes to start";

async function enter(user: ReturnType<typeof userEvent.setup>, box: HTMLElement, value: string) {
  await user.clear(box);
  await user.type(box, value);
}

describe("Controls", () => {
  test("Start sends only Start", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, fake);

    expect(start()).not.toHaveAccessibleDescription();
    await user.click(start());

    await waitFor(() => expect(fake.methods()).toEqual(["start"]));
  });

  test("Pause sends only Pause while running", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1, { phase: PendulumPhase.RUNNING })]} />, fake);

    await user.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() => expect(fake.methods()).toEqual(["pause"]));
  });

  test("Stop sends only Stop while running", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1, { phase: PendulumPhase.RUNNING })]} />, fake);

    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(fake.methods()).toEqual(["stop"]));
  });

  test("Start is disabled with a hint while a draft is pending", async () => {
    const user = userEvent.setup();
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, createFakeService());

    await enter(user, length(1), "2");

    expect(start()).toBeDisabled();
    expect(start()).toHaveAccessibleDescription(hint);
  });

  test("Apply re-enables Start", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1)]} />, fake);
    await enter(user, length(1), "2");

    await user.click(apply(1));

    await waitFor(() => expect(start()).toBeEnabled());
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    await user.click(start());
    await waitFor(() => expect(fake.methods()).toEqual(["updateConfig", "start"]));
  });

  test("Reset re-enables Start", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1)]} />, fake);
    await enter(user, length(1), "2");

    await user.click(reset(1));

    expect(start()).toBeEnabled();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    await user.click(start());
    await waitFor(() => expect(fake.methods()).toEqual(["start"]));
  });
});
