// Dedicated Kubernetes liveness/readiness target — see k8s/admin-ui/deployment.yaml.
// Deliberately does nothing but respond: no data fetching, no rendering.
export async function GET() {
  return new Response('ok', { status: 200 });
}
