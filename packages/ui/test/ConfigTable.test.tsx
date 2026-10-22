import { PendulumPhase } from "@pendulums/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Panel } from "./Panel";
import { createFakeService, renderWithTransport, view } from "./support";

const length = (id: number) => screen.getByRole("spinbutton", { name: `String length in meters, pendulum ${id}` });
const apply = (id: number) => screen.getByRole("button", { name: `Apply, pendulum ${id}` });
const reset = (id: number) => screen.getByRole("button", { name: `Reset, pendulum ${id}` });
const resetToDefaults = () => screen.getByRole("button", { name: "Reset to defaults" });

async function setLength(user: ReturnType<typeof userEvent.setup>, id: number, value: string) {
  await user.clear(length(id));
  await user.type(length(id), value);
}

describe("ConfigTable", () => {
  test("editing a field enables Apply and Reset, and Reset reverts the value and disables itself", async () => {
    const user = userEvent.setup();
    renderWithTransport(<Panel pendulums={[view(1)]} />, createFakeService());
    expect(apply(1)).toBeDisabled();
    expect(reset(1)).toBeDisabled();

    await setLength(user, 1, "2");
    expect(length(1)).toHaveValue(2);
    expect(apply(1)).toBeEnabled();
    expect(reset(1)).toBeEnabled();

    await user.click(reset(1));
    expect(length(1)).toHaveValue(1);
    expect(reset(1)).toBeDisabled();
  });

  test("Apply sends only the changed fields for that row", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, fake);

    await setLength(user, 2, "2");
    await user.click(apply(2));

    await waitFor(() => expect(fake.calls).toHaveLength(1));
    const { method, request } = fake.calls[0]!;
    expect(method).toBe("updateConfig");
    expect(request).toMatchObject({ id: 2, lengthM: 2 });
    expect(request.anchorXM).toBeUndefined();
    expect(request.massKg).toBeUndefined();
    expect(request.initialAngleRad).toBeUndefined();
  });

  test("a rejected Apply shows the error in that row", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    fake.failUpdate(2, "length_m must be between 0.1 and 5");
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, fake);

    await setLength(user, 2, "9");
    await user.click(apply(2));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pendulum 2: Length must be between 0.1 and 5");
    expect(length(2)).toHaveValue(9);
  });

  test("rows are locked while running, and so is Reset to defaults", () => {
    renderWithTransport(<Panel pendulums={[view(1, { phase: PendulumPhase.RUNNING })]} />, createFakeService());
    expect(length(1)).toBeDisabled();
    expect(resetToDefaults()).toBeDisabled();
  });

  test("Reset to defaults sends ResetConfig when stopped and drops unapplied edits", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1)]} />, fake);

    await setLength(user, 1, "2");
    await user.click(resetToDefaults());

    await waitFor(() => expect(fake.methods()).toEqual(["resetConfig"]));
    await waitFor(() => expect(length(1)).toHaveValue(1));
  });
});
