import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "npm:@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "npm:@modelcontextprotocol/sdk/types.js";
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

// Initialize Supabase Client for the execute environment
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Create MCP Server
const server = new Server(
  { name: "muze-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Define Code Mode Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search the muze-os-api contract (api-contract-v1.json). The LLM writes JS code to filter the spec. The API spec contains 'tasks', 'projects', 'quotes', 'events', etc.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript async arrow function to search the spec. Example: `async (spec) => { return spec.resources.tasks; }`"
            }
          },
          required: ["code"]
        }
      },
      {
        name: "execute",
        description: "Execute JavaScript code against the Muze OS Supabase Postgres Database. You have access to a `supabase` client instance (auth'd as service_role).",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript async arrow function to execute. Example: `async (supabase) => { const { data } = await supabase.from('tasks').select('*').limit(2); return data; }`"
            }
          },
          required: ["code"]
        }
      }
    ]
  };
});

// Mocked Spec for the `search` tool (In production this could fetch the JSON)
const spec = {
  "name": "muze-os-api",
  "version": "1.1.0",
  "resources": {
    "tasks": { "list": "GET /api/tasks", "create": "POST /api/tasks", "update": "PATCH /api/tasks/:id" },
    "projects": { "list": "GET /api/projects", "create": "POST /api/projects" },
    "quotes": { "list": "GET /api/quotes" }
  },
  "tables": ["tasks", "commercial_projects", "commercial_quotes", "events"]
};

// Handle Tool Execution (The 'Code Mode' sandbox evaluation)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  return new Promise((resolve, reject) => {
    try {
      // Spawn an isolated Web Worker for safe execution
      const workerUrl = new URL('./worker/sandbox.ts', import.meta.url).href;

      // Deno extension: Workers can be run with restricted permissions
      const worker = new Worker(workerUrl, { type: "module" });

      const reqId = crypto.randomUUID();

      worker.onmessage = async (e) => {
        const { reqId: id, success, result, error } = e.data;
        if (id === reqId) {
          worker.terminate();

          if (success) {
            try {
              // Log Event to Audit Log if it was an execution
              if (name === "execute") {
                const supabase = createClient(supabaseUrl, supabaseKey);
                await supabase.from('events').insert({
                  source: 'system',
                  channel: 'system',
                  type: 'mcp_execute_eval',
                  event_id: crypto.randomUUID(),
                  meta: { code_executed: args?.code, result_status: 'success' }
                });
              }
            } catch (logErr) {
              console.error("Failed to append audit log", logErr);
            }

            resolve({
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            });
          } else {
            resolve({
              content: [{ type: "text", text: `Error executing code: ${error}` }],
              isError: true
            });
          }
        }
      };

      worker.onerror = (e) => {
        worker.terminate();
        resolve({
          content: [{ type: "text", text: `Worker runtime error: ${e.message}` }],
          isError: true
        });
      };

      // Post the evaluation request to the Sandbox
      if (name === "search") {
        worker.postMessage({ type: 'search', reqId, code: args?.code, payload: spec });
      } else if (name === "execute") {
        worker.postMessage({ type: 'execute', reqId, code: args?.code, payload: { url: supabaseUrl, key: supabaseKey } });
      } else {
        worker.terminate();
        reject(new Error(`Tool not found: ${name}`));
      }

    } catch (error: any) {
      resolve({ content: [{ type: "text", text: `Failed to spawn sandbox: ${error.message}` }], isError: true });
    }
  });
});

// SSE Transport Map
const activeTransports = new Map<string, SSEServerTransport>();

// Deno Edge Function HTTP Server Handler
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // 1. Healthcheck
  if (req.method === "GET" && (path === "/" || path.endsWith("/muze-mcp-server") || path.endsWith("/muze-mcp-server/"))) {
    return new Response(JSON.stringify({ status: "ok", service: "muze-mcp-server", path }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // 2. SSE Connection Endpoint
  if (req.method === "GET" && path.endsWith("/mcp/sse")) {
    const { readable, writable } = new TransformStream();

    // Setup transport using standard Web Streams
    const writer = writable.getWriter();
    const transport = new SSEServerTransport("/mcp/messages", {
      setHeader: () => { },
      writeHead: () => { },
      write: (chunk: string) => writer.write(new TextEncoder().encode(chunk)),
      end: () => writer.close()
    } as any);

    await server.connect(transport);
    const sessionId = transport.sessionId;
    activeTransports.set(sessionId, transport);

    transport.onclose = () => {
      activeTransports.delete(sessionId);
    };

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // 3. Messages Endpoint (Tool execution requests)
  if (req.method === "POST" && path.endsWith("/mcp/messages")) {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });

    const transport = activeTransports.get(sessionId);
    if (!transport) return new Response("Session not found", { status: 404 });

    const body = await req.json();
    await transport.handlePostMessage({ body } as any);

    return new Response("Accepted", { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  return new Response(`Not Found: ${path}`, { status: 404 });
});
      }
    });
  }

// 3. Messages Endpoint (Tool execution requests)
if (url.pathname === "/mcp/messages" && req.method === "POST") {
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return new Response("Missing sessionId", { status: 400 });

  const transport = activeTransports.get(sessionId);
  if (!transport) return new Response("Session not found", { status: 404 });

  // Mock the Express req object structure expected by SSEServerTransport
  const body = await req.json();
  await transport.handlePostMessage({ body } as any);

  return new Response("Accepted", { status: 202 });
}

return new Response("Not Found", { status: 404 });
});
