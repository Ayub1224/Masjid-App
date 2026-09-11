import spec from '../../public/openapi.json';
export default function ApiDocs() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Mosque API reference</h1>
      <p className="my-5">
        Download the OpenAPI 3.1 file to import into Swagger Editor or Postman.
      </p>
      <a className="text-primary underline" href="/openapi.json" download>
        Download swagger / OpenAPI JSON
      </a>
      <div className="mt-8 space-y-4">
        {Object.entries(spec.paths).map(([path, methods]) =>
          Object.entries(methods).map(([method, operation]) => (
            <details
              key={path + method}
              className="rounded-xl border bg-card p-5"
            >
              <summary className="cursor-pointer font-medium">
                {method.toUpperCase()} {path}
              </summary>
              <p className="mt-3">{operation.summary}</p>
              <pre className="mt-4 overflow-auto text-xs">
                {JSON.stringify(operation, null, 2)}
              </pre>
            </details>
          )),
        )}
      </div>
    </main>
  );
}
