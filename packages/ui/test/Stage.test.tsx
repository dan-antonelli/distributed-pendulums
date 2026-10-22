import { PendulumPhase } from "@pendulums/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { MAX_GRID_LINES, Stage } from "../src/components/Stage";
import { view } from "./support";

const { HALTED, WAITING } = PendulumPhase;
const zoomLevel = () => screen.getByRole("button", { name: "Fit to the box" });

describe("Stage", () => {
  test("renders one bob per pendulum in the snapshot", () => {
    render(<Stage pendulums={[view(1), view(2), view(3)]} />);
    expect(screen.getByRole("img", { name: "3 pendulums" })).toBeInTheDocument();
    for (const id of [1, 2, 3]) expect(screen.getByText(String(id))).toBeInTheDocument();
  });

  test("draws a bounded number of grid lines even for an extreme config", () => {
    const far = view(2);
    far.config!.anchorXM = 5000;
    const { container } = render(<Stage pendulums={[view(1), far]} />);
    expect(container.querySelectorAll(".grid line").length).toBeLessThanOrEqual(2 * MAX_GRID_LINES);
  });

  test("the status shows the collision and the restart countdown", () => {
    render(<Stage pendulums={[view(1, { phase: WAITING, restartInMs: 3200 }), view(2, { phase: HALTED })]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Collision. Restarting in 3.2 s");
  });

  test("the status says it is waiting for confirmations before any countdown", () => {
    render(<Stage pendulums={[view(1, { phase: HALTED }), view(2, { phase: HALTED })]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Collision. Waiting for every pendulum to confirm");
  });

  test("zoom in raises the label up to the limit", async () => {
    const user = userEvent.setup();
    render(<Stage pendulums={[view(1)]} />);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });

    expect(zoomLevel()).toHaveTextContent("100%");
    for (const label of ["150%", "200%", "300%"]) {
      await user.click(zoomIn);
      expect(zoomLevel()).toHaveTextContent(label);
    }
    expect(zoomIn).toBeDisabled();
  });

  test("zoom out lowers the label down to the limit", async () => {
    const user = userEvent.setup();
    render(<Stage pendulums={[view(1)]} />);
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });

    for (const label of ["75%", "50%"]) {
      await user.click(zoomOut);
      expect(zoomLevel()).toHaveTextContent(label);
    }
    expect(zoomOut).toBeDisabled();
  });
});
