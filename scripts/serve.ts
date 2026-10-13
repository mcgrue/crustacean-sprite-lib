const root = new URL("../", import.meta.url);
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/") {
    return Response.redirect(
      new URL("/examples/canvas2d/index.html", url),
      302,
    );
  }
  const path = decodeURIComponent(url.pathname).slice(1);
  if (path.includes("..")) return new Response("Forbidden", { status: 403 });
  try {
    const headers = {
      "content-type": path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".html")
        ? "text/html"
        : path.endsWith(".png")
        ? "image/png"
        : "application/json",
    };
    return new Response(await Deno.readFile(new URL(path, root)), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

if (import.meta.main) {
  Deno.serve({ hostname: "127.0.0.1", port: 8000 }, handleRequest);
}
