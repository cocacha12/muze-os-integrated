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

// Define Tools
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
      },
      {
        name: "register_agent",
        description: "Register a new AI agent (entity) in the system or update existing config.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the agent (e.g., 'CFO')" },
            role: { type: "string", description: "Role description" },
            config: { type: "object", description: "Optional agent configuration" }
          },
          required: ["name", "role"]
        }
      },
      {
        name: "upload_file",
        description: "Upload a file to Muze OS storage and link it to a task.",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "The UUID of the task" },
            name: { type: "string", description: "Filename" },
            content: { type: "string", description: "Base64 encoded content" },
            type: { type: "string", description: "Mime type or extension" }
          },
          required: ["task_id", "name", "content"]
        }
      },
      {
        name: "get_workspace_context",
        description: "Returns the current state of the Muze OS workspace. Call this tool before creating tasks or projects if you are unsure about the allowed 'area', 'status', or who the current active 'assignees' (entities) are.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "orchestrate_project",
        description: "Complex tool to create an Account, a Project, and multiple Tasks in a single orchestrated flow. Ensures correct UUID linking.",
        inputSchema: {
          type: "object",
          properties: {
            account_name: { type: "string", description: "Name of the customer account" },
            project: {
              type: "object",
              properties: {
                name: { type: "string" },
                project_id: { type: "string", description: "Slug/Reference ID" },
                description: { type: "string" },
                stage: { type: "string" },
                amount: { type: "string" },
                currency: { type: "string" }
              },
              required: ["name", "project_id"]
            },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  area: { type: "string" },
                  status: { type: "string" },
                  priority: { type: "string" },
                  assignee: { type: "string", description: "Name of the person assigned to this task" },
                  reasoning: { type: "object" }
                },
                required: ["title"]
              }
            },
            finance: {
              type: "object",
              description: "Optional financial details to register as Revenue.",
              properties: {
                amount_net: { type: "number", description: "Net amount (without tax) in local currency" },
                tax_iva: { type: "number", description: "VAT/IVA amount in local currency" },
                status: { type: "string", description: "e.g., 'pending', 'paid'" }
              },
              required: ["amount_net"]
            }
          },
          required: ["account_name", "project"]
        }
      }
    ]
  };
});

