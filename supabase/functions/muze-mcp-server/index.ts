import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "npm:@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "npm:@modelcontextprotocol/sdk/types.js";
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Create MCP Server
const server = new Server(
  { name: "muze-mcp-server", version: "1.2.0" },
  { capabilities: { tools: {} } }
);

// Define Code Mode Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search the Muze OS API contract (resources, endpoints, fields). The agent writes JS to filter the spec.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript async arrow function to search the spec. Example: `async (spec) => spec.resources.finance`"
            }
          },
          required: ["code"]
        }
      },
      {
        name: "execute",
        description: "Execute autonomous JavaScript code against the Muze OS backend. Use the `muze.request()` client to perform CRUD.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "JavaScript async arrow function to execute. Example: `async (muze) => await muze.request({ method: 'GET', path: '/tasks' })`"
            }
          },
          required: ["code"]
        }
      }
    ]
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  return new Promise((resolve) => {
    try {
      const workerUrl = new URL('./worker/sandbox.ts', import.meta.url).href;
      const worker = new Worker(workerUrl, { type: "module" });
      const reqId = crypto.randomUUID();

      worker.onmessage = async (e) => {
        const { reqId: id, success, result, error } = e.data;
        if (id === reqId) {
          worker.terminate();
          if (success) {
            // Log successful execution (Simplified audit)
            if (name === "execute") {
              const supabase = createClient(supabaseUrl, supabaseKey);
              await supabase.from('events').insert({
                source: 'system',
                channel: 'system',
                type: 'mcp_execute_eval',
                meta: { code_executed: args?.code, success: true }
              });
            }
            resolve({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
          } else {
            resolve({ content: [{ type: "text", text: `Error: ${error}` }], isError: true });
          }
        }
      };

      worker.onerror = (e) => {
        worker.terminate();
        resolve({ content: [{ type: "text", text: `Runtime error: ${e.message}` }], isError: true });
      };

      // Payload Provisioning
      if (name === "search") {
        // In a real environment, we'd fetch the live JSON. For now, we mock the core structure or try to fetch it.
        const specUrl = `${supabaseUrl}/rest/v1/storage/v1/object/public/system/api-contract-v1.json`;
        // Alternative: Use a consolidated version of what we know.
        worker.postMessage({ type: 'search', reqId, code: args?.code, payload: { resources: ["tasks", "projects", "finance", "commercial", "accounts"], contract_version: "1.2.0" } });
      } else if (name === "execute") {
        worker.postMessage({ type: 'execute', reqId, code: args?.code, payload: { url: supabaseUrl, key: supabaseKey } });
      }

    } catch (error: any) {
      resolve({ content: [{ type: "text", text: `Fatal: ${error.message}` }], isError: true });
    }
  });
});

const activeTransports = new Map<string, SSEServerTransport>();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 1. Healthcheck
  if (req.method === "GET" && (path === "/" || path.endsWith("/mcp"))) {
    return new Response(JSON.stringify({ status: "alive", service: "muze-mcp-server" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // 2. SSE Connection
  if (req.method === "GET" && path.endsWith("/mcp/sse")) {
    const { readable, writable } = new TransformStream();
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

    transport.onclose = () => { activeTransports.delete(sessionId); };

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  // 3. Messages
  if (req.method === "POST" && path.endsWith("/mcp/messages")) {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400, headers: corsHeaders });

    const transport = activeTransports.get(sessionId);
    if (!transport) return new Response("Session not found", { status: 404, headers: corsHeaders });

    const body = await req.json();
    await transport.handlePostMessage({ body } as any);

    return new Response("Accepted", { status: 202, headers: corsHeaders });
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
