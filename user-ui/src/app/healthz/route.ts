// Dedicated Kubernetes liveness/readiness target — see k8s/user-ui/deployment.yaml.
// Deliberately does nothing but respond: no data fetching, no rendering.
// Probing "/" instead (the real homepage) would trigger a full SSR render
// and a full round of API calls on every single health check.
export async function GET() {
  return new Response('ok', { status: 200 });
}
