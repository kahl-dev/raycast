import { describe, it, expect } from "vitest";
import { loadConfig, DEFAULT_CONFIG } from "./config";

const VALID_CONFIG = JSON.stringify({
  devices: [
    { name: "WH-1000XM6", label: "Sony XM6", priority: 1, icon: "sony-xm6", hidden: false },
    { name: "EDIFIER M60", label: "Edifier M60", priority: 3, icon: "edifier", hidden: false },
    { name: "Wave:3", label: "Wave:3 Headphones", priority: 4, icon: "wave3", hidden: false },
  ],
  inputGuard: "Wave:3",
  showAllDevices: false,
});

describe("loadConfig", () => {
  it("parses a valid config string", () => {
    const config = loadConfig(VALID_CONFIG);

    expect(config.devices).to.have.length(3);
    expect(config.devices[0].name).to.equal("WH-1000XM6");
    expect(config.inputGuard).to.equal("Wave:3");
    expect(config.showAllDevices).to.equal(false);
  });

  it("returns default config for invalid JSON", () => {
    const config = loadConfig("not valid json{{{");

    expect(config).to.deep.equal(DEFAULT_CONFIG);
  });

  it("returns default config for null input", () => {
    const config = loadConfig(null);

    expect(config).to.deep.equal(DEFAULT_CONFIG);
  });
});
