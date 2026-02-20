/// <reference lib="deno.worker" />

self.onmessage = async (e: MessageEvent) => {
    const { type, code, payload, reqId } = e.data;

    try {
        let result;

        if (type === 'search') {
            // In a real scenario, this would be a full OpenAPI spec.
            // For Muze OS, we pass the current state of our resources.
            const fn = new Function('spec', `return (${code})(spec)`);
            result = await fn(payload);
        } else if (type === 'execute') {
            const { url, key } = payload;

            const muze = {
                /**
                 * Standard request wrapper for Muze OS.
                 * Paths starting with '/api' go to the Edge Function (muze-os-api).
                 * Other paths go to standard PostgREST /rest/v1.
                 */
                request: async (opts: { method: string, path: string, body?: any }) => {
                    const isEdgeApi = opts.path.startsWith('/api');
                    const endpoint = isEdgeApi
                        ? `${url}/functions/v1/muze-os-api${opts.path}`
                        : `${url}/rest/v1${opts.path}`;

                    const res = await fetch(endpoint, {
                        method: opts.method,
                        headers: {
                            'apikey': key,
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        },
                        body: opts.body ? JSON.stringify(opts.body) : undefined
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(`Execution Error [${res.status}]: ${errText}`);
                    }

                    if (res.status === 204) return null;
                    return await res.json();
                }
            };

            // Execute the agent's code
            const evalFn = new Function('muze', `return (${code})(muze)`);
            result = await evalFn(muze);
        }

        self.postMessage({ reqId, success: true, result });
    } catch (error: any) {
        self.postMessage({ reqId, success: false, error: error.message || String(error) });
    }
};
