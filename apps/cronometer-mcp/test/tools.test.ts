import { beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { recipeServingPortion, registerCronometerTools } from "@cronometer-mcp/core";
import { createServer } from "../src/index";

let client: Client;

beforeAll(async () => {
  const server: Server = (createServer() as unknown as { server: Server }).server;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

describe("registered tool surface", () => {
  it("lists the full mobile + export tool set", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      "add_custom_food",
      "add_food_entry",
      "add_recipe",
      "connection_status",
      "copy_day",
      "get_biometrics",
      "get_cronometer_data",
      "get_daily_nutrition",
      "get_fasting_history",
      "get_fasting_stats",
      "get_food_details",
      "get_food_log",
      "get_macro_targets",
      "list_biometrics",
      "mark_day_complete",
      "remove_food_entry",
      "search_foods",
    ]);
  });

  it("exposes JSON schemas for every tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} inputSchema`).toHaveProperty("type");
    }
  });

  it("blocks recipe creation unless the authorization grant records write consent", async () => {
    const protectedServer = new McpServer({ name: "write-consent-test", version: "0.0.0" });
    registerCronometerTools(protectedServer, {
      getAuthContext: () => ({
        cronometerMobileSession: { sessionKey: "test-session", userId: 1 },
        cronometerUsername: "test@example.com",
        cronometerWebSession: { cookies: "test-session", userId: "1" },
        cronometerWriteConsent: false,
        cronometerAccessScopes: ["cronometer:read"],
      }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const testClient = new Client({ name: "write-consent-test", version: "0.0.0" });
    await Promise.all([
      protectedServer.connect(serverTransport),
      testClient.connect(clientTransport),
    ]);

    const result = await testClient.callTool({
      name: "add_recipe",
      arguments: { ingredients: [{ foodId: 1, grams: 100 }], name: "Must not be created" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("cronometer:write"),
    });
    await testClient.close();
    await protectedServer.close();
  });

  it("blocks write calls made with a downscoped read-only access token", async () => {
    const protectedServer = new McpServer({ name: "downscope-test", version: "0.0.0" });
    registerCronometerTools(protectedServer, {
      getAuthContext: () => ({
        cronometerMobileSession: { sessionKey: "test-session", userId: 1 },
        cronometerUsername: "test@example.com",
        cronometerWebSession: { cookies: "test-session", userId: "1" },
        cronometerWriteConsent: true,
        cronometerAccessScopes: ["cronometer:read"],
      }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const testClient = new Client({ name: "downscope-test", version: "0.0.0" });
    await Promise.all([
      protectedServer.connect(serverTransport),
      testClient.connect(clientTransport),
    ]);

    const result = await testClient.callTool({
      name: "add_recipe",
      arguments: { ingredients: [{ foodId: 1, grams: 100 }], name: "Must not be created" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("cronometer:write"),
    });
    await testClient.close();
    await protectedServer.close();
  });

  it("advertises a servings count for equal-weight recipe portions", async () => {
    const { tools } = await client.listTools();
    const recipeTool = tools.find((tool) => tool.name === "add_recipe");
    expect(recipeTool?.inputSchema.properties).toHaveProperty("servings");
  });

  it("turns a six-serving recipe into six equal-weight measures", () => {
    expect(recipeServingPortion({ totalGrams: 1_200, servings: 6 })).toEqual({
      servingGrams: 200,
      servingName: "1 of 6 servings",
      servings: 6,
    });
  });
});
