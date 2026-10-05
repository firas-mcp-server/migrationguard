#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// stdout carries the MCP protocol, so nothing else may write to it.
const root = process.env["MIGRATIONGUARD_ROOT"] ?? process.cwd();
await createServer(root).connect(new StdioServerTransport());