// --- Shared Logic Functions ---
async function performOrchestration(args: any, supabase: any) {
  try {
    const { account_name, project, tasks = [], finance } = args;

    if (!account_name) throw new Error("Missing account_name");
    if (!project || !project.name) throw new Error("Missing project.name");

    // Dynamic Validation Fail-Safes for LLM Context Awareness
    const validTaskStatuses = ['todo', 'doing', 'done'];
    const validAreas = ['commercial', 'operations', 'finance', 'system'];

    for (const t of tasks) {
      if (t.status && !validTaskStatuses.includes(t.status)) {
        throw new Error(`Invalid task status '${t.status}' for task '${t.title}'. Valid statuses are: ${validTaskStatuses.join(', ')}. Please use the get_workspace_context tool to verify allowed schema values.`);
      }
      if (t.area && !validAreas.includes(t.area)) {
        throw new Error(`Invalid area '${t.area}' for task '${t.title}'. Valid areas are: ${validAreas.join(', ')}. Please use the get_workspace_context tool to verify allowed schema values.`);
      }
    }

    // 1. Get or Create Account
    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .select('id, account_id')
      .ilike('name', account_name)
      .maybeSingle();

    if (accErr) throw accErr;

    let accountId = acc?.account_id;

    if (!acc) {
      const slug = account_name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
      const { data: newAcc, error: createAccErr } = await supabase
        .from('accounts')
        .insert({ name: account_name, account_id: slug })
        .select()
        .maybeSingle();

      if (createAccErr) throw createAccErr;
      if (!newAcc) throw new Error(`Could not create account: ${account_name}`);
      accountId = newAcc.account_id;
    }

    // 2. Create/Update Project
    const projectReasoning = Array.isArray(project.reasoning) ? project.reasoning : (project.reasoning ? [project.reasoning] : []);
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .upsert({
        ...project,
        account_id: accountId,
        reasoning: projectReasoning,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (projErr) throw projErr;
    if (!proj) throw new Error(`Could not create/update project: ${project.name}`);

    // Emit Event for Project
    await supabase.from('events').insert({
      source: 'Kether',
      channel: 'commercial',
      type: 'PROJECT_ORCHESTRATED',
      meta: {
        summary: `Orquestado: ${proj.name}`,
        reasoning: projectReasoning[0] || { analysis: `Iniciando proyecto para ${account_name}` }
      }
    });

    // 3. Create Tasks
    let tasksCreatedCount = 0;
    if (tasks.length > 0) {
      // Pre-fetch entities to match assignees
      const { data: allEntities } = await supabase.from('entities').select('id, name');

      const tasksToInsert = tasks.map((t: any) => {
        let owner_id = null;
        if (t.assignee && allEntities) {
          const found = allEntities.find((e: any) =>
            e.name && e.name.toLowerCase().includes(t.assignee.toLowerCase())
          );
          if (found) owner_id = found.id;
        }

        const { assignee, ...restTask } = t;

        return {
          ...restTask,
          owner_id: owner_id,
          linked_project_id: proj.id,
          status: restTask.status || 'todo',
          reasoning: Array.isArray(restTask.reasoning) ? restTask.reasoning : (restTask.reasoning ? [restTask.reasoning] : [])
        };
      });

      const { data: createdTasks, error: tasksErr } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select();

      if (tasksErr) throw tasksErr;
      tasksCreatedCount = createdTasks?.length || 0;

      // Emit Events for Tasks
      const taskEvents = createdTasks.map((t: any) => ({
        source: 'Kether',
        channel: 'operations',
        type: 'TASK_CREATED',
        meta: {
          summary: `Tarea: ${t.title}`,
          reasoning: t.reasoning?.[0] || { analysis: `Nueva tarea vinculada a ${proj.name}` }
        }
      }));
      await supabase.from('events').insert(taskEvents);
    }

    // 4. Create Finance Record
    let financeCreated = false;
    if (finance && finance.amount_net) {
      const { error: finError } = await supabase.from('finance_revenues').insert({
        account_id: accountId,
        project_id: proj.id,
        source: 'Project Quoted',
        net: finance.amount_net,
        iva: finance.tax_iva || (finance.amount_net * 0.19),
        status: finance.status || 'pending',
        date: new Date().toISOString()
      });
      if (finError) throw finError;
      financeCreated = true;

      await supabase.from('events').insert({
        source: 'Kether',
        channel: 'finance',
        type: 'REVENUE_PROJECTED',
        meta: {
          summary: `Ingreso Proyectado: ${proj.name} - $${finance.amount_net}`,
          reasoning: { analysis: `Cotización u orden recibida y orquestada automáticamente.` }
        }
      });
    }

    return {
      account_name,
      account_id: accountId,
      project_name: proj.name,
      project_uuid: proj.id,
      tasks_created: tasksCreatedCount,
      finance_registered: financeCreated
    };
  } catch (err: any) {
    // Log Orchestration Error Centralized
    await supabase.from('events').insert({
      source: 'Kether',
      channel: 'system',
      type: 'ERROR',
      meta: {
        summary: `Falla en orquestación: ${err.message}`,
        reasoning: { payload: args, stack: err.stack }
      }
    });
    throw err;
  }
}

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (name === "get_workspace_context") {
    try {
      // Fetch dynamic active entities
      const { data: entities, error: eErr } = await supabase
        .from('entities')
        .select('name, role, type')
        .order('name');

      if (eErr) throw eErr;

      // Define static business rules that UI enforces
      const context = {
        allowed_areas: ['commercial', 'finance', 'operations', 'system'],
        allowed_task_statuses: ['todo', 'doing', 'done'],
        allowed_project_stages: ['opportunity', 'quoted', 'in_progress', 'completed', 'cancelled'],
        active_personnel: entities || []
      };

      return {
        content: [{ type: "text", text: JSON.stringify(context, null, 2) }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error fetching context: ${err.message}` }],
        isError: true,
      };
    }
  }

  if (name === "register_agent") {
    const { data, error } = await supabase
      .from('entities')
      .upsert({
        name: args?.name,
        role: args?.role,
        type: 'ai',
        config: args?.config || {}
      })
      .select()
      .single();

    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    return { content: [{ type: "text", text: `Agent registered: ${JSON.stringify(data)}` }] };
  }

  if (name === "upload_file") {
    // Basic implementation: upload to storage and register in task_files
    const bucket = 'task-attachments';
    const filePath = `${args?.task_id}/${args?.name}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, args?.content as string, {
        contentType: args?.type,
        upsert: true
      });

    if (uploadError) return { content: [{ type: "text", text: `Upload Error: ${uploadError.message}` }], isError: true };

    const { data: fileLink, error: linkError } = await supabase
      .from('task_files')
      .insert({
        task_id: args?.task_id,
        name: args?.name,
        url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`,
        type: args?.type,
        uploaded_by: 'Director Agent'
      })
      .select()
      .single();

    if (linkError) return { content: [{ type: "text", text: `Link Error: ${linkError.message}` }], isError: true };
    return { content: [{ type: "text", text: `File uploaded and linked: ${JSON.stringify(fileLink)}` }] };
  }

  if (name === "orchestrate_project") {
    try {
      const result = await performOrchestration(args, supabase);
      return {
        content: [{
          type: "text",
          text: `Orchestration Success:
- Account: ${result.account_name} (${result.account_id})
- Project: ${result.project_name} (UUID: ${result.project_uuid})
- Tasks created: ${result.tasks_created}`
        }]
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Orchestration Error: ${err.message}` }], isError: true };
    }
  }

  return new Promise((resolve) => {
    try {
      const workerUrl = new URL('./worker/sandbox.ts', import.meta.url).href;
      // ... rest of the existing worker logic
      const worker = new Worker(workerUrl, { type: "module" });
      const reqId = crypto.randomUUID();

      worker.onmessage = async (e) => {
        const { reqId: id, success, result, error } = e.data;
        if (id === reqId) {
          worker.terminate();
          if (success) {
            // Log successful execution (Simplified audit)
            if (name === "execute") {
              const supabaseClient = createClient(supabaseUrl, supabaseKey);
              await supabaseClient.from('events').insert({
                source: 'Kether',
                channel: 'system',
                type: 'mcp_execute_eval',
                meta: { code_executed: args?.code, success: true }
              });
            }
            resolve({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
          } else {
            const supabaseClient = createClient(supabaseUrl, supabaseKey);
            await supabaseClient.from('events').insert({
              source: 'Kether',
              channel: 'system',
              type: 'ERROR',
              meta: { summary: `Falla en MCP Execute: ${error}`, reasoning: { code: args?.code } }
            });
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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

  // 4. Stateless Call (Direct Tool Call)
  if (req.method === "POST" && path.endsWith("/mcp/call")) {
    const body = await req.json();
    const { name, arguments: toolArgs } = body;

    if (!name) return new Response("Missing tool name", { status: 400, headers: corsHeaders });

    // Reuse the same request handler logic by mocking the request object
    // Note: Since setRequestHandler is meant for the server instance, for a stateless call 
    // we can either trigger a server event or call the handler logic directly.
    // For simplicity here, we'll manually route it or use the server's callTool if exposed.

    // Actually, for a stateless call, we want to return the tool result.
    // We can use the 'server.callTool' if the SDK allows or just trigger the handler.
    // The cleanest way is to extract the handler logic.

    // For now, let's use a simplified direct execution for stateless calls
    // or better, use the server's internal dispatching if possible.

    // Let's just respond with instructions to use SSE or implement a direct logic.
    // Wait, Kether wants it NOW. I'll implement a direct bridge.

    try {
      const toolResult = await handleStatelessCall(name, toolArgs, supabaseUrl, supabaseKey);
      return new Response(JSON.stringify(toolResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});

// Helper for stateless calls
async function handleStatelessCall(name: string, args: any, url: string, key: string) {
  const supabase = createClient(url, key);

  try {
    if (name === "orchestrate_project") {
      const result = await performOrchestration(args, supabase);
      return { success: true, result };
    }

    if (name === "register_agent") {
      const { data, error } = await supabase.from('entities').upsert({
        name: args?.name,
        role: args?.role,
        type: 'ai',
        config: args?.config || {}
      }).select().single();
      if (error) throw error;
      return { success: true, data };
    }

    return { error: `Tool '${name}' not supported in stateless mode yet.` };
  } catch (err: any) {
    await supabase.from('events').insert({
      source: 'Kether',
      channel: 'system',
      type: 'ERROR',
      meta: { summary: `Falla Stateless [${name}]: ${err.message}`, reasoning: { args, stack: err.stack } }
    });
    throw err;
  }
}
