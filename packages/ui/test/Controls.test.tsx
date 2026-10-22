import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Panel } from "./Panel";
import { createFakeService, renderWithTransport, view } from "./support";

const length = (id: number) => screen.getByRole("spinbutton", { name: `String length in meters, pendulum ${id}` });
const mass = (id: number) => screen.getByRole("spinbutton", { name: `Mass in kilograms, pendulum ${id}` });
const start = () => screen.getByRole("button", { name: "Start" });

async function enter(user: ReturnType<typeof userEvent.setup>, box: HTMLElement, value: string) {
  await user.clear(box);
  await user.type(box, value);
}

describe("Controls", () => {
  test("Start with no drafts sends only Start", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, fake);

    await user.click(start());

    await waitFor(() => expect(fake.methods()).toEqual(["start"]));
  });

  test("Start with drafts sends UpdateConfig for each changed row, then Start", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, fake);
    await enter(user, length(1), "2");
    await enter(user, mass(2), "3");

    await user.click(start());

    await waitFor(() => expect(fake.methods()).toEqual(["updateConfig", "updateConfig", "start"]));
    expect(fake.calls[0]!.request).toMatchObject({ id: 1, lengthM: 2 });
    expect(fake.calls[1]!.request).toMatchObject({ id: 2, massKg: 3 });
  });

  test("a failed UpdateConfig stops Start, shows the error in that row and keeps the drafts", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    fake.failUpdate(1, "length_m must be between 0.1 and 5");
    renderWithTransport(<Panel pendulums={[view(1), view(2)]} />, fake);
    await enter(user, length(1), "9");
    await enter(user, mass(2), "3");

    await user.click(start());

    expect(await screen.findByRole("alert")).toHaveTextContent("Pendulum 1: Length must be between 0.1 and 5");
    expect(fake.methods()).toEqual(["updateConfig"]);
    expect(length(1)).toHaveValue(9);
    expect(mass(2)).toHaveValue(3);
  });

  test("Start is disabled while drafts are being applied", async () => {
    const user = userEvent.setup();
    const fake = createFakeService();
    const release = fake.holdUpdates();
    renderWithTransport(<Panel pendulums={[view(1)]} />, fake);
    await enter(user, length(1), "2");

    await user.click(start());
    await waitFor(() => expect(start()).toBeDisabled());

    release();
    await waitFor(() => expect(fake.methods()).toEqual(["updateConfig", "start"]));
    await waitFor(() => expect(start()).toBeEnabled());
  });
});
