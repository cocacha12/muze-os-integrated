/// <reference lib="deno.worker" />

// This worker script executes code within a restricted Deno environment.
// It receives a `code` string and a payload (either the `spec` or a `supabase` configuration object depending on the tool).

self.onmessage = async (e: MessageEvent) => {
    const { type, code, payload, reqId } = e.data;

    try {
        let result;

        if (type === 'search') {
            // 'payload' is the JSON spec
            const fn = new Function('spec', `return (${code})(spec)`);
            result = await fn(payload);
        } else if (type === 'execute') {
            // In a real worker, we can't easily pass complex SDK clients via postMessage (they can't be cloned).
            // For 'execute', 'payload' will be the raw Supabase URL and Key.
            // We instantiate a lightweight wrapper inside the worker to perform REST calls,
            // or dynamically import the Supabase client if network access is temporarily allowed.

            // For true Code Mode, we provide an authenticated `muze` request client 
            // similar to `cloudflare.request` in the blog post.

            const { url, key } = payload;

            const muze = {
                request: async (opts: { method: string, path: string, body?: any }) => {
                    const endpoint = `${url}/rest/v1${opts.path}`;
                    const res = await fetch(endpoint, {
                        method: opts.method,
                        headers: {
                            'apikey': key,
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation' // Always return affected rows
                        },
                        body: opts.body ? JSON.stringify(opts.body) : undefined
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(`API Error ${res.status}: ${errText}`);
                    }

                    // Return 204 No Content safely
                    if (res.status === 204) return null;
                    return await res.json();
                }
            };

            // Execute the LLM's code, injecting the `muze` client
            const fn = new Function('muze', `return (${code})(muze)`);
            result = await fn(muze);
        }

        self.postMessage({ reqId, success: true, result });
    } catch (error: any) {
        self.postMessage({ reqId, success: false, error: error.message || String(error) });
    }
};
